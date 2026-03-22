import { AuditRequest, AuditReport, AuditFinding } from "../src/types";
import { pipelineScan } from "./tools/rules/pipelineScan";
import { metadataCheck } from "./tools/rules/metadataCheck";
import { structuralCheck } from "./tools/rules/structuralCheck";
import { detectProxyLeakage } from "./tools/llm/proxyDetector";
import { detectTemporalLeakage } from "./tools/llm/temporalDetector";
import {
  auditPreprocessingCode,
  CodeAuditResult,
} from "./tools/llm/codeAuditor";
import { generateNarrativeReport } from "./tools/llm/reportGenerator";
import {
  dedupeFindings,
  computeOverallRisk,
  computeSafeFeatures,
} from "./utils";

export async function runAudit(request: AuditRequest): Promise<AuditReport> {
  const findings: AuditFinding[] = [];

  // Step 1: rule-engine tools (synchronous, instant)
  findings.push(...pipelineScan(request));
  findings.push(...metadataCheck(request));

  // Step 2: LLM tools (parallel for speed)
  const [proxyFindings, temporalFindings] = await Promise.all([
    detectProxyLeakage(request),
    detectTemporalLeakage(request),
  ]);
  findings.push(...proxyFindings);
  findings.push(...temporalFindings);

  // Step 3: optional code audit (only when user uploaded code)
  let codeAuditResult: CodeAuditResult | null = null;
  if (request.preprocessing_code) {
    codeAuditResult = await auditPreprocessingCode(request);
    findings.push(...codeAuditResult.findings);
  }

  // Step 4: structural check (may use code audit result)
  findings.push(...structuralCheck(request, codeAuditResult));

  // Step 5: dedupe + risk aggregation
  const dedupedFindings = dedupeFindings(findings);
  const overallRisk = computeOverallRisk(dedupedFindings);
  const safeFeatures = computeSafeFeatures(
    request.feature_dictionary,
    dedupedFindings,
  );

  // Step 6: generate narrative report
  const narrative = await generateNarrativeReport(
    request,
    dedupedFindings,
    overallRisk,
    safeFeatures,
  );

  // Assemble final report
  const bucketSummary = {
    "Time leakage": 0,
    "Feature / proxy leakage": 0,
    "Structure / pipeline leakage": 0,
  };
  for (const f of dedupedFindings) {
    if (f.macro_bucket in bucketSummary) {
      bucketSummary[f.macro_bucket as keyof typeof bucketSummary] += 1;
    }
  }

  const missingMetadata = dedupedFindings
    .filter((f) => f.fine_grained_type === "missing_metadata")
    .map((f) => f.flagged_object);

  const fixPlan = [
    ...new Set(dedupedFindings.flatMap((f) => f.fix_recommendation)),
  ].slice(0, 8);

  const clarifyingQuestions = [
    ...missingMetadata.map((field) =>
      field === "timestamp_fields"
        ? "Which columns define feature time, prediction cutoff, and outcome time?"
        : "Which stable entity key should validation group on?",
    ),
    ...dedupedFindings
      .filter((f) => f.needs_human_review)
      .map(
        (f) =>
          `Can a human reviewer confirm when ${f.flagged_object} becomes available relative to the prediction boundary?`,
      ),
  ];

  return {
    overall_risk: overallRisk,
    summary: `Audit complete. Overall risk: ${overallRisk.toUpperCase()}. Found ${dedupedFindings.length} issue(s).`,
    narrative_report: narrative,
    findings: dedupedFindings,
    safe_features: safeFeatures,
    missing_metadata: [...new Set(missingMetadata)],
    clarifying_questions: [...new Set(clarifyingQuestions)],
    fix_plan: fixPlan,
    bucket_summary: bucketSummary,
  };
}
