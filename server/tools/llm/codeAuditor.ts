import { AuditRequest, AuditFinding } from "../../../src/types";
import { callOpenAIJson } from "../../openaiClient";

export interface CodeAuditResult {
  split_method: string | null;
  detected_entity_keys: string[];
  findings: AuditFinding[];
}

export async function auditPreprocessingCode(
  request: AuditRequest,
): Promise<CodeAuditResult> {
  const columnList = request.csv_columns.join(", ");

  const systemPrompt = `You are an expert ML code auditor. Analyze preprocessing code 
to detect data leakage issues.

Based on the CSV column names and preprocessing code, also identify:
- The train/test split method used
- Which columns are likely entity/group ID columns (e.g. user_id, patient_id, loan_id)

You must respond with ONLY valid JSON.`;

  const userPrompt = `Prediction task: ${request.prediction_goal}
Target column: ${request.target_column}
CSV columns: ${columnList}

Preprocessing code:

\`\`\`python
${request.preprocessing_code}
\`\`\`

Analyze this code and answer:
1. What is the train/test split method? (random / time-based / group-based / unknown)
2. Which columns appear to be entity/group ID columns that should be used for grouped splitting?
3. Is any preprocessing (scaling, encoding, imputation) fitted on the full dataset before splitting?
4. Are there aggregation features computed using data that might include future observations?
5. Any other data leakage concerns?

Respond in this exact JSON format:
{
  "split_method": "random" or "time-based" or "group-based" or "unknown",
  "detected_entity_keys": ["column_name_1", "column_name_2"],
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
    detected_entity_keys:
      (result.detected_entity_keys as string[]) ?? [],
    findings,
  };
}
