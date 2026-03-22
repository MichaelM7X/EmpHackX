import { AuditRequest, AuditFinding } from "../../../src/types";

export function metadataCheck(request: AuditRequest): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (request.timestamp_fields.length === 0) {
    findings.push({
      id: "missing-timestamp",
      title: "Prediction boundary cannot be verified without timestamps",
      macro_bucket: "Time leakage",
      fine_grained_type: "missing_metadata",
      severity: "medium",
      confidence: "low",
      flagged_object: "timestamp_fields",
      evidence: [
        "No timestamp fields provided.",
        "Temporal leakage checks will have reduced confidence.",
      ],
      why_it_matters:
        "Without timing metadata, time leakage cannot be confirmed.",
      fix_recommendation: [
        "Provide columns that define event time and prediction cutoff.",
      ],
      needs_human_review: true,
    });
  }

  if (request.entity_keys.length === 0) {
    findings.push({
      id: "missing-entity-keys",
      title: "Entity leakage cannot be checked without entity keys",
      macro_bucket: "Structure / pipeline leakage",
      fine_grained_type: "missing_metadata",
      severity: "low",
      confidence: "low",
      flagged_object: "entity_keys",
      evidence: [
        "No entity keys provided.",
        "Structural leakage detection is disabled.",
      ],
      why_it_matters:
        "Repeated entities across splits can inflate performance silently.",
      fix_recommendation: [
        "Provide the main grouping key (user_id, building_id, etc).",
      ],
      needs_human_review: true,
    });
  }

  return findings;
}
