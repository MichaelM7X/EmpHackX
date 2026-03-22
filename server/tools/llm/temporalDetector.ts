import { AuditRequest, AuditFinding, EvidenceItem } from "../../../src/types";
import { callOpenAIJson } from "../../openaiClient";
import { extractSnippet } from "../../utils";

export async function detectTemporalLeakage(
  request: AuditRequest,
): Promise<AuditFinding[]> {
  const featureColumns = request.csv_columns.filter(
    (c) => c !== request.target_column,
  );
  const featureList = featureColumns.map((f) => `- ${f}`).join("\n");

  const systemPrompt = `You are an expert ML auditor specializing in temporal data leakage.
Analyze each feature column to determine if its computation might use data from after the 
prediction time point.

Based on the prediction task description and the preprocessing code, infer when the 
prediction happens, then determine if each feature could contain future information.

You must respond with ONLY valid JSON.`;

  const userPrompt = `Prediction task: ${request.prediction_goal}

Feature columns to analyze:
${featureList}

Preprocessing code context:
${request.preprocessing_code}

For each feature, determine:
1. Could this feature's value include information from after the inferred prediction time point?
2. Does the feature name suggest aggregations (mean, sum, count, total, avg) that might span beyond the prediction boundary?
3. Is the feature only knowable after the outcome has occurred?

Respond in this exact JSON format:
{
  "analysis": [
    {
      "feature_name": "...",
      "has_temporal_leakage": true or false,
      "reasoning": "one sentence explanation",
      "confidence": "high" or "medium" or "low",
      "evidence": [
        {
          "claim": "one concrete factual observation",
          "source": {
            "filename": "dataset.csv",
            "location": "column name or relevant code location (e.g. column 'feature_name', or preprocessing_code.py line 23)"
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
    if (!item.has_temporal_leakage) continue;

    const conf = String(item.confidence ?? "medium");

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
            claim: String((e.claim as string) ?? item.reasoning ?? "Temporal leakage risk detected"),
            source: { filename: fname, location: loc, snippet },
          };
        })
      : [
          {
            claim: String(item.reasoning ?? "LLM detected temporal leakage risk."),
            source: { filename: "dataset.csv", location: `column '${featureName}'`, snippet: featureName },
          },
        ];

    findings.push({
      id: `temporal-${featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `${featureName} may use future data`,
      macro_bucket: "Time leakage",
      fine_grained_type: "temporal",
      severity: conf === "high" ? "high" : "medium",
      confidence: conf as AuditFinding["confidence"],
      flagged_object: featureName,
      evidence,
      why_it_matters:
        "Features computed with future data make the model appear accurate but fail in production.",
      fix_recommendation: [
        `Recompute ${featureName} using only data available at the prediction time point.`,
      ],
      needs_human_review: conf !== "high",
    });
  }

  return findings;
}
