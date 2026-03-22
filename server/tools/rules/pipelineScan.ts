import { AuditRequest, AuditFinding } from "../../../src/types";

export function pipelineScan(request: AuditRequest): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const code = (request.preprocessing_code ?? "").toLowerCase();

  if (!code) return findings;

  const hasRandomSplit =
    code.includes("train_test_split") &&
    !code.includes("groupkfold") &&
    !code.includes("groupshufflesplit") &&
    !code.includes("timeseriessplit");

  const hasIdColumns = request.csv_columns.some(
    (col) =>
      col.toLowerCase().endsWith("_id") ||
      col.toLowerCase().endsWith("_key") ||
      col.toLowerCase() === "id",
  );

  if (hasRandomSplit && hasIdColumns) {
    const idCols = request.csv_columns.filter(
      (col) =>
        col.toLowerCase().endsWith("_id") ||
        col.toLowerCase().endsWith("_key") ||
        col.toLowerCase() === "id",
    );
    findings.push({
      id: "pipeline-random-split-entity",
      title: "Random split may leak repeated entities",
      macro_bucket: "Structure / pipeline leakage",
      fine_grained_type: "join_entity",
      severity: "high",
      confidence: "medium",
      flagged_object: idCols.join(", "),
      evidence: [
        "Preprocessing code uses train_test_split without group-based splitting.",
        `Likely entity ID columns detected: ${idCols.join(", ")}.`,
      ],
      why_it_matters:
        "Model may memorize entity identity instead of learning the task.",
      fix_recommendation: ["Use GroupKFold split keyed by entity ID."],
      needs_human_review: false,
    });
  }

  const globalPatterns = [
    { pattern: "fit(", label: "fit() called (possible global preprocessing)" },
    {
      pattern: "fit_transform(",
      label: "fit_transform() called (possible global preprocessing)",
    },
  ];

  const hasSplit =
    code.includes("train_test_split") ||
    code.includes("kfold") ||
    code.includes("split(");

  for (const { pattern, label } of globalPatterns) {
    const fitIndex = code.indexOf(pattern);
    const splitIndex = Math.min(
      ...[
        code.indexOf("train_test_split"),
        code.indexOf("kfold"),
        code.indexOf("split("),
      ].filter((i) => i >= 0),
    );

    if (fitIndex >= 0 && hasSplit && fitIndex < splitIndex) {
      findings.push({
        id: "pipeline-global-preprocessing",
        title: "Global preprocessing may mix future information",
        macro_bucket: "Structure / pipeline leakage",
        fine_grained_type: "evaluation",
        severity: "medium",
        confidence: "medium",
        flagged_object: "pipeline preprocessing",
        evidence: [
          `Code contains ${label} before the train/test split.`,
          "Preprocessing fitted before split leaks test distribution into training.",
        ],
        why_it_matters:
          "Even clean features become tainted if preprocessing sees test data.",
        fix_recommendation: [
          "Fit preprocessing inside each training fold only.",
        ],
        needs_human_review: false,
      });
      break;
    }
  }

  return findings;
}
