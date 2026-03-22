import { AuditRequest, AuditReport, AuditFinding } from "../src/types";
import { pipelineScan } from "./tools/rules/pipelineScan";
import { structuralCheck } from "./tools/rules/structuralCheck";
import { detectProxyLeakage } from "./tools/llm/proxyDetector";
import { detectTemporalLeakage } from "./tools/llm/temporalDetector";
import {
  auditPreprocessingCode,
  CodeAuditResult,
} from "./tools/llm/codeAuditor";
import { auditModelTrainingCode } from "./tools/llm/modelCodeAuditor";
import { reviewAgent } from "./tools/llm/reviewAgent";
import { generateNarrativeReport } from "./tools/llm/reportGenerator";
import { dedupeFindings, computeOverallRisk } from "./utils";

export async function runAudit(request: AuditRequest): Promise<AuditReport> {
  const findings: AuditFinding[] = [];

  // ============================================
  // Phase 1: Fixed orchestration (deterministic)
  // ============================================

  // Step 1: rule-engine scan of preprocessing code
  findings.push(...pipelineScan(request));

  // Step 2: LLM tools (parallel)
  const [proxyFindings, temporalFindings] = await Promise.all([
    detectProxyLeakage(request),
    detectTemporalLeakage(request),
  ]);
  findings.push(...proxyFindings);
  findings.push(...temporalFindings);

  // Step 3: code audit (always runs — preprocessing_code is required)
  let codeAuditResult: CodeAuditResult | null = null;
  codeAuditResult = await auditPreprocessingCode(request);
  findings.push(...codeAuditResult.findings);

  // Step 4: model training code audit (conditional)
  if (request.model_training_code) {
    const modelFindings = await auditModelTrainingCode(request);
    findings.push(...modelFindings);
  }

  // Step 5: structural check (uses code audit result for entity key detection)
  findings.push(...structuralCheck(request, codeAuditResult));

  const phase1Findings = dedupeFindings(findings);

  // ============================================
  // Phase 2: Review Agent (autonomous decisions)
  // ============================================

  let additionalFindings: AuditFinding[] = [];
  try {
    additionalFindings = await reviewAgent(request, phase1Findings);
  } catch (error) {
    console.error(
      "Review agent failed, continuing with Phase 1 results:",
      error,
    );
  }

  // ============================================
  // Phase 3: Final aggregation
  // ============================================

  const allFindings = dedupeFindings([
    ...phase1Findings,
    ...additionalFindings,
  ]);
  const overallRisk = computeOverallRisk(allFindings);

  const narrative = await generateNarrativeReport(
    request,
    allFindings,
    overallRisk,
  );

  const bucketSummary = {
    "Time leakage": 0,
    "Feature / proxy leakage": 0,
    "Structure / pipeline leakage": 0,
  };
  for (const f of allFindings) {
    if (f.macro_bucket in bucketSummary) {
      bucketSummary[f.macro_bucket as keyof typeof bucketSummary] += 1;
    }
  }

  const missingMetadata = allFindings
    .filter((f) => f.fine_grained_type === "missing_metadata")
    .map((f) => f.flagged_object);

  const clarifyingQuestions = [
    ...new Set(
      allFindings
        .filter((f) => f.needs_human_review)
        .map(
          (f) =>
            `Can a human reviewer confirm when ${f.flagged_object} becomes available relative to the prediction boundary?`,
        ),
    ),
  ];

  return {
    overall_risk: overallRisk,
    summary: `Audit complete. Overall risk: ${overallRisk.toUpperCase()}. Found ${allFindings.length} issue(s). Review agent ${additionalFindings.length > 0 ? `added ${additionalFindings.length} additional finding(s)` : "confirmed initial assessment"}.`,
    narrative_report: narrative,
    findings: allFindings,
    missing_metadata: [...new Set(missingMetadata)],
    clarifying_questions: clarifyingQuestions,
    bucket_summary: bucketSummary,
  };
}
