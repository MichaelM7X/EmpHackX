import JSZip from "jszip";
import { jsPDF } from "jspdf";
import type { AuditReport, AuditFinding, Severity } from "../../types";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

function buildMarkdown(report: AuditReport): string {
  const lines: string[] = [];

  lines.push("# Olarion Audit Report");
  lines.push("");
  lines.push(`**Overall Risk:** ${report.overall_risk.toUpperCase()}`);
  const critical = report.findings.filter((f) => f.severity === "critical").length;
  const high = report.findings.filter((f) => f.severity === "high").length;
  lines.push(
    `**Critical Findings:** ${critical}  |  **High Findings:** ${high}  |  **Total Flagged:** ${report.findings.length}`,
  );
  lines.push(`**Generated:** ${new Date().toLocaleString()}`);
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Detailed Findings");
  lines.push("");

  const sorted = [...report.findings].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );

  for (const f of sorted) {
    lines.push(`### ${f.title}`);
    lines.push("");
    lines.push(`- **Flagged Object:** \`${f.flagged_object}\``);
    lines.push(`- **Severity:** ${f.severity.toUpperCase()}`);
    lines.push(`- **Category:** ${f.macro_bucket}`);
    lines.push(`- **Confidence:** ${f.confidence}`);
    if (f.needs_human_review) {
      lines.push("- **⚠ Human review required**");
    }
    lines.push("");
    lines.push("**Why it matters:**");
    lines.push(f.why_it_matters);
    lines.push("");
    lines.push("**Evidence:**");
    for (const e of f.evidence) {
      const claim = e.claim || e.text || '';
      if (!claim) continue;
      lines.push(`- ${claim}`);
      const fname = e.source?.filename || e.citation_label?.split(' (')[0] || '';
      const loc = e.source?.location || e.citation_label || '';
      if (fname) {
        lines.push(`  _Source: ${fname}${loc ? ` (${loc})` : ''}_`);
      }
    }
    lines.push("");
    lines.push("**Recommendation:**");
    for (const r of f.fix_recommendation) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Narrative Report");
  lines.push("");
  lines.push(report.narrative_report);
  lines.push("");

  if (report.clarifying_questions.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Clarifying Questions");
    lines.push("");
    for (const q of report.clarifying_questions) {
      lines.push(`- ${q}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Recommended Actions");
  lines.push("");
  const actions = [...report.findings]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 8);
  for (const f of actions) {
    lines.push(
      `- **[${f.severity.toUpperCase()}]** ${f.title} — ${f.why_it_matters} ${f.fix_recommendation.join(" ")}`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

function buildPdf(report: AuditReport): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function checkPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function addTitle(text: string, size: number) {
    checkPage(size + 4);
    doc.setFontSize(size);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += size * 0.5 + 2;
  }

  function addText(text: string, size = 10, style: "normal" | "bold" = "normal") {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      checkPage(size * 0.4 + 1);
      doc.text(line, margin, y);
      y += size * 0.4 + 1;
    }
  }

  function addGap(mm = 4) {
    y += mm;
  }

  addTitle("Olarion Audit Report", 20);
  addGap(4);

  const critical = report.findings.filter((f) => f.severity === "critical").length;
  const high = report.findings.filter((f) => f.severity === "high").length;
  addText(`Overall Risk: ${report.overall_risk.toUpperCase()}`, 12, "bold");
  addText(
    `Critical: ${critical}  |  High: ${high}  |  Total: ${report.findings.length}`,
    10,
  );
  addText(`Generated: ${new Date().toLocaleString()}`, 9);
  addGap(6);

  addTitle("Detailed Findings", 14);
  addGap(2);

  const sorted = [...report.findings].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );

  for (const f of sorted) {
    addGap(3);
    addText(`[${f.severity.toUpperCase()}] ${f.title}`, 11, "bold");
    addText(`Flagged: ${f.flagged_object}  |  Category: ${f.macro_bucket}`, 9);
    addGap(1);
    addText(`Why it matters: ${f.why_it_matters}`, 9);
    for (const e of f.evidence) {
      const claim = e.claim || e.text || '';
      if (!claim) continue;
      addText(`  • ${claim}`, 9);
      const fname = e.source?.filename || e.citation_label?.split(' (')[0] || '';
      const loc = e.source?.location || e.citation_label || '';
      if (fname) {
        addText(`    Source: ${fname}${loc ? ` (${loc})` : ''}`, 8);
      }
    }
    addText(`Recommendation: ${f.fix_recommendation.join(" ")}`, 9);
    addGap(2);
  }

  addGap(6);
  addTitle("Narrative Report", 14);
  addGap(2);
  for (const para of report.narrative_report.split("\n\n")) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    addText(trimmed, 10);
    addGap(3);
  }

  if (report.clarifying_questions.length > 0) {
    addGap(4);
    addTitle("Clarifying Questions", 14);
    addGap(2);
    for (const q of report.clarifying_questions) {
      addText(`• ${q}`, 10);
    }
  }

  addGap(6);
  addTitle("Recommended Actions", 14);
  addGap(2);
  const actions = [...report.findings]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 8);
  for (const f of actions) {
    addText(
      `[${f.severity.toUpperCase()}] ${f.title} — ${f.fix_recommendation.join(" ")}`,
      10,
    );
    addGap(1);
  }

  return doc.output("arraybuffer");
}

export async function downloadAuditZip(report: AuditReport): Promise<void> {
  const zip = new JSZip();

  const jsonStr = JSON.stringify(report, null, 2);
  zip.file("report.json", jsonStr);

  const markdown = buildMarkdown(report);
  zip.file("report.md", markdown);

  const pdfBuffer = buildPdf(report);
  zip.file("report.pdf", pdfBuffer);

  const blob = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `olarion-report-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
