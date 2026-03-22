import { AuditRequest, AuditFinding } from "../../../src/types";
import { CodeAuditResult } from "../llm/codeAuditor";

export function structuralCheck(
  request: AuditRequest,
  codeAuditResult: CodeAuditResult | null,
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const entityKeys =
    codeAuditResult?.detected_entity_keys ??
    request.csv_columns.filter(
      (col) =>
        col.toLowerCase().endsWith("_id") ||
        col.toLowerCase().endsWith("_key") ||
        col.toLowerCase() === "id",
    );

  if (entityKeys.length === 0) return findings;

  let splitIsRandom = false;
  let confidence: "high" | "medium" = "medium";

  if (codeAuditResult?.split_method === "random") {
    splitIsRandom = true;
    confidence = "high";
  } else {
    const code = (request.preprocessing_code ?? "").toLowerCase();
    if (
      code.includes("train_test_split") &&
      !code.includes("groupkfold") &&
      !code.includes("timeseriessplit")
    ) {
      splitIsRandom = true;
      confidence = "medium";
    }
  }

  if (splitIsRandom) {
    findings.push({
      id: "structural-entity-leakage",
      title: "Entity-level leakage detected in train/test split",
      macro_bucket: "Structure / pipeline leakage",
      fine_grained_type: "join_entity",
      severity: "high",
      confidence,
      flagged_object: entityKeys.join(", "),
      evidence: [
        "Split method identified as random.",
        `Likely entity keys: ${entityKeys.join(", ")}.`,
        "Random split does not respect entity boundaries.",
      ],
      why_it_matters:
        "Model learns entity identity rather than generalizable patterns.",
      fix_recommendation: [
        `Use GroupKFold with group key = ${entityKeys[0]}.`,
      ],
      needs_human_review: false,
    });
  }

  return findings;
}
