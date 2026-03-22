import { AuditRequest, AuditFinding } from "../../../src/types";

export function pipelineScan(request: AuditRequest): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const notes = (request.pipeline_notes ?? "").toLowerCase();

  if (!notes) return findings;

  if (notes.includes("random split") && request.entity_keys.length > 0) {
    findings.push({
      id: "pipeline-random-split-entity",
      title: "Random split may leak repeated entities",
      macro_bucket: "Structure / pipeline leakage",
      fine_grained_type: "join_entity",
      severity: "high",
      confidence: "medium",
      flagged_object: request.entity_keys.join(", "),
      evidence: [
        "Pipeline notes mention random split.",
        `Entity keys provided: ${request.entity_keys.join(", ")}.`,
      ],
      why_it_matters:
        "Model may memorize entity identity instead of learning the task.",
      fix_recommendation: ["Use GroupKFold split keyed by entity ID."],
      needs_human_review: false,
    });
  }

  const globalKeywords = [
    "full dataset",
    "all rows",
    "globally",
    "before split",
    "all available",
  ];
  if (globalKeywords.some((kw) => notes.includes(kw))) {
    findings.push({
      id: "pipeline-global-preprocessing",
      title: "Global preprocessing may mix future information",
      macro_bucket: "Structure / pipeline leakage",
      fine_grained_type: "evaluation",
      severity: "medium",
      confidence: "medium",
      flagged_object: "pipeline preprocessing",
      evidence: [
        "Pipeline notes mention global or full-dataset computation.",
        "Preprocessing fitted before split leaks test distribution into training.",
      ],
      why_it_matters:
        "Even clean features become tainted if preprocessing sees test data.",
      fix_recommendation: ["Fit preprocessing inside each training fold only."],
      needs_human_review: false,
    });
  }

  return findings;
}
