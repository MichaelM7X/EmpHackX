import { FormEvent, useRef, useState } from "react";
import { demoCases, DemoCase } from "./data/demoCases";
import { auditWithLLM, chatWithLLM } from "./lib/llmEngine";
import {
  AgentMessage,
  AuditFinding,
  AuditReport,
  AuditRequest,
} from "./types";

const traceSteps = [
  {
    title: "Parse intake context",
    detail: "Normalize the task, target, entity keys, and timing fields.",
  },
  {
    title: "Check time leakage",
    detail: "LLM inspects feature availability and derived aggregate windows.",
  },
  {
    title: "Check feature proxies",
    detail: "LLM flags label-adjacent fields and downstream workflow signals.",
  },
  {
    title: "Check structure leakage",
    detail:
      "Rules + code audit review split design, repeated entities, and global preprocessing.",
  },
  {
    title: "Generate narrative report",
    detail: "LLM writes evidence-backed findings, fixes, and follow-up questions.",
  },
];

function cloneRequest(request: AuditRequest): AuditRequest {
  return JSON.parse(JSON.stringify(request)) as AuditRequest;
}

function joinValues(values: string[]) {
  return values.join(", ");
}

function splitValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function riskLabelClass(risk: string) {
  return `risk-pill risk-${risk}`;
}

function findingClassName(
  finding: AuditFinding,
  selectedFindingId: string | null,
) {
  const isSelected = selectedFindingId === finding.id;
  return `finding-card ${isSelected ? "is-selected" : ""}`;
}

export default function App() {
  const [activeCaseId, setActiveCaseId] = useState(demoCases[0].case_id);
  const activeCase = demoCases.find((c) => c.case_id === activeCaseId) ?? demoCases[0];

  const [request, setRequest] = useState<AuditRequest>(() =>
    cloneRequest(demoCases[0].default_inputs),
  );
  const [report, setReport] = useState<AuditReport | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
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
  const [copyStatus, setCopyStatus] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [pipelineTab, setPipelineTab] = useState<"notes" | "code">("notes");
  const traceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const switchCase = (caseItem: DemoCase) => {
    setActiveCaseId(caseItem.case_id);
    const nextRequest = cloneRequest(caseItem.default_inputs);
    setRequest(nextRequest);
    setReport(null);
    setSelectedFindingId(null);
    setChatMessages([
      {
        role: "assistant",
        content: `${caseItem.narrator_line} Click "Run Audit" to start the analysis.`,
      },
    ]);
    setIsRunning(false);
    setTraceIndex(-1);
    setLastRunLabel("Loaded demo defaults");
    setCopyStatus("");
    setPipelineTab("notes");
  };

  const resetToDefaults = () => {
    switchCase(activeCase);
  };

  const runAudit = async () => {
    setIsRunning(true);
    setTraceIndex(0);
    setCopyStatus("");

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
      setSelectedFindingId(nextReport.findings[0]?.id ?? null);
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

  const selectedFinding =
    report?.findings.find((f) => f.id === selectedFindingId) ??
    report?.findings[0] ??
    null;

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

  const downloadReport = () => {
    if (!report) return;
    const fileName = `${activeCaseId}-audit-report.json`;
    const blob = new Blob([JSON.stringify({ request, report }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyFixPlan = async () => {
    if (!report) return;
    const content = report.fix_plan
      .map((item, index) => `${index + 1}. ${item}`)
      .join("\n");
    if (!navigator.clipboard) {
      setCopyStatus("Clipboard not available in this browser.");
      return;
    }
    await navigator.clipboard.writeText(content);
    setCopyStatus("Fix plan copied.");
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
              <span className="hero-kicker">Orchestrator + Tools</span>
              <p>
                Rules engine and LLM detectors work in parallel, each handling
                what they do best.
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

              <div className="two-column">
                <label className="field">
                  <span>Target column</span>
                  <input
                    type="text"
                    value={request.target_column}
                    onChange={(e) =>
                      setRequest((c) => ({
                        ...c,
                        target_column: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Prediction time point</span>
                  <input
                    type="text"
                    value={request.prediction_time_point}
                    onChange={(e) =>
                      setRequest((c) => ({
                        ...c,
                        prediction_time_point: e.target.value,
                      }))
                    }
                    placeholder="e.g. The moment a listing goes live"
                  />
                </label>
              </div>

              <div className="two-column">
                <label className="field">
                  <span>Timestamp fields</span>
                  <input
                    type="text"
                    value={joinValues(request.timestamp_fields)}
                    onChange={(e) =>
                      setRequest((c) => ({
                        ...c,
                        timestamp_fields: splitValues(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Entity keys</span>
                  <input
                    type="text"
                    value={joinValues(request.entity_keys)}
                    onChange={(e) =>
                      setRequest((c) => ({
                        ...c,
                        entity_keys: splitValues(e.target.value),
                      }))
                    }
                  />
                </label>
              </div>

              <div className="tab-switcher">
                <button
                  className={`tab-button ${pipelineTab === "notes" ? "tab-active" : ""}`}
                  type="button"
                  onClick={() => setPipelineTab("notes")}
                >
                  Pipeline Notes
                </button>
                <button
                  className={`tab-button ${pipelineTab === "code" ? "tab-active" : ""}`}
                  type="button"
                  onClick={() => setPipelineTab("code")}
                >
                  Preprocessing Code
                </button>
              </div>

              {pipelineTab === "notes" ? (
                <label className="field">
                  <span>Pipeline notes</span>
                  <textarea
                    rows={5}
                    value={request.pipeline_notes}
                    onChange={(e) =>
                      setRequest((c) => ({
                        ...c,
                        pipeline_notes: e.target.value,
                      }))
                    }
                    placeholder="Describe how the data is split, preprocessed, and fed to the model."
                  />
                </label>
              ) : (
                <label className="field">
                  <span>Preprocessing code (Python)</span>
                  <textarea
                    rows={8}
                    value={request.preprocessing_code ?? ""}
                    onChange={(e) =>
                      setRequest((c) => ({
                        ...c,
                        preprocessing_code: e.target.value || undefined,
                      }))
                    }
                    placeholder="Paste your preprocessing / pipeline code here for code-level audit."
                    style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                  />
                </label>
              )}

              <div className="feature-catalog">
                <div className="panel-header compact">
                  <div>
                    <p className="eyebrow">Feature Catalog</p>
                    <h4>
                      {request.feature_dictionary.length} tracked fields
                    </h4>
                  </div>
                </div>
                <div className="feature-list">
                  {request.feature_dictionary.map((feature, idx) => (
                    <article className="feature-row" key={feature.name}>
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={feature.name}
                          onChange={(e) => {
                            const updated = [...request.feature_dictionary];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            setRequest((c) => ({
                              ...c,
                              feature_dictionary: updated,
                            }));
                          }}
                          style={{
                            fontWeight: 700,
                            border: "none",
                            background: "transparent",
                            padding: "2px 0",
                            width: "100%",
                          }}
                        />
                        <textarea
                          rows={2}
                          value={feature.description}
                          onChange={(e) => {
                            const updated = [...request.feature_dictionary];
                            updated[idx] = {
                              ...updated[idx],
                              description: e.target.value,
                            };
                            setRequest((c) => ({
                              ...c,
                              feature_dictionary: updated,
                            }));
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: "2px 0",
                            width: "100%",
                            resize: "vertical",
                            color: "var(--muted)",
                            fontSize: "0.9rem",
                          }}
                        />
                      </div>
                      <button
                        className="tiny-button"
                        type="button"
                        onClick={() => {
                          setRequest((c) => ({
                            ...c,
                            feature_dictionary:
                              c.feature_dictionary.filter((_, i) => i !== idx),
                          }));
                        }}
                        style={{ alignSelf: "flex-start", padding: "6px 10px" }}
                      >
                        Remove
                      </button>
                    </article>
                  ))}
                  <button
                    className="tiny-button"
                    type="button"
                    onClick={() => {
                      setRequest((c) => ({
                        ...c,
                        feature_dictionary: [
                          ...c.feature_dictionary,
                          { name: "", description: "" },
                        ],
                      }));
                    }}
                    style={{ alignSelf: "flex-start" }}
                  >
                    + Add Feature
                  </button>
                </div>
              </div>
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
                {report && (
                  <div className="results-actions">
                    <button
                      className="tiny-button"
                      type="button"
                      onClick={downloadReport}
                    >
                      Export JSON
                    </button>
                    <button
                      className="tiny-button"
                      type="button"
                      onClick={() => void copyFixPlan()}
                    >
                      Copy fix plan
                    </button>
                  </div>
                )}
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
                    {copyStatus ? (
                      <p className="copy-status">{copyStatus}</p>
                    ) : null}
                  </article>

                  {report.narrative_report && (
                    <article className="narrative-card">
                      <p className="eyebrow">Narrative Report</p>
                      <p className="narrative-text">
                        {report.narrative_report}
                      </p>
                    </article>
                  )}

                  {report.safe_features && report.safe_features.length > 0 && (
                    <article className="safe-features-card">
                      <p className="eyebrow">Safe Features</p>
                      <div className="safe-features-list">
                        {report.safe_features.map((name) => (
                          <span className="safe-chip" key={name}>
                            {name}
                          </span>
                        ))}
                      </div>
                    </article>
                  )}

                  <div className="findings-list">
                    {report.findings.map((finding) => (
                      <button
                        key={finding.id}
                        className={findingClassName(finding, selectedFindingId)}
                        type="button"
                        onClick={() => setSelectedFindingId(finding.id)}
                      >
                        <div className="finding-head">
                          <strong>{finding.flagged_object}</strong>
                          <span
                            className={riskLabelClass(finding.severity)}
                          >
                            {finding.severity}
                          </span>
                        </div>
                        <p>{finding.title}</p>
                        <div className="finding-meta">
                          <span>{finding.macro_bucket}</span>
                          <span>{finding.fine_grained_type}</span>
                          <span>{finding.confidence} confidence</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedFinding ? (
                    <article className="detail-card">
                      <div className="panel-header compact">
                        <div>
                          <p className="eyebrow">Detail view</p>
                          <h4>{selectedFinding.flagged_object}</h4>
                        </div>
                        <span
                          className={riskLabelClass(selectedFinding.severity)}
                        >
                          {selectedFinding.macro_bucket}
                        </span>
                      </div>
                      <p className="detail-subtitle">
                        {selectedFinding.title}
                      </p>
                      <div className="detail-columns">
                        <div>
                          <h5>Evidence</h5>
                          <ul>
                            {selectedFinding.evidence.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h5>Recommendation</h5>
                          <ul>
                            {selectedFinding.fix_recommendation.map(
                              (item) => (
                                <li key={item}>{item}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      </div>
                      <div className="detail-footer">
                        <p>{selectedFinding.why_it_matters}</p>
                        {selectedFinding.needs_human_review ? (
                          <span className="human-review-chip">
                            Needs human review
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ) : null}

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
