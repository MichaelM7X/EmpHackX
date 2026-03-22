import { FormEvent, useRef, useState } from "react";
import { demoCases, DemoCase } from "./data/demoCases";
import { auditWithLLM, chatWithLLM } from "./lib/llmEngine";
import {
  AgentMessage,
  AuditReport,
  AuditRequest,
} from "./types";

const traceSteps = [
  {
    title: "Parse intake context",
    detail: "Extract CSV columns, preprocessing code, and prediction goal.",
  },
  {
    title: "Check time leakage",
    detail: "LLM infers prediction timing from task description, then checks features.",
  },
  {
    title: "Check feature proxies",
    detail: "LLM flags label-adjacent fields and downstream workflow signals.",
  },
  {
    title: "Audit preprocessing code",
    detail: "LLM analyzes code for split design, global preprocessing, and aggregation leaks.",
  },
  {
    title: "Review Agent",
    detail:
      "Agent autonomously decides whether to cross-check, deep-dive, or verify feature interactions.",
  },
  {
    title: "Generate narrative report",
    detail: "LLM writes evidence-backed findings and follow-up questions.",
  },
];

function cloneRequest(request: AuditRequest): AuditRequest {
  return JSON.parse(JSON.stringify(request)) as AuditRequest;
}

function riskLabelClass(risk: string) {
  return `risk-pill risk-${risk}`;
}

export default function App() {
  const [activeCaseId, setActiveCaseId] = useState(demoCases[0].case_id);
  const activeCase = demoCases.find((c) => c.case_id === activeCaseId) ?? demoCases[0];

  const [request, setRequest] = useState<AuditRequest>(() =>
    cloneRequest(demoCases[0].default_inputs),
  );
  const [report, setReport] = useState<AuditReport | null>(null);
  const [chatMessages, setChatMessages] = useState<AgentMessage[]>([
    {
      role: "assistant",
      content: `${demoCases[0].narrator_line} Click "Run Audit" to start the analysis.`,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [traceIndex, setTraceIndex] = useState(-1);
  const [lastRunLabel, setLastRunLabel] = useState("Ready");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");
  const traceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const switchCase = (caseItem: DemoCase) => {
    setActiveCaseId(caseItem.case_id);
    const nextRequest = cloneRequest(caseItem.default_inputs);
    setRequest(nextRequest);
    setReport(null);
    setChatMessages([
      {
        role: "assistant",
        content: `${caseItem.narrator_line} Click "Run Audit" to start the analysis.`,
      },
    ]);
    setIsRunning(false);
    setTraceIndex(-1);
    setLastRunLabel("Loaded demo defaults");
    setCsvFileName(`${caseItem.case_id}-demo.csv`);
  };

  const resetToDefaults = () => {
    switchCase(activeCase);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const firstLine = text.split("\n")[0];
      const columns = firstLine
        .split(",")
        .map((col) => col.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      setRequest((c) => ({ ...c, csv_columns: columns }));
    };
    reader.readAsText(file);
  };

  const runAudit = async () => {
    setIsRunning(true);
    setTraceIndex(0);

    let step = 0;
    traceTimerRef.current = setInterval(() => {
      step += 1;
      if (step < traceSteps.length) {
        setTraceIndex(step);
      } else if (traceTimerRef.current) {
        clearInterval(traceTimerRef.current);
        traceTimerRef.current = null;
      }
    }, 600);

    try {
      const nextReport = await auditWithLLM(request);
      setReport(nextReport);
      setChatMessages((msgs) => [
        ...msgs,
        {
          role: "assistant",
          content: `Audit finished. ${nextReport.summary}`,
        },
      ]);
    } catch (error) {
      console.error("Audit failed:", error);
      setChatMessages((msgs) => [
        ...msgs,
        {
          role: "assistant",
          content: "Audit failed. Please check your API key and try again.",
        },
      ]);
    } finally {
      if (traceTimerRef.current) {
        clearInterval(traceTimerRef.current);
        traceTimerRef.current = null;
      }
      setTraceIndex(traceSteps.length);
      setIsRunning(false);
      setLastRunLabel(
        `Last audited at ${new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}`,
      );
    }
  };

  const handleChatSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading || !report) return;

    setChatMessages((msgs) => [...msgs, { role: "user", content: trimmed }]);
    setChatInput("");
    setIsChatLoading(true);

    chatWithLLM(trimmed, report, request, chatMessages)
      .then((response) => {
        setChatMessages((msgs) => [
          ...msgs,
          { role: "assistant", content: response },
        ]);
      })
      .catch(() => {
        setChatMessages((msgs) => [
          ...msgs,
          {
            role: "assistant",
            content: "Sorry, I could not process that question. Please try again.",
          },
        ]);
      })
      .finally(() => {
        setIsChatLoading(false);
      });
  };

  const handlePromptStarter = (prompt: string) => {
    if (isChatLoading || !report) return;

    setChatMessages((msgs) => [...msgs, { role: "user", content: prompt }]);
    setIsChatLoading(true);

    chatWithLLM(prompt, report, request, chatMessages)
      .then((response) => {
        setChatMessages((msgs) => [
          ...msgs,
          { role: "assistant", content: response },
        ]);
      })
      .catch(() => {
        setChatMessages((msgs) => [
          ...msgs,
          {
            role: "assistant",
            content: "Sorry, I could not process that question. Please try again.",
          },
        ]);
      })
      .finally(() => {
        setIsChatLoading(false);
      });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LeakGuard</p>
          <h1>Audit whether the model is actually learning.</h1>
        </div>
        <a className="ghost-button" href="#workspace">
          Open Demo
        </a>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Leakage Audit Agent</p>
            <h2>
              Cross-domain model integrity review for researchers, students, and
              teams shipping predictive workflows.
            </h2>
            <p className="hero-text">
              LeakGuard is not another prediction model. It audits whether your
              dataset, features, and validation setup are methodologically
              trustworthy before you trust the metric.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#workspace">
                Launch Audit Demo
              </a>
              <button
                className="ghost-button"
                type="button"
                onClick={resetToDefaults}
              >
                Reset Current Case
              </button>
            </div>
          </div>

          <div className="hero-aside">
            <div className="hero-card">
              <span className="hero-kicker">Judge-friendly buckets</span>
              <ul className="signal-list">
                <li>Time leakage</li>
                <li>Feature / proxy leakage</li>
                <li>Structure / pipeline leakage</li>
              </ul>
            </div>
            <div className="hero-card">
              <span className="hero-kicker">Orchestrator + Review Agent</span>
              <p>
                Fixed pipeline guarantees coverage. Review Agent autonomously
                decides whether to dig deeper.
              </p>
            </div>
          </div>
        </section>

        <section className="domain-strip">
          <article className="domain-card">
            <h3>Housing</h3>
            <p>
              Spot future rent aggregates, post-lease answers, and
              repeated-building split leakage.
            </p>
          </article>
          <article className="domain-card">
            <h3>Healthcare</h3>
            <p>
              Audit whether an early-warning score is relying on operational
              response signals instead of true pre-event evidence.
            </p>
          </article>
          <article className="domain-card">
            <h3>Finance</h3>
            <p>
              Separate real underwriting signals from post-origination
              collections and repayment behavior.
            </p>
          </article>
        </section>

        <section className="workspace-section" id="workspace">
          <div className="section-header">
            <div>
              <p className="eyebrow">Agent Workspace</p>
              <h2>
                Run the audit, inspect the evidence, then ask the agent to
                explain it.
              </h2>
            </div>
            <div className="run-panel">
              <span className="run-status">{lastRunLabel}</span>
              <button
                className="primary-button"
                type="button"
                onClick={() => void runAudit()}
                disabled={isRunning}
              >
                {isRunning ? "Auditing..." : "Run Audit"}
              </button>
            </div>
          </div>

          <div className="case-switcher">
            {demoCases.map((demoCase) => (
              <button
                key={demoCase.case_id}
                className={`case-card ${demoCase.case_id === activeCase.case_id ? "is-active" : ""}`}
                type="button"
                onClick={() => switchCase(demoCase)}
              >
                <span className="case-domain">{demoCase.domain}</span>
                <strong>{demoCase.title}</strong>
                <p>{demoCase.story}</p>
              </button>
            ))}
          </div>

          <div className="story-banner">
            <div>
              <p className="eyebrow">Narrative</p>
              <h3>{activeCase.title}</h3>
              <p>{activeCase.narrator_line}</p>
            </div>
            {activeCase.source_note ? (
              <div className="source-note">
                <p>{activeCase.source_note}</p>
                {activeCase.source_url ? (
                  <a
                    href={activeCase.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {activeCase.source_label}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="workspace-grid">
            {/* ===== Intake Panel ===== */}
            <section className="panel intake-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Structured Intake</p>
                  <h3>Pipeline metadata</h3>
                </div>
                <button
                  className="tiny-button"
                  type="button"
                  onClick={resetToDefaults}
                >
                  Use demo defaults
                </button>
              </div>

              <label className="field">
                <span>Prediction goal</span>
                <textarea
                  rows={3}
                  value={request.prediction_goal}
                  onChange={(e) =>
                    setRequest((c) => ({
                      ...c,
                      prediction_goal: e.target.value,
                    }))
                  }
                />
              </label>

              <div className="field">
                <span>CSV file (header extraction)</span>
                <div className="csv-upload-area">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    id="csv-upload"
                    className="csv-file-input"
                  />
                  <label htmlFor="csv-upload" className="csv-upload-label">
                    {csvFileName || "Choose CSV file..."}
                  </label>
                </div>
                {request.csv_columns.length > 0 && (
                  <div className="csv-columns-preview">
                    <span className="csv-columns-count">
                      {request.csv_columns.length} columns detected
                    </span>
                    <div className="csv-columns-list">
                      {request.csv_columns.map((col) => (
                        <span
                          className={`csv-col-chip ${col === request.target_column ? "csv-col-target" : ""}`}
                          key={col}
                        >
                          {col}
                          {col === request.target_column ? " (target)" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <label className="field">
                <span>Preprocessing code (required)</span>
                <textarea
                  rows={10}
                  value={request.preprocessing_code}
                  onChange={(e) =>
                    setRequest((c) => ({
                      ...c,
                      preprocessing_code: e.target.value,
                    }))
                  }
                  placeholder="Paste your preprocessing / pipeline code here."
                  style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                />
              </label>

              <label className="field">
                <span>Model training code (optional)</span>
                <textarea
                  rows={6}
                  value={request.model_training_code ?? ""}
                  onChange={(e) =>
                    setRequest((c) => ({
                      ...c,
                      model_training_code: e.target.value || undefined,
                    }))
                  }
                  placeholder="Paste your model training code here for deeper analysis."
                  style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                />
              </label>
            </section>

            {/* ===== Trace Panel ===== */}
            <section className="panel trace-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Audit Console</p>
                  <h3>Agent trace</h3>
                </div>
                <span className="status-pill">
                  {isRunning ? "Running" : "Ready"}
                </span>
              </div>

              <div className="trace-list">
                {traceSteps.map((step, index) => {
                  let state: string;
                  if (!isRunning && traceIndex < 0) {
                    state = "pending";
                  } else if (isRunning) {
                    state =
                      index < traceIndex
                        ? "done"
                        : index === traceIndex
                          ? "active"
                          : "pending";
                  } else {
                    state = "done";
                  }

                  return (
                    <article
                      className={`trace-step trace-${state}`}
                      key={step.title}
                    >
                      <div className="trace-marker">{index + 1}</div>
                      <div>
                        <h4>{step.title}</h4>
                        <p>{step.detail}</p>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="expectations-card">
                <p className="eyebrow">Expected findings for this case</p>
                <ul>
                  {activeCase.expected_findings.map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
              </div>
            </section>

            {/* ===== Results Panel ===== */}
            <section className="panel results-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Findings</p>
                  <h3>Evidence-backed report</h3>
                </div>
              </div>

              {!report ? (
                <div className="empty-state">
                  <p className="eyebrow">No audit yet</p>
                  <p>
                    Fill in the intake form and click "Run Audit" to get
                    started.
                  </p>
                </div>
              ) : (
                <>
                  <article className="risk-card">
                    <div>
                      <p className="eyebrow">Overall risk</p>
                      <div className="risk-summary">
                        <span className={riskLabelClass(report.overall_risk)}>
                          {report.overall_risk.toUpperCase()}
                        </span>
                        <p>{report.summary}</p>
                      </div>
                    </div>
                    <div className="bucket-grid">
                      {Object.entries(report.bucket_summary).map(
                        ([bucket, count]) => (
                          <div className="bucket-card" key={bucket}>
                            <strong>{count}</strong>
                            <span>{bucket}</span>
                          </div>
                        ),
                      )}
                    </div>
                  </article>

                  {report.narrative_report && (
                    <article className="narrative-card">
                      <p className="eyebrow">Narrative Report</p>
                      <p className="narrative-text">
                        {report.narrative_report}
                      </p>
                    </article>
                  )}

                  <div className="findings-list">
                    {report.findings.map((finding) => (
                      <article
                        key={finding.id}
                        className={`finding-expanded finding-sev-${finding.severity}`}
                      >
                        <div className="finding-head">
                          <div className="finding-head-left">
                            <strong className="finding-object">
                              {finding.flagged_object}
                            </strong>
                            <p className="finding-title">{finding.title}</p>
                          </div>
                          <div className="finding-badges">
                            {finding.id.startsWith("review-") && (
                              <span className="review-agent-badge">
                                Review Agent
                              </span>
                            )}
                            <span className={riskLabelClass(finding.severity)}>
                              {finding.severity.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <div className="finding-type-row">
                          <span className="macro-chip">
                            {finding.macro_bucket}
                          </span>
                          <span className="fine-chip">
                            {finding.fine_grained_type.replace(/_/g, " ")}
                          </span>
                          <span className="confidence-chip">
                            {finding.confidence} confidence
                          </span>
                        </div>

                        <div className="finding-body">
                          <div className="finding-section">
                            <h5>Evidence</h5>
                            <ul>
                              {finding.evidence.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="finding-section">
                            <h5>Fix recommendation</h5>
                            <ul>
                              {finding.fix_recommendation.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="finding-footer">
                          <p className="why-it-matters">
                            {finding.why_it_matters}
                          </p>
                          {finding.needs_human_review && (
                            <span className="human-review-chip">
                              Needs human review
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>

                  {report.missing_metadata.length > 0 ? (
                    <article className="metadata-card">
                      <p className="eyebrow">Missing metadata</p>
                      <ul>
                        {report.clarifying_questions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    </article>
                  ) : null}
                </>
              )}
            </section>
          </div>

          {/* ===== Chat Panel ===== */}
          <section className="panel chat-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Grounded Chat</p>
                <h3>Ask the agent to explain the report</h3>
              </div>
            </div>

            <div className="prompt-starters">
              {activeCase.prompt_starters.map((prompt) => (
                <button
                  className="starter-chip"
                  key={prompt}
                  type="button"
                  onClick={() => handlePromptStarter(prompt)}
                  disabled={!report}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="chat-log">
              {chatMessages.map((message, index) => (
                <article
                  className={`chat-bubble chat-${message.role}`}
                  key={`${message.role}-${index}`}
                >
                  <span>
                    {message.role === "assistant" ? "LeakGuard" : "You"}
                  </span>
                  <p>{message.content}</p>
                </article>
              ))}
              {isChatLoading && (
                <article className="chat-bubble chat-assistant">
                  <span>LeakGuard</span>
                  <p className="thinking-indicator">Thinking...</p>
                </article>
              )}
            </div>

            <form className="chat-form" onSubmit={handleChatSubmit}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  report
                    ? "Ask why a finding is leaky, what to fix, or what metadata is missing."
                    : "Run an audit first to enable chat."
                }
                disabled={isChatLoading || !report}
              />
              <button
                className="primary-button"
                type="submit"
                disabled={isChatLoading || !report}
              >
                {isChatLoading ? "..." : "Ask"}
              </button>
            </form>
          </section>
        </section>
      </main>
    </div>
  );
}
