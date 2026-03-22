import type { AuditReport, AuditRequest } from "../types";

export async function auditWithLLM(
  request: AuditRequest,
): Promise<AuditReport> {
  const response = await fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error ?? `Audit request failed: ${response.status}`);
  }

  const { report } = (await response.json()) as { report: AuditReport };
  return report;
}

export async function chatWithLLM(
  question: string,
  report: AuditReport,
  request: AuditRequest,
  history: Array<{ role: string; content: string }>,
): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, report, request, history }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error ?? `Chat request failed: ${response.status}`);
  }

  const { answer } = (await response.json()) as { answer: string };
  return answer;
}
