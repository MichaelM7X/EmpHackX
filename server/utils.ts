import { AuditFinding, FeatureDictionaryEntry, Severity } from "../src/types";

const severityRank: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function dedupeFindings(findings: AuditFinding[]): AuditFinding[] {
  const byId = new Map<string, AuditFinding>();
  for (const f of findings) {
    const existing = byId.get(f.id);
    if (!existing || (severityRank[f.severity] ?? 0) > (severityRank[existing.severity] ?? 0)) {
      byId.set(f.id, f);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0),
  );
}

export function computeOverallRisk(findings: AuditFinding[]): Severity {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.filter((f) => f.severity === "medium").length >= 2) return "medium";
  return "low";
}

export function computeSafeFeatures(
  features: FeatureDictionaryEntry[],
  findings: AuditFinding[],
): string[] {
  const flagged = new Set(findings.map((f) => f.flagged_object));
  return features.filter((f) => !flagged.has(f.name)).map((f) => f.name);
}
