import {
  AuditFinding,
  AuditReport,
  AuditRequest,
  DemoCaseConfig,
  DemoSignalTemplate,
  FeatureDictionaryEntry,
  MacroBucket,
  Severity,
} from "../types";

const severityRank: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const emptyBucketSummary = (): Record<MacroBucket, number> => ({
  "Time leakage": 0,
  "Feature / proxy leakage": 0,
  "Structure / pipeline leakage": 0,
});

const normalize = (value: string) => value.trim().toLowerCase();

const makeId = (value: string) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const unique = <T,>(items: T[]) => Array.from(new Set(items));

function includesAny(haystack: string, needles: string[]) {
  const normalizedHaystack = normalize(haystack);
  return needles.some((needle) => normalizedHaystack.includes(normalize(needle)));
}

function createFinding(template: DemoSignalTemplate, flaggedObject: string): AuditFinding {
  return {
    id: `${makeId(template.title)}-${makeId(flaggedObject)}`,
    title: template.title,
    macro_bucket: template.macro_bucket,
    fine_grained_type: template.fine_grained_type,
    severity: template.severity,
    confidence: template.confidence,
    flagged_object: flaggedObject,
    evidence: template.evidence,
    why_it_matters: template.why_it_matters,
    fix_recommendation: template.fix_recommendation,
    needs_human_review: Boolean(template.needs_human_review),
  };
}

function getFeatureText(feature: FeatureDictionaryEntry) {
  return [
    feature.name,
    feature.description,
    feature.availability ?? "",
    ...(feature.semantic_tags ?? []),
  ].join(" ");
}

function matchTemplate(
  request: AuditRequest,
  feature: FeatureDictionaryEntry | null,
  template: DemoSignalTemplate,
) {
  if (template.match_scope === "pipeline") {
    return includesAny(request.pipeline_notes, template.match_keywords);
  }

  if (template.match_scope === "request") {
    const requestText = [
      request.prediction_goal,
      request.target_column,
      request.timestamp_fields.join(" "),
      request.entity_keys.join(" "),
      request.pipeline_notes,
    ].join(" ");
    return includesAny(requestText, template.match_keywords);
  }

  if (!feature) {
    return false;
  }

  return includesAny(getFeatureText(feature), template.match_keywords);
}

function deriveTemplateFindings(
  request: AuditRequest,
  demoCase: DemoCaseConfig,
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const template of demoCase.signal_templates) {
    if (template.match_scope === "feature") {
      const matchedFeature = request.feature_dictionary.find((feature) =>
        matchTemplate(request, feature, template),
      );

      if (matchedFeature) {
        findings.push(createFinding(template, matchedFeature.name));
      }

      continue;
    }

    if (matchTemplate(request, null, template)) {
      findings.push(createFinding(template, template.object_name));
    }
  }

  return findings;
}

function deriveGenericFindingFromFeature(feature: FeatureDictionaryEntry): AuditFinding[] {
  const tags = feature.semantic_tags ?? [];
  const findings: AuditFinding[] = [];

  const addFinding = (
    title: string,
    macro_bucket: MacroBucket,
    fine_grained_type: AuditFinding["fine_grained_type"],
    severity: Severity,
    evidence: string[],
    why: string,
    fix: string[],
  ) => {
    findings.push({
      id: `${makeId(title)}-${makeId(feature.name)}`,
      title,
      macro_bucket,
      fine_grained_type,
      severity,
      confidence: "medium",
      flagged_object: feature.name,
      evidence,
      why_it_matters: why,
      fix_recommendation: fix,
      needs_human_review: feature.availability === "unknown",
    });
  };

  if (tags.includes("aggregation_lookahead")) {
    addFinding(
      "Derived aggregate appears to use future observations",
      "Time leakage",
      "aggregation_lookahead",
      "high",
      [
        `${feature.name} is tagged as a derived aggregate.`,
        "Derived aggregates often leak future records if they are not cut at the decision boundary.",
      ],
      "Aggregates can look harmless while still pulling in records that were not available at prediction time.",
      [
        "Audit the aggregation window and recompute it with only pre-cutoff rows.",
        "Store the aggregation timestamp alongside the derived feature.",
      ],
    );
  } else if (tags.includes("time_leakage")) {
    addFinding(
      "Feature availability appears to cross the prediction boundary",
      "Time leakage",
      "temporal",
      "high",
      [
        `${feature.name} is tagged as unavailable at the decision moment.`,
        "The description suggests the feature is observed after the target window begins.",
      ],
      "The model may be using future information rather than information available when the decision is made.",
      [
        "Restrict the feature to pre-decision measurements.",
        "Document the true feature timestamp in the data dictionary.",
      ],
    );
  }

  if (tags.includes("label_definition")) {
    addFinding(
      "Feature behaves like a near-restatement of the label",
      "Feature / proxy leakage",
      "label_definition",
      "critical",
      [
        `${feature.name} is tagged as a label-definition risk.`,
        "The feature likely captures the outcome more directly than an upstream predictor should.",
      ],
      "The model can appear impressively accurate while mostly reading the answer key.",
      [
        "Remove the feature from model training.",
        "Redefine the task boundary so label-adjacent fields cannot enter the feature matrix.",
      ],
    );
  } else if (tags.includes("proxy_leakage")) {
    addFinding(
      "Feature looks like a downstream proxy for the outcome",
      "Feature / proxy leakage",
      "proxy",
      "high",
      [
        `${feature.name} is tagged as a proxy leakage risk.`,
        "Its description suggests it is produced by downstream workflow or outcome handling.",
      ],
      "Proxy variables can make a model look strong while hiding that it depends on post-outcome behavior or intervention signals.",
      [
        "Remove the feature or re-stage the task so the feature is legitimately available.",
        "Review the feature with a human expert if its generation timing is ambiguous.",
      ],
    );
  }

  return findings;
}

function deriveGenericPipelineFindings(request: AuditRequest): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const notes = normalize(request.pipeline_notes);

  if (
    notes.includes("random split") &&
    request.entity_keys.length > 0 &&
    (notes.includes("same") ||
      notes.includes("multiple") ||
      notes.includes("grouped") ||
      notes.includes("building") ||
      notes.includes("landlord") ||
      notes.includes("borrower") ||
      notes.includes("patient"))
  ) {
    findings.push({
      id: "generic-random-split-entity-leakage",
      title: "Random split may be leaking repeated entities",
      macro_bucket: "Structure / pipeline leakage",
      fine_grained_type: "join_entity",
      severity: "high",
      confidence: "medium",
      flagged_object: request.entity_keys.join(", "),
      evidence: [
        "Pipeline notes mention a random split.",
        `Entity keys are provided: ${request.entity_keys.join(", ")}.`,
      ],
      why_it_matters:
        "When related entities appear in both train and test, the model can memorize identity-specific patterns instead of learning the task.",
      fix_recommendation: [
        "Use grouped validation keyed by the repeated entity.",
        "Review whether time-aware validation is also needed.",
      ],
      needs_human_review: false,
    });
  }

  if (
    notes.includes("full dataset") ||
    notes.includes("all rows") ||
    notes.includes("globally") ||
    notes.includes("all available months")
  ) {
    findings.push({
      id: "generic-global-aggregation-leakage",
      title: "Global preprocessing may be mixing future information",
      macro_bucket: "Structure / pipeline leakage",
      fine_grained_type: "evaluation",
      severity: "medium",
      confidence: "medium",
      flagged_object: "pipeline preprocessing",
      evidence: [
        "Pipeline notes mention global or full-dataset computation.",
        "This often leaks future or test information into model development.",
      ],
      why_it_matters:
        "Even when the feature list looks reasonable, evaluation can still be invalid if preprocessing is fitted globally.",
      fix_recommendation: [
        "Fit preprocessing inside each training fold only.",
        "Separate feature generation from evaluation data carefully.",
      ],
      needs_human_review: false,
    });
  }

  return findings;
}

function deriveMissingMetadata(request: AuditRequest): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (request.timestamp_fields.length === 0) {
    findings.push({
      id: "missing-timestamp-metadata",
      title: "Prediction boundary cannot be verified without timestamps",
      macro_bucket: "Time leakage",
      fine_grained_type: "missing_metadata",
      severity: "medium",
      confidence: "low",
      flagged_object: "timestamp_fields",
      evidence: [
        "No timestamp fields were supplied.",
        "Without timing metadata, time leakage cannot be ruled out confidently.",
      ],
      why_it_matters:
        "LeakGuard can flag suspicious semantics, but it should not claim strong temporal certainty without timestamps.",
      fix_recommendation: [
        "Provide the columns that define event time, feature time, and outcome time.",
        "Document the prediction cutoff and observation window explicitly.",
      ],
      needs_human_review: true,
    });
  }

  if (request.entity_keys.length === 0) {
    findings.push({
      id: "missing-entity-metadata",
      title: "Repeated-entity leakage cannot be checked without entity keys",
      macro_bucket: "Structure / pipeline leakage",
      fine_grained_type: "missing_metadata",
      severity: "low",
      confidence: "low",
      flagged_object: "entity_keys",
      evidence: [
        "No entity keys were supplied.",
        "Grouped leakage checks need a patient, borrower, building, or similar identifier.",
      ],
      why_it_matters:
        "Split design can look valid while still leaking repeated entities across train and test.",
      fix_recommendation: [
        "Add the main grouping key used to define repeated entities.",
        "If there is no stable entity, document the closest grouping strategy available.",
      ],
      needs_human_review: true,
    });
  }

  return findings;
}

function dedupeFindings(findings: AuditFinding[]) {
  const byId = new Map<string, AuditFinding>();

  for (const finding of findings) {
    const existing = byId.get(finding.id);
    if (!existing || severityRank[finding.severity] > severityRank[existing.severity]) {
      byId.set(finding.id, finding);
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) => severityRank[right.severity] - severityRank[left.severity],
  );
}

function computeOverallRisk(findings: AuditFinding[]): Severity {
  if (findings.some((finding) => finding.severity === "critical")) {
    return "critical";
  }

  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;

  if (highCount >= 1) {
    return "high";
  }

  if (mediumCount >= 2) {
    return "medium";
  }

  return findings.length > 0 ? "low" : "low";
}

export function auditRequest(
  request: AuditRequest,
  demoCase: DemoCaseConfig,
): AuditReport {
  const caseFindings = deriveTemplateFindings(request, demoCase);
  const genericFeatureFindings = request.feature_dictionary.flatMap((feature) =>
    deriveGenericFindingFromFeature(feature),
  );
  const genericPipelineFindings = deriveGenericPipelineFindings(request);
  const metadataFindings = deriveMissingMetadata(request);
  const findings = dedupeFindings([
    ...caseFindings,
    ...genericFeatureFindings,
    ...genericPipelineFindings,
    ...metadataFindings,
  ]);

  const bucketSummary = findings.reduce((summary, finding) => {
    summary[finding.macro_bucket] += 1;
    return summary;
  }, emptyBucketSummary());

  const overallRisk = computeOverallRisk(findings);
  const missingMetadata = unique(
    findings
      .filter((finding) => finding.fine_grained_type === "missing_metadata")
      .map((finding) => finding.flagged_object),
  );
  const fixPlan = unique(findings.flatMap((finding) => finding.fix_recommendation)).slice(0, 8);
  const clarifyingQuestions = unique([
    ...missingMetadata.map((field) =>
      field === "timestamp_fields"
        ? "Which columns define feature time, prediction cutoff, and outcome time?"
        : "Which stable entity key should validation group on?",
    ),
    ...findings
      .filter((finding) => finding.needs_human_review)
      .map(
        (finding) =>
          `Can a human reviewer confirm when ${finding.flagged_object} becomes available relative to the prediction boundary?`,
      ),
  ]);

  const topFinding = findings[0];
  const summary = topFinding
    ? `${demoCase.title} is assessed as ${overallRisk.toUpperCase()} risk. The leading issue is ${topFinding.flagged_object}, and LeakGuard also found ${findings.length - 1} additional integrity concerns.`
    : `${demoCase.title} has no major leakage flags with the current metadata, but more context could still change the audit.`;

  return {
    overall_risk: overallRisk,
    summary,
    findings,
    missing_metadata: missingMetadata,
    clarifying_questions: clarifyingQuestions,
    fix_plan: fixPlan,
    bucket_summary: bucketSummary,
    report_note: demoCase.source_note,
  };
}

export function answerQuestion(
  question: string,
  report: AuditReport,
  demoCase: DemoCaseConfig,
): string {
  const normalizedQuestion = normalize(question);

  const matchedFinding = report.findings.find((finding) => {
    const fieldName = normalize(finding.flagged_object);
    const title = normalize(finding.title);
    return normalizedQuestion.includes(fieldName) || normalizedQuestion.includes(title);
  });

  if (normalizedQuestion.includes("fix") || normalizedQuestion.includes("change")) {
    return `Top fixes: ${report.fix_plan.slice(0, 3).join(" ")}`;
  }

  if (normalizedQuestion.includes("risk")) {
    return `${report.summary} Bucket counts: time ${report.bucket_summary["Time leakage"]}, proxy ${report.bucket_summary["Feature / proxy leakage"]}, structure ${report.bucket_summary["Structure / pipeline leakage"]}.`;
  }

  if (
    normalizedQuestion.includes("source") ||
    normalizedQuestion.includes("paper") ||
    normalizedQuestion.includes("jama")
  ) {
    return demoCase.source_note
      ? `${demoCase.source_note} Source: ${demoCase.source_label}.`
      : "This case is a curated demo rather than a literature-backed one, so the main source of truth is the uploaded metadata and findings.";
  }

  if (normalizedQuestion.includes("metadata") || normalizedQuestion.includes("missing")) {
    return report.clarifying_questions.length > 0
      ? `LeakGuard still wants clarification on: ${report.clarifying_questions.join(" ")}`
      : "The current intake includes enough metadata for a first-pass audit, though more pipeline detail would still sharpen confidence.";
  }

  if (matchedFinding) {
    return `${matchedFinding.flagged_object} is flagged under ${matchedFinding.macro_bucket} (${matchedFinding.fine_grained_type}). ${matchedFinding.evidence.join(" ")} Recommended action: ${matchedFinding.fix_recommendation[0]}`;
  }

  return `${demoCase.narrator_line} Right now the strongest concerns are ${report.findings
    .slice(0, 2)
    .map((finding) => finding.flagged_object)
    .join(" and ")}.`;
}

export function parseCsvHeader(text: string): string[] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];

    if (character === '"') {
      const nextCharacter = firstLine[index + 1];
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.length > 0 || firstLine.endsWith(",")) {
    values.push(current.trim());
  }

  return values.filter(Boolean);
}
