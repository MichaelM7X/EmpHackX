import { FormEvent, useEffect, useMemo, useState } from "react";
import { demoCases } from "./data/demoCases";
import { answerQuestion, auditRequest, parseCsvHeader } from "./lib/auditEngine";
import { AgentMessage, AuditFinding, AuditReport, AuditRequest, DemoCaseConfig } from "./types";

const traceSteps = [
  {
    title: "Parse intake context",
    detail: "Normalize the task, target, entity keys, and timing fields.",
  },
  {
    title: "Check time leakage",
    detail: "Inspect feature availability and derived aggregate windows.",
  },
  {
    title: "Check feature proxies",
    detail: "Flag label-adjacent fields and downstream workflow signals.",
  },
  {
    title: "Check structure leakage",
    detail: "Review split design, repeated entities, and global preprocessing.",
  },
  {
    title: "Generate report",
    detail: "Write evidence-backed findings, fixes, and follow-up questions.",
  },
];

function cloneRequest(request: AuditRequest): AuditRequest {
  return JSON.parse(JSON.stringify(request)) as AuditRequest;
}

function unique(items: string[]) {
  return Array.from(new Set(items));
}

function buildIntroMessage(demoCase: DemoCaseConfig, report: AuditReport): AgentMessage {
  return {
    role: "assistant",
    content: `${demoCase.narrator_line} Current risk is ${report.overall_risk.toUpperCase()}, with ${report.findings.length} flagged findings ready to inspect.`,
  };
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

function riskLabelClass(risk: AuditReport["overall_risk"]) {
  return `risk-pill risk-${risk}`;
}

function findingClassName(finding: AuditFinding, selectedFindingId: string | null) {
  const isSelected = selectedFindingId === finding.id;
  return `finding-card ${isSelected ? "is-selected" : ""}`;
}

export default function App() {
  const [activeCaseId, setActiveCaseId] = useState(demoCases[0].case_id);
  const activeCase = useMemo(
    () => demoCases.find((demoCase) => demoCase.case_id === activeCaseId) ?? demoCases[0],
    [activeCaseId],
  );

  const [request, setRequest] = useState<AuditRequest>(() =>
    cloneRequest(demoCases[0].default_inputs),
  );
  const [report, setReport] = useState<AuditReport>(() =>
    auditRequest(demoCases[0].default_inputs, demoCases[0]),
  );
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    report.findings[0]?.id ?? null,
  );
  const [chatMessages, setChatMessages] = useState<AgentMessage[]>([
    buildIntroMessage(demoCases[0], report),
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [traceIndex, setTraceIndex] = useState(traceSteps.length);
  const [lastRunLabel, setLastRunLabel] = useState("Ready");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    const nextRequest = cloneRequest(activeCase.default_inputs);
    const nextReport = auditRequest(nextRequest, activeCase);
    setRequest(nextRequest);
    setReport(nextReport);
    setSelectedFindingId(nextReport.findings[0]?.id ?? null);
    setChatMessages([buildIntroMessage(activeCase, nextReport)]);
    setIsRunning(false);
    setTraceIndex(traceSteps.length);
    setLastRunLabel("Loaded demo defaults");
    setCopyStatus("");
  }, [activeCase]);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    if (traceIndex < traceSteps.length) {
      const timer = window.setTimeout(() => {
        setTraceIndex((current) => current + 1);
      }, 520);
      return () => window.clearTimeout(timer);
    }

    const nextReport = auditRequest(request, activeCase);
    setReport(nextReport);
    setSelectedFindingId(nextReport.findings[0]?.id ?? null);
    setChatMessages((currentMessages) => [
      ...currentMessages,
      {
        role: "assistant",
        content: `Audit finished. ${nextReport.summary}`,
      },
    ]);
    setIsRunning(false);
    setLastRunLabel(
      `Last audited at ${new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`,
    );

    return undefined;
  }, [activeCase, isRunning, request, traceIndex]);

  const selectedFinding =
    report.findings.find((finding) => finding.id === selectedFindingId) ??
    report.findings[0] ??
    null;

  const runAudit = () => {
    setIsRunning(true);
    setTraceIndex(0);
    setCopyStatus("");
  };

  const resetToDefaults = () => {
    const nextRequest = cloneRequest(activeCase.default_inputs);
    const nextReport = auditRequest(nextRequest, activeCase);
    setRequest(nextRequest);
    setReport(nextReport);
    setSelectedFindingId(nextReport.findings[0]?.id ?? null);
    setChatMessages([buildIntroMessage(activeCase, nextReport)]);
    setLastRunLabel("Reset to demo defaults");
    setCopyStatus("");
  };

  const handleDatasetUpload = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    const text = await file.text();
    const headers = parseCsvHeader(text);

    setRequest((current) => {
      const existingByName = new Map(
        current.feature_dictionary.map((feature) => [feature.name.toLowerCase(), feature]),
      );

      const mergedFeatures =
        headers.length > 0
          ? headers.map((header) => {
              const existing = existingByName.get(header.toLowerCase());
              return (
                existing ?? {
                  name: header,
                  description: "Uploaded column from the dataset header.",
                  availability: "unknown" as const,
                }
              );
            })
          : current.feature_dictionary;

      return {
        ...current,
        dataset_ref: file.name,
        optional_uploads: unique([...(current.optional_uploads ?? []), file.name]),
        feature_dictionary: mergedFeatures,
      };
    });

    setLastRunLabel(`Loaded dataset header from ${file.name}`);
  };

  const handleArtifactUpload = (files: FileList | null) => {
    if (!files) {
      return;
    }

    const fileNames = Array.from(files).map((file) => file.name);
    setRequest((current) => ({
      ...current,
      optional_uploads: unique([...(current.optional_uploads ?? []), ...fileNames]),
      model_artifacts_optional: [
        current.model_artifacts_optional ?? "Supplementary artifacts:",
        ...fileNames,
      ].join("\n"),
    }));
    setLastRunLabel(`Attached ${fileNames.length} supporting artifact(s)`);
  };

  const handleChatSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) {
      return;
    }

    const response = answerQuestion(trimmed, report, activeCase);
    setChatMessages((currentMessages) => [
      ...currentMessages,
      { role: "user", content: trimmed },
      { role: "assistant", content: response },
    ]);
    setChatInput("");
  };

  const handlePromptStarter = (prompt: string) => {
    const response = answerQuestion(prompt, report, activeCase);
    setChatMessages((currentMessages) => [
      ...currentMessages,
      { role: "user", content: prompt },
      { role: "assistant", content: response },
    ]);
  };

  const downloadReport = () => {
    const fileName = `${activeCase.case_id}-audit-report.json`;
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
    const content = report.fix_plan.map((item, index) => `${index + 1}. ${item}`).join("\n");
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
              Cross-domain model integrity review for researchers, students, and teams
              shipping predictive workflows.
            </h2>
            <p className="hero-text">
              LeakGuard is not another prediction model. It audits whether your dataset,
              features, and validation setup are methodologically trustworthy before you
              trust the metric.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#workspace">
                Launch Hybrid Audit Demo
              </a>
              <button className="ghost-button" type="button" onClick={resetToDefaults}>
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
              <span className="hero-kicker">Cross-domain proof</span>
              <p>Housing, healthcare, and finance cases all route through the same audit engine.</p>
            </div>
          </div>
        </section>

        <section className="domain-strip">
          <article className="domain-card">
            <h3>Housing</h3>
            <p>Spot future rent aggregates, post-lease answers, and repeated-building split leakage.</p>
          </article>
          <article className="domain-card">
            <h3>Healthcare</h3>
            <p>Audit whether an early-warning score is relying on operational response signals instead of true pre-event evidence.</p>
          </article>
          <article className="domain-card">
            <h3>Finance</h3>
            <p>Separate real underwriting signals from post-origination collections and repayment behavior.</p>
          </article>
        </section>

        <section className="workspace-section" id="workspace">
          <div className="section-header">
            <div>
              <p className="eyebrow">Hybrid Workspace</p>
              <h2>Run the audit, inspect the evidence, then ask the agent to explain it.</h2>
            </div>
            <div className="run-panel">
              <span className="run-status">{lastRunLabel}</span>
              <button className="primary-button" type="button" onClick={runAudit} disabled={isRunning}>
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
                onClick={() => setActiveCaseId(demoCase.case_id)}
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
                  <a href={activeCase.source_url} target="_blank" rel="noreferrer">
                    {activeCase.source_label}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="workspace-grid">
            <section className="panel intake-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Structured Intake</p>
                  <h3>Dataset + metadata first</h3>
                </div>
                <button className="tiny-button" type="button" onClick={resetToDefaults}>
                  Use demo defaults
                </button>
              </div>

              <label className="field">
                <span>Dataset reference</span>
                <input
                  type="text"
                  value={request.dataset_ref}
                  onChange={(event) =>
                    setRequest((current) => ({ ...current, dataset_ref: event.target.value }))
                  }
                />
              </label>

              <div className="upload-row">
                <label className="upload-card">
                  <span>Upload dataset</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => void handleDatasetUpload(event.target.files?.[0])}
                  />
                </label>
                <label className="upload-card">
                  <span>Upload optional artifacts</span>
                  <input
                    type="file"
                    multiple
                    onChange={(event) => handleArtifactUpload(event.target.files)}
                  />
                </label>
              </div>

              <label className="field">
                <span>Prediction goal</span>
                <textarea
                  rows={3}
                  value={request.prediction_goal}
                  onChange={(event) =>
                    setRequest((current) => ({
                      ...current,
                      prediction_goal: event.target.value,
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
                    onChange={(event) =>
                      setRequest((current) => ({
                        ...current,
                        target_column: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Domain</span>
                  <input type="text" value={request.domain_template} readOnly />
                </label>
              </div>

              <div className="two-column">
                <label className="field">
                  <span>Timestamp fields</span>
                  <input
                    type="text"
                    value={joinValues(request.timestamp_fields)}
                    onChange={(event) =>
                      setRequest((current) => ({
                        ...current,
                        timestamp_fields: splitValues(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Entity keys</span>
                  <input
                    type="text"
                    value={joinValues(request.entity_keys)}
                    onChange={(event) =>
                      setRequest((current) => ({
                        ...current,
                        entity_keys: splitValues(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>

              <label className="field">
                <span>Pipeline notes</span>
                <textarea
                  rows={5}
                  value={request.pipeline_notes}
                  onChange={(event) =>
                    setRequest((current) => ({
                      ...current,
                      pipeline_notes: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field">
                <span>Model artifacts / notes</span>
                <textarea
                  rows={4}
                  value={request.model_artifacts_optional ?? ""}
                  onChange={(event) =>
                    setRequest((current) => ({
                      ...current,
                      model_artifacts_optional: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="feature-catalog">
                <div className="panel-header compact">
                  <div>
                    <p className="eyebrow">Feature Catalog</p>
                    <h4>{request.feature_dictionary.length} tracked fields</h4>
                  </div>
                </div>
                <div className="feature-list">
                  {request.feature_dictionary.map((feature) => (
                    <article className="feature-row" key={feature.name}>
                      <div>
                        <strong>{feature.name}</strong>
                        <p>{feature.description}</p>
                      </div>
                      <div className="feature-tags">
                        <span className="availability-chip">
                          {feature.availability ?? "unknown"}
                        </span>
                        {(feature.semantic_tags ?? []).map((tag) => (
                          <span className="tag-chip" key={`${feature.name}-${tag}`}>
                            {tag.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel trace-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Audit Console</p>
                  <h3>Agent trace</h3>
                </div>
                <span className="status-pill">{isRunning ? "Running" : "Ready"}</span>
              </div>

              <div className="trace-list">
                {traceSteps.map((step, index) => {
                  const state = isRunning
                    ? index < traceIndex
                      ? "done"
                      : index === traceIndex
                        ? "active"
                        : "pending"
                    : "done";

                  return (
                    <article className={`trace-step trace-${state}`} key={step.title}>
                      <div className="trace-marker">{index + 1}</div>
                      <div>
                        <h4>{step.title}</h4>
                        <p>{step.detail}</p>
                        {state === "done" && report.findings[index] ? (
                          <small>
                            Highlight: {report.findings[index].title}
                          </small>
                        ) : null}
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

            <section className="panel results-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Findings</p>
                  <h3>Evidence-backed report</h3>
                </div>
                <div className="results-actions">
                  <button className="tiny-button" type="button" onClick={downloadReport}>
                    Export JSON
                  </button>
                  <button className="tiny-button" type="button" onClick={() => void copyFixPlan()}>
                    Copy fix plan
                  </button>
                </div>
              </div>

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
                  {Object.entries(report.bucket_summary).map(([bucket, count]) => (
                    <div className="bucket-card" key={bucket}>
                      <strong>{count}</strong>
                      <span>{bucket}</span>
                    </div>
                  ))}
                </div>
                {copyStatus ? <p className="copy-status">{copyStatus}</p> : null}
              </article>

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
                      <span className={riskLabelClass(finding.severity)}>{finding.severity}</span>
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
                    <span className={riskLabelClass(selectedFinding.severity)}>
                      {selectedFinding.macro_bucket}
                    </span>
                  </div>
                  <p className="detail-subtitle">{selectedFinding.title}</p>
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
                        {selectedFinding.fix_recommendation.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="detail-footer">
                    <p>{selectedFinding.why_it_matters}</p>
                    {selectedFinding.needs_human_review ? (
                      <span className="human-review-chip">Needs human review</span>
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
            </section>
          </div>

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
                  <span>{message.role === "assistant" ? "LeakGuard" : "You"}</span>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>

            <form className="chat-form" onSubmit={handleChatSubmit}>
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask why a finding is leaky, what to fix, or what metadata is missing."
              />
              <button className="primary-button" type="submit">
                Ask
              </button>
            </form>
          </section>
        </section>
      </main>
    </div>
  );
}
