import { AuditRequest, AuditFinding } from "../../../src/types";
import { callOpenAIJson } from "../../openaiClient";

export async function detectProxyLeakage(
  request: AuditRequest,
): Promise<AuditFinding[]> {
  const featureList = request.feature_dictionary
    .map((f) => `- ${f.name}: ${f.description}`)
    .join("\n");

  const systemPrompt = `You are an expert ML auditor specializing in data leakage detection.
Analyze each feature and determine if it is a target proxy — meaning it is causally 
downstream of the label, or is essentially a restatement of the label.

You must respond with ONLY valid JSON.`;

  const userPrompt = `Prediction task: ${request.prediction_goal}
Target column: ${request.target_column}
Prediction time point: ${request.prediction_time_point}

Features to analyze:
${featureList}

For each feature, determine:
1. Is this feature causally upstream (a legitimate predictor) or downstream (a result/proxy) of the target?
2. At the prediction time point, would this feature realistically be available?

Respond in this exact JSON format:
{
  "analysis": [
    {
      "feature_name": "...",
      "is_proxy": true or false,
      "reasoning": "one sentence explanation",
      "confidence": "high" or "medium" or "low"
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

    findings.push({
      id: `proxy-${String(item.feature_name ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `${item.feature_name} appears to be a proxy for the target`,
      macro_bucket: "Feature / proxy leakage",
      fine_grained_type: "proxy",
      severity: (severityMap[conf] ?? "medium") as AuditFinding["severity"],
      confidence: conf as AuditFinding["confidence"],
      flagged_object: String(item.feature_name),
      evidence: [String(item.reasoning ?? "LLM detected proxy leakage risk.")],
      why_it_matters:
        "The model may be reading the answer key instead of learning predictive patterns.",
      fix_recommendation: [
        `Remove ${item.feature_name} from the feature set, or redefine the prediction boundary.`,
      ],
      needs_human_review: conf !== "high",
    });
  }

  return findings;
}
