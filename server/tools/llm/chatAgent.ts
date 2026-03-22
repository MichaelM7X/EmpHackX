import { AuditReport, AuditRequest } from "../../../src/types";
import { callOpenAIChat } from "../../openaiClient";

export async function answerQuestion(
  question: string,
  report: AuditReport,
  request: AuditRequest,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  const findingsSummary = report.findings
    .map(
      (f) =>
        `- [${f.severity.toUpperCase()}] ${f.title} (${f.flagged_object}): ${f.why_it_matters}`,
    )
    .join("\n");

  const systemPrompt = `You are LeakGuard, an ML data leakage auditor agent.
You completed an audit of the following ML pipeline:

Prediction Goal: ${request.prediction_goal}
Target: ${request.target_column}
Prediction Time Point: ${request.prediction_time_point}
Overall Risk: ${report.overall_risk.toUpperCase()}

Findings (${report.findings.length} total):
${findingsSummary}

Safe Features: ${report.safe_features?.join(", ") ?? "none"}

Answer questions about this audit concisely and precisely. Reference specific 
findings by name when relevant. Focus on actionable guidance. Keep responses 
under 200 words unless a detailed explanation is truly needed.`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history,
    { role: "user", content: question },
  ];

  return callOpenAIChat(systemPrompt, messages);
}
