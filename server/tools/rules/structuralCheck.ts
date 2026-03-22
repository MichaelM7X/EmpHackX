import { AuditRequest, AuditFinding } from "../../../src/types";
import { CodeAuditResult } from "../llm/codeAuditor";

export function structuralCheck(
  request: AuditRequest,
  codeAuditResult: CodeAuditResult | null,
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (request.entity_keys.length === 0) return findings;

  let splitIsRandom = false;
  let confidence: "high" | "medium" = "medium";

  if (codeAuditResult?.split_method === "random") {
    splitIsRandom = true;
    confidence = "high";
  } else if (
    (request.pipeline_notes ?? "").toLowerCase().includes("random split")
  ) {
    splitIsRandom = true;
    confidence = "medium";
  }

  if (splitIsRandom) {
    findings.push({
      id: "structural-entity-leakage",
      title: "Entity-level leakage detected in train/test split",
      macro_bucket: "Structure / pipeline leakage",
      fine_grained_type: "join_entity",
      severity: "high",
      confidence,
      flagged_object: request.entity_keys.join(", "),
      evidence: [
        "Split method identified as random.",
        `Entity keys: ${request.entity_keys.join(", ")}.`,
        "Random split does not respect entity boundaries.",
      ],
      why_it_matters:
        "Model learns entity identity rather than generalizable patterns.",
      fix_recommendation: [
        `Use GroupKFold with group key = ${request.entity_keys[0]}.`,
      ],
      needs_human_review: false,
    });
  }

  return findings;
}
