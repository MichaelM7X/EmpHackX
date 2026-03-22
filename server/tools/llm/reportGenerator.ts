import { AuditRequest, AuditFinding } from "../../../src/types";
import { callOpenAIText } from "../../openaiClient";

export async function generateNarrativeReport(
  request: AuditRequest,
  findings: AuditFinding[],
  overallRisk: string,
  safeFeatures: string[],
): Promise<string> {
  const findingsJson = JSON.stringify(
    findings.map((f) => ({
      feature: f.flagged_object,
      type: f.macro_bucket,
      severity: f.severity,
      evidence: f.evidence,
      fix: f.fix_recommendation,
    })),
    null,
    2,
  );

  const systemPrompt = `You are a senior data scientist writing an audit report.
Write a clear, professional narrative that explains each finding, its evidence, 
why it matters, and how to fix it. Write as if you are doing a code review for 
a colleague. Be direct, specific, and concise. Do not use markdown headers.
Keep it under 500 words.`;

  const userPrompt = `Prediction task: ${request.prediction_goal}
Target: ${request.target_column}
Prediction time point: ${request.prediction_time_point}
Overall risk: ${overallRisk.toUpperCase()}

Findings:
${findingsJson}

Safe features (passed all checks): ${safeFeatures.length > 0 ? safeFeatures.join(", ") : "none identified"}

Write the audit report as a natural language narrative.`;

  return callOpenAIText(systemPrompt, userPrompt);
}
