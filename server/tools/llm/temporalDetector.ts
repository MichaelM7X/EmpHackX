import { AuditRequest, AuditFinding } from "../../../src/types";
import { callOpenAIJson } from "../../openaiClient";

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
      "confidence": "high" or "medium" or "low"
    }
  ]
}`;

  const result = await callOpenAIJson(systemPrompt, userPrompt);
  const analysis = (result.analysis as Array<Record<string, unknown>>) ?? [];
  const findings: AuditFinding[] = [];

  for (const item of analysis) {
    if (!item.has_temporal_leakage) continue;

    const conf = String(item.confidence ?? "medium");

    findings.push({
      id: `temporal-${String(item.feature_name ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `${item.feature_name} may use future data`,
      macro_bucket: "Time leakage",
      fine_grained_type: "temporal",
      severity: conf === "high" ? "high" : "medium",
      confidence: conf as AuditFinding["confidence"],
      flagged_object: String(item.feature_name),
      evidence: [
        String(item.reasoning ?? "LLM detected temporal leakage risk."),
      ],
      why_it_matters:
        "Features computed with future data make the model appear accurate but fail in production.",
      fix_recommendation: [
        `Recompute ${item.feature_name} using only data available at the prediction time point.`,
      ],
      needs_human_review: conf !== "high",
    });
  }

  return findings;
}
