import { AuditRequest, AuditFinding, EvidenceItem } from "../../../src/types";
import { callOpenAIJson } from "../../openaiClient";
import { extractSnippet } from "../../utils";

export async function auditModelTrainingCode(
  request: AuditRequest,
): Promise<AuditFinding[]> {
  if (!request.model_training_code) return [];

  const columnList = request.csv_columns.join(", ");

  const systemPrompt = `You are an expert ML code auditor. Analyze model training code 
to detect data leakage and methodological issues.

Focus on:
- Feature selection or feature importance computed on the full dataset before splitting
- Hyperparameter tuning that uses test data
- Validation design issues (e.g. not using grouped or time-aware CV)
- Target leakage through feature engineering in the training pipeline

You must respond with ONLY valid JSON.`;

  const userPrompt = `Prediction task: ${request.prediction_goal}
Target column: ${request.target_column}
CSV columns: ${columnList}

Model training code:

\`\`\`python
${request.model_training_code}
\`\`\`

${request.preprocessing_code ? `Preprocessing code (for context):\n\n\`\`\`python\n${request.preprocessing_code}\n\`\`\`` : ""}

Analyze this training code for:
1. Is feature selection (SelectKBest, RFE, feature_importances_) done on the full dataset before splitting?
2. Is hyperparameter tuning (GridSearchCV, RandomizedSearchCV) using a proper validation strategy?
3. Does the validation split respect entity boundaries and time ordering?
4. Are there any other leakage or methodological issues?

Respond in this exact JSON format:
{
  "issues": [
    {
      "description": "what the issue is",
      "code_reference": "the relevant line or pattern",
      "leakage_type": "feature_selection" or "validation" or "preprocessing" or "other",
      "severity": "critical" or "high" or "medium" or "low",
      "evidence": [
        {
          "claim": "one concrete factual observation",
          "source": {
            "filename": "model_training_code.py",
            "location": "specific line or pattern (e.g. line 15, SelectKBest call)"
          }
        }
      ]
    }
  ]
}`;

  const result = await callOpenAIJson(systemPrompt, userPrompt);
  const issues = (result.issues as Array<Record<string, unknown>>) ?? [];

  const trainingCode = request.model_training_code ?? "";
  return issues.map((issue, i) => {
    const rawEvidence = (issue.evidence as Array<Record<string, unknown>>) ?? [];
    const codeRef = String(issue.code_reference ?? "");
    const evidence: EvidenceItem[] = rawEvidence.length > 0
      ? rawEvidence.map((e) => {
          const loc = String(((e.source as Record<string, unknown>)?.location) ?? codeRef || "N/A");
          const keyword = loc.replace(/^line\s*\d+[,:]?\s*/i, "").trim() || codeRef;
          return {
            claim: String((e.claim as string) ?? issue.description ?? "Issue detected"),
            source: {
              filename: String(((e.source as Record<string, unknown>)?.filename) ?? "model_training_code.py"),
              location: loc,
              snippet: keyword ? extractSnippet(trainingCode, keyword) : undefined,
            },
          };
        })
      : [
          {
            claim: `Training code analysis found: ${issue.description}`,
            source: {
              filename: "model_training_code.py",
              location: codeRef || "N/A",
              snippet: codeRef ? extractSnippet(trainingCode, codeRef) : undefined,
            },
          },
        ];

    return {
      id: `model-audit-${i}`,
      title: String(issue.description ?? "Training code issue detected"),
      macro_bucket: "Structure / pipeline leakage" as AuditFinding["macro_bucket"],
      fine_grained_type: "evaluation" as AuditFinding["fine_grained_type"],
      severity: String(issue.severity ?? "medium") as AuditFinding["severity"],
      confidence: "high" as AuditFinding["confidence"],
      flagged_object: String(issue.code_reference ?? "training code"),
      evidence,
      why_it_matters:
        "Training pipeline leakage can inflate validation metrics and hide real performance.",
      fix_recommendation: ["Fix the identified issue in your model training pipeline."],
      needs_human_review: false,
    };
  });
}
