import { describe, expect, it } from "vitest";
import { demoCases } from "../data/demoCases";
import { auditRequest } from "./auditEngine";

function cloneCaseRequest<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("auditRequest", () => {
  it("flags all three macro buckets for the NYC rental case", () => {
    const demoCase = demoCases[0];
    const report = auditRequest(cloneCaseRequest(demoCase.default_inputs), demoCase);

    expect(report.bucket_summary["Time leakage"]).toBeGreaterThan(0);
    expect(report.bucket_summary["Feature / proxy leakage"]).toBeGreaterThan(0);
    expect(report.bucket_summary["Structure / pipeline leakage"]).toBeGreaterThan(0);
    expect(report.overall_risk).toBe("critical");
  });

  it("keeps the sepsis case framed as an inspired audit, not a recreation", () => {
    const demoCase = demoCases[1];
    const report = auditRequest(cloneCaseRequest(demoCase.default_inputs), demoCase);

    expect(report.report_note).toContain("inspired");
    expect(report.findings.some((finding) => finding.needs_human_review)).toBe(true);
  });

  it("proves the finance case transfers the same audit logic", () => {
    const demoCase = demoCases[2];
    const report = auditRequest(cloneCaseRequest(demoCase.default_inputs), demoCase);

    expect(report.bucket_summary["Time leakage"]).toBeGreaterThan(0);
    expect(report.bucket_summary["Feature / proxy leakage"]).toBeGreaterThan(0);
    expect(report.bucket_summary["Structure / pipeline leakage"]).toBeGreaterThan(0);
  });

  it("asks for clarification when timestamp metadata is missing", () => {
    const demoCase = demoCases[0];
    const request = cloneCaseRequest(demoCase.default_inputs);
    request.timestamp_fields = [];
    const report = auditRequest(request, demoCase);

    expect(
      report.findings.some(
        (finding) => finding.fine_grained_type === "missing_metadata",
      ),
    ).toBe(true);
    expect(report.clarifying_questions.length).toBeGreaterThan(0);
  });
});
