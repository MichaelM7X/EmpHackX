import { AuditRequest, AuditFinding, EvidenceItem } from "../../../src/types";
import { callOpenAIJson } from "../../openaiClient";
import { extractSnippet } from "../../utils";

export async function detectProxyLeakage(
  request: AuditRequest,
): Promise<AuditFinding[]> {
  const featureColumns = request.csv_columns.filter(
    (c) => c !== request.target_column,
  );
  const featureList = featureColumns.map((f) => `- ${f}`).join("\n");

  const systemPrompt = `You are an expert ML auditor specializing in data leakage detection.
Analyze each feature column and determine if it is a target proxy — meaning it is causally 
downstream of the label, or is essentially a restatement of the label.

Based on the prediction task description, infer when the prediction happens, then analyze
whether each feature would realistically be available at that time.

You must respond with ONLY valid JSON.`;

  const userPrompt = `Prediction task: ${request.prediction_goal}
Target column: ${request.target_column}

Feature columns to analyze:
${featureList}

Preprocessing code context:
${request.preprocessing_code}

For each feature, determine:
1. Is this feature causally upstream (a legitimate predictor) or downstream (a result/proxy) of the target?
2. Based on the prediction task, would this feature realistically be available at prediction time?

Respond in this exact JSON format:
{
  "analysis": [
    {
      "feature_name": "...",
      "is_proxy": true or false,
      "reasoning": "one sentence explanation",
      "confidence": "high" or "medium" or "low",
      "evidence": [
        {
          "claim": "one concrete factual observation",
          "source": {
            "filename": "dataset.csv",
            "location": "column name or row range (e.g. column 'feature_name', rows 1-N)"
          }
        }
      ]
    }
  ]
}`;

  const result = await callOpenAIJson(systemPrompt, userPrompt);
  const analysis = (result.analysis as Array<Record<string, unknown>>) ?? [];
  const findings: AuditFinding[] = [];

  for (const item of analysis) {
    if (!item.is_proxy) continue;

    const conf = String(item.confidence ?? "medium");
    const severityMap: Record<string, string> = {
      high: "critical",
      medium: "high",
      low: "medium",
    };

    const rawEvidence = (item.evidence as Array<Record<string, unknown>>) ?? [];
    const featureName = String(item.feature_name ?? "unknown");
    const code = request.preprocessing_code ?? "";
    const evidence: EvidenceItem[] = rawEvidence.length > 0
      ? rawEvidence.map((e) => {
          const fname = String(((e.source as Record<string, unknown>)?.filename) ?? "dataset.csv");
          const loc = String(((e.source as Record<string, unknown>)?.location) ?? `column '${item.feature_name}'`);
          const snippet = fname.includes(".py") || fname.includes("code")
            ? extractSnippet(code, featureName)
            : featureName;
          return {
            claim: String((e.claim as string) ?? item.reasoning ?? "Proxy leakage risk detected"),
            source: { filename: fname, location: loc, snippet },
          };
        })
      : [
          {
            claim: String(item.reasoning ?? "LLM detected proxy leakage risk."),
            source: { filename: "dataset.csv", location: `column '${featureName}'`, snippet: featureName },
          },
        ];

    findings.push({
      id: `proxy-${featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `${featureName} appears to be a proxy for the target`,
      macro_bucket: "Feature / proxy leakage",
      fine_grained_type: "proxy",
      severity: (severityMap[conf] ?? "medium") as AuditFinding["severity"],
      confidence: conf as AuditFinding["confidence"],
      flagged_object: featureName,
      evidence,
      why_it_matters:
        "The model may be reading the answer key instead of learning predictive patterns.",
      fix_recommendation: [
        `Remove ${featureName} from the feature set, or redefine the prediction boundary.`,
      ],
      needs_human_review: conf !== "high",
    });
  }

  return findings;
}
