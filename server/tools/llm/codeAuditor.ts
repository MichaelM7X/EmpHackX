import { AuditRequest, AuditFinding } from "../../../src/types";
import { callOpenAIJson } from "../../openaiClient";

export interface CodeAuditResult {
  split_method: string | null;
  findings: AuditFinding[];
}

export async function auditPreprocessingCode(
  request: AuditRequest,
): Promise<CodeAuditResult> {
  if (!request.preprocessing_code) {
    return { split_method: null, findings: [] };
  }

  const systemPrompt = `You are an expert ML code auditor. Analyze preprocessing code 
to detect data leakage issues.

You must respond with ONLY valid JSON.`;

  const userPrompt = `Here is the preprocessing code:

\`\`\`python
${request.preprocessing_code}
\`\`\`

Analyze this code and answer:
1. What is the train/test split method? (random / time-based / group-based / unknown)
2. Is any preprocessing (scaling, encoding, imputation) fitted on the full dataset before splitting?
3. Are there aggregation features computed using data that might include future observations?
4. Any other data leakage concerns?

Respond in this exact JSON format:
{
  "split_method": "random" or "time-based" or "group-based" or "unknown",
  "issues": [
    {
      "description": "what the issue is",
      "code_reference": "the relevant line or pattern",
      "leakage_type": "structural" or "temporal" or "preprocessing",
      "severity": "critical" or "high" or "medium" or "low"
    }
  ]
}`;

  const result = await callOpenAIJson(systemPrompt, userPrompt);
  const issues = (result.issues as Array<Record<string, unknown>>) ?? [];

  const bucketMap: Record<string, string> = {
    structural: "Structure / pipeline leakage",
    temporal: "Time leakage",
    preprocessing: "Structure / pipeline leakage",
  };

  const findings: AuditFinding[] = issues.map((issue, i) => ({
    id: `code-audit-${i}`,
    title: String(issue.description ?? "Code issue detected"),
    macro_bucket: (bucketMap[String(issue.leakage_type ?? "")] ??
      "Structure / pipeline leakage") as AuditFinding["macro_bucket"],
    fine_grained_type: "evaluation" as AuditFinding["fine_grained_type"],
    severity: String(issue.severity ?? "medium") as AuditFinding["severity"],
    confidence: "high" as AuditFinding["confidence"],
    flagged_object: String(issue.code_reference ?? "preprocessing code"),
    evidence: [
      `Code analysis found: ${issue.description}`,
      `Relevant code: ${issue.code_reference ?? "N/A"}`,
    ],
    why_it_matters: "Code-level leakage is concrete and verifiable.",
    fix_recommendation: [
      "Fix the identified issue in your preprocessing pipeline.",
    ],
    needs_human_review: false,
  }));

  return {
    split_method: String(result.split_method ?? null),
    findings,
  };
}
