import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  ArrowRight,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Clock,
  Network,
  Layers,
  ChevronDown,
  ChevronUp,
  Loader2,
  Download,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AmbientBackground } from '../components/AmbientBackground';
import { FloatingChat } from '../components/FloatingChat';
import { InlineChat } from '../components/InlineChat';
import type { SharedChatState, ChatMessage } from '../hooks/useChat';
import { Navigation } from '../components/Navigation';
import { Footer } from '../components/Footer';
import type { AuditFinding, AuditReport, AuditRequest, Severity, EvidenceCitation } from '../../types';
import { auditWithStream, type ThinkingStep } from '../../lib/llmEngine';
import { buildAuditRecord, saveAuditRecord } from '../lib/storage';
import { downloadAuditZip } from '../lib/exportZip';
import { AuditThinking } from '../components/AuditThinking';

type LeakageType = 'temporal' | 'feature' | 'pipeline';

interface UiFinding {
  id: string;
  feature: string;
  leakageType: LeakageType;
  severity: Severity;
  evidence: EvidenceCitation[];
  recommendation: string;
  humanReviewRequired: boolean;
  title: string;
  whyItMatters: string;
}

function macroToLeakage(macro: AuditFinding['macro_bucket']): LeakageType {
  if (macro === 'Time leakage') return 'temporal';
  if (macro === 'Feature / proxy leakage') return 'feature';
  return 'pipeline';
}

function mapFinding(f: AuditFinding): UiFinding {
  return {
    id: f.id,
    feature: f.flagged_object,
    leakageType: macroToLeakage(f.macro_bucket),
    severity: f.severity,
    evidence: f.evidence ?? [],
    recommendation: f.fix_recommendation.join(' '),
    humanReviewRequired: f.needs_human_review,
    title: f.title,
    whyItMatters: f.why_it_matters,
  };
}

const severityRank: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type LocationState = {
  request?: AuditRequest;
  report?: AuditReport;
  fromHistory?: boolean;
} | null | undefined;

export function AuditResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;
  const request = state?.request;
  const savedReport = state?.report;
  const fromHistory = state?.fromHistory ?? false;

  const [report, setReport] = useState<AuditReport | null>(savedReport ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(request) && !savedReport);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);

  useEffect(() => {
    if (savedReport || !request) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setReport(null);
    setThinkingSteps([]);

    (async () => {
      try {
        const nextReport = await auditWithStream(request, (step) => {
          if (cancelled) return;
          setThinkingSteps((prev) => [...prev, step]);
        });
        if (cancelled) return;
        setReport(nextReport);
        saveAuditRecord(
          buildAuditRecord({
            title: request.prediction_goal.slice(0, 120),
            domain: 'upload',
            request,
            report: nextReport,
          }),
        );
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Audit failed.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [request, savedReport]);

  const findings = useMemo(
    () => (report ? report.findings.map(mapFinding) : []),
    [report],
  );

  const completedAt = useMemo(() => new Date().toLocaleString(), [report]);

  const counts = useMemo(() => {
    if (!report) {
      return { critical: 0, high: 0, total: 0 };
    }
    const { findings: f } = report;
    return {
      critical: f.filter((x) => x.severity === 'critical').length,
      high: f.filter((x) => x.severity === 'high').length,
      total: f.length,
    };
  }, [report]);

  const [ctaVisible, setCtaVisible] = useState(false);
  const ctaObserverRef = useRef<IntersectionObserver | null>(null);

  // Callback ref — attaches the observer the moment the element appears in the DOM,
  // which may be after the audit finishes and the results section renders.
  const ctaRef = useCallback((el: HTMLDivElement | null) => {
    ctaObserverRef.current?.disconnect();
    ctaObserverRef.current = null;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCtaVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(el);
    ctaObserverRef.current = observer;
  }, []);

  // Shared chat state so InlineChat and FloatingChat stay in sync
  const [sharedConversation, setSharedConversation] = useState<ChatMessage[]>([]);
  const [sharedIsThinking, setSharedIsThinking] = useState(false);
  const sharedChat: SharedChatState = {
    conversation: sharedConversation,
    setConversation: setSharedConversation,
    isThinking: sharedIsThinking,
    setIsThinking: setSharedIsThinking,
  };

  const actionItems = useMemo(() => {
    if (!report) return [];
    return [...report.findings]
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .slice(0, 8);
  }, [report]);

  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [leakageFilter, setLeakageFilter] = useState<'all' | LeakageType>('all');

  const severityCounts = useMemo(() => {
    const map: Record<string, number> = { all: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) map[f.severity] = (map[f.severity] ?? 0) + 1;
    return map;
  }, [findings]);

  const leakageCounts = useMemo(() => {
    const map: Record<string, number> = { all: findings.length, temporal: 0, feature: 0, pipeline: 0 };
    for (const f of findings) map[f.leakageType] = (map[f.leakageType] ?? 0) + 1;
    return map;
  }, [findings]);

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (leakageFilter !== 'all' && f.leakageType !== leakageFilter) return false;
      return true;
    });
  }, [findings, severityFilter, leakageFilter]);

  const fadeInVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  };

  if (!request) {
    return (
      <div className="min-h-screen relative bg-[var(--background)]">
        <Navigation />
        <div className="h-20" />
        <div className="max-w-lg mx-auto px-8 py-24 text-center">
          <p className="text-[var(--foreground)] mb-4">No audit to show. Start from setup and run an audit.</p>
          <Link
            to="/setup"
            className="inline-flex items-center gap-2 text-[var(--accent-primary)] font-medium hover:underline"
          >
            Go to Audit Setup
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen relative bg-[var(--background)]">
        <Navigation />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <AmbientBackground variant="subtle" />
        </div>
        <div className="h-20" />
        <div className="flex flex-col items-center justify-center py-20 px-8 relative z-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl text-[var(--foreground)] font-medium mb-2">Running Clarion Audit</h2>
            <p className="text-sm text-[var(--muted-foreground)] max-w-md">
              Clarion is analyzing your task, columns, and code for data leakage patterns.
            </p>
          </div>
          <AuditThinking steps={thinkingSteps} />
        </div>
        <Footer />
      </div>
    );
  }

  if (loadError || !report) {
    return (
      <div className="min-h-screen relative bg-[var(--background)]">
        <Navigation />
        <div className="h-20" />
        <div className="max-w-lg mx-auto px-8 py-24 text-center">
          <p className="text-[var(--risk-critical)] mb-2 font-medium">Audit could not complete</p>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">{loadError ?? 'Unknown error.'}</p>
          <p className="text-xs text-[var(--muted-foreground)] mb-6">
            Ensure the API server is running (<code className="font-mono bg-[var(--secondary)] px-1">npm run server</code> or{' '}
            <code className="font-mono bg-[var(--secondary)] px-1">npm run dev:full</code>) and{' '}
            <code className="font-mono bg-[var(--secondary)] px-1">OPENAI_API_KEY</code> is set in{' '}
            <code className="font-mono bg-[var(--secondary)] px-1">.env</code>.
          </p>
          <button
            type="button"
            onClick={() => navigate('/setup', { replace: true })}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm"
          >
            Back to Setup
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  const overallRisk = report.overall_risk;
  const auditReportText = report.narrative_report || report.summary;

  return (
    <div className="min-h-screen relative bg-[var(--background)]">
      <Navigation />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AmbientBackground variant="subtle" />
      </div>

      <div className="h-20" />

      <div className="max-w-5xl mx-auto px-8 py-12 relative z-10">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <Link
              to="/setup"
              className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--accent-primary)] transition-colors"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to Setup
            </Link>
          </div>
          <button
            type="button"
            onClick={() => downloadAuditZip(report)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)]/60 bg-white/65 backdrop-blur-sm text-sm text-[var(--foreground)] hover:border-[var(--accent-primary)]/40 hover:text-[var(--accent-primary)] transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Report
          </button>
        </div>

        <motion.div initial="hidden" animate="visible" variants={fadeInVariants} className="mb-10">
          <div className="bg-white/65 backdrop-blur-sm rounded-xl border border-[var(--border)]/60 overflow-hidden">
            {/* Top summary row */}
            <div className="px-8 pt-6 pb-5 flex items-start justify-between flex-wrap gap-6">
              <div className="flex items-center gap-10">
                <div>
                  <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)] mb-2">Overall Risk Level</p>
                  <RiskBadge severity={overallRisk} large />
                </div>
                <div className="h-12 w-px bg-[var(--border)]/60 hidden sm:block" />
                {/* Severity counts */}
                <div className="flex items-center gap-8">
                  {[
                    { label: 'Critical', count: severityCounts.critical ?? 0, color: 'text-[var(--risk-critical)]' },
                    { label: 'High', count: severityCounts.high ?? 0, color: 'text-[var(--risk-high)]' },
                    { label: 'Medium', count: severityCounts.medium ?? 0, color: 'text-[var(--risk-medium)]' },
                    { label: 'Low', count: severityCounts.low ?? 0, color: 'text-lime-600' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex flex-col items-center gap-1">
                      <span className={`text-2xl font-semibold ${color}`}>{count}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Audit completed</p>
                <p className="text-sm text-[var(--foreground)]">{completedAt}</p>
              </div>
            </div>

            {/* Leakage type breakdown bar */}
            {findings.length > 0 && (() => {
              const temporal = findings.filter(f => f.leakageType === 'temporal').length;
              const feature = findings.filter(f => f.leakageType === 'feature').length;
              const pipeline = findings.filter(f => f.leakageType === 'pipeline').length;
              const total = findings.length;
              return (
                <div className="px-8 pb-6">
                  <p className="text-xs text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">Leakage breakdown</p>
                  <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                    {temporal > 0 && <div className="bg-blue-500 transition-all duration-700" style={{ width: `${(temporal / total) * 100}%` }} />}
                    {feature > 0 && <div className="bg-violet-400 transition-all duration-700" style={{ width: `${(feature / total) * 100}%` }} />}
                    {pipeline > 0 && <div className="bg-blue-300 transition-all duration-700" style={{ width: `${(pipeline / total) * 100}%` }} />}
                  </div>
                  <div className="flex items-center gap-5 mt-2">
                    {[
                      { label: 'Temporal', count: temporal, color: 'bg-blue-500' },
                      { label: 'Feature', count: feature, color: 'bg-violet-400' },
                      { label: 'Pipeline', count: pipeline, color: 'bg-blue-300' },
                    ].filter(x => x.count > 0).map(({ label, count, color }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${color}`} />
                        <span className="text-xs text-[var(--muted-foreground)]">{label} <span className="font-medium text-[var(--foreground)]">({count})</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl text-[var(--foreground)] mb-2">Detailed Findings</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Inspect each flagged item with evidence, severity, and remediation guidance
              </p>
            </div>
          </div>

          {findings.length === 0 ? (
            <div className="bg-white/65 backdrop-blur-sm rounded-xl border border-[var(--border)]/60 px-8 py-12 text-center text-sm text-[var(--muted-foreground)]">
              No issues were flagged for this submission. Review the narrative below for methodology notes.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                {/* Severity filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)] opacity-60 select-none">Severity</span>
                  <div className="flex items-center gap-1 p-0.5 bg-white/55 backdrop-blur-sm rounded-lg border border-[var(--border)]/50">
                    {FILTER_OPTIONS.map(({ key, label, dot }) => {
                      const count = severityCounts[key] ?? 0;
                      if (key !== 'all' && count === 0) return null;
                      const isActive = severityFilter === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSeverityFilter(key)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                            isActive
                              ? 'bg-white text-[var(--foreground)] shadow-sm border border-[var(--border)]/60'
                              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-transparent'
                          }`}
                        >
                          {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />}
                          <span>{label}</span>
                          <span className={`text-xs ${isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--muted-foreground)]'}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Leakage type filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)] opacity-60 select-none">Type</span>
                  <div className="flex items-center gap-1 p-0.5 bg-white/55 backdrop-blur-sm rounded-lg border border-[var(--border)]/50">
                    {LEAKAGE_FILTER_OPTIONS.map(({ key, label, dot }) => {
                      const count = leakageCounts[key] ?? 0;
                      if (key !== 'all' && count === 0) return null;
                      const isActive = leakageFilter === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setLeakageFilter(key)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                            isActive
                              ? 'bg-white text-[var(--foreground)] shadow-sm border border-[var(--border)]/60'
                              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-transparent'
                          }`}
                        >
                          {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />}
                          <span>{label}</span>
                          <span className={`text-xs ${isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--muted-foreground)]'}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="bg-white/65 backdrop-blur-sm rounded-xl border border-[var(--border)]/60 divide-y divide-[var(--border)]/50">
                {filteredFindings.length === 0 ? (
                  <div className="px-8 py-12 text-center text-sm text-[var(--muted-foreground)]">
                    No findings match this filter.
                  </div>
                ) : (
                  filteredFindings.map((finding) => (
                    <FindingItem
                      key={finding.id}
                      finding={finding}
                      expanded={expandedFinding === finding.id}
                      onToggle={() =>
                        setExpandedFinding(expandedFinding === finding.id ? null : finding.id)
                      }
                    />
                  ))
                )}
              </div>
            </>
          )}
        </motion.div>

        {/* Mid-page ambient gradient — purely decorative */}
        <div className="relative h-0 overflow-visible pointer-events-none">
          <AmbientBackground variant="midpage" className="!overflow-visible -translate-y-40" />
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          transition={{ delay: 0.2 }}
          className="mb-10"
        >
          <div className="mb-6">
            <h2 className="text-2xl text-[var(--foreground)] mb-2">Audit Report</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Natural-language methodology review summarizing key findings
            </p>
          </div>

          <div className="bg-white/65 backdrop-blur-sm rounded-xl border border-[var(--border)]/60">
            <div className="px-8 py-8">
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <p className="text-sm text-[var(--foreground)] leading-relaxed mb-4 last:mb-0">
                      {children}
                    </p>
                  ),
                  h1: ({ children }) => (
                    <h1 className="text-lg font-semibold text-[var(--foreground)] mt-6 mb-3 first:mt-0">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-base font-semibold text-[var(--foreground)] mt-6 mb-2 first:mt-0">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-[var(--foreground)] mt-5 mb-2 first:mt-0">{children}</h3>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-outside pl-5 space-y-1 mb-4 text-sm text-[var(--foreground)]">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside pl-5 space-y-1.5 mb-4 text-sm text-[var(--foreground)]">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed">{children}</li>
                  ),
                  code: ({ children, className }) => {
                    const isBlock = className?.includes('language-');
                    if (isBlock) {
                      return (
                        <code className="block w-full rounded-lg bg-slate-50 border border-[var(--border)] px-4 py-3 text-xs font-mono text-slate-700 overflow-x-auto my-3">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className="px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--accent-primary)] text-xs font-mono border border-[var(--border)]">
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => <>{children}</>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-[var(--accent-primary)]/40 pl-4 italic text-[var(--muted-foreground)] my-3">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="border-[var(--border)]/50 my-4" />,
                }}
              >
                {auditReportText}
              </ReactMarkdown>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <div className="mb-6">
            <h2 className="text-2xl text-[var(--foreground)] mb-2">Recommended Actions</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Prioritized steps from the audit (by severity)
            </p>
          </div>

          <div className="bg-white/65 backdrop-blur-sm rounded-xl border border-[var(--border)]/60 divide-y divide-[var(--border)]/50">
              {actionItems.map((f, idx) => (
                <ActionItem
                  key={f.id}
                  index={idx + 1}
                  priority={f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}
                  action={f.title}
                  description={[f.why_it_matters, ...f.fix_recommendation].filter(Boolean).join(' ')}
                  severity={f.severity}
                />
              ))}
          </div>
        </motion.div>
      </div>

      {/* Ask Clarion inline chat */}
      <motion.div
        ref={ctaRef}
        initial="hidden"
        animate="visible"
        variants={fadeInVariants}
        transition={{ delay: 0.4 }}
        className="max-w-7xl mx-auto px-8 mb-16"
      >
        <div className="mb-6">
          <h2 className="text-2xl text-[var(--foreground)] mb-2">Ask Clarion</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Have questions about these findings? Ask Clarion for guidance.
          </p>
        </div>
        <InlineChat context="results" auditContext={{ request, report }} shared={sharedChat} />
      </motion.div>

      <Footer />

      <FloatingChat
        context="results"
        auditContext={{ request, report }}
        hidden={ctaVisible}
        shared={sharedChat}
      />
    </div>
  );
}

function RiskBadge({ severity, large = false }: { severity: Severity; large?: boolean }) {
  const getStyles = () => {
    if (severity === 'critical')
      return {
        bg: 'bg-red-50',
        text: 'text-[var(--risk-critical)]',
        border: 'border-red-200',
        icon: AlertTriangle,
      };
    if (severity === 'high')
      return {
        bg: 'bg-orange-50',
        text: 'text-[var(--risk-high)]',
        border: 'border-orange-200',
        icon: AlertCircle,
      };
    if (severity === 'medium')
      return {
        bg: 'bg-amber-50',
        text: 'text-[var(--risk-medium)]',
        border: 'border-amber-200',
        icon: Info,
      };
    return {
      bg: 'bg-lime-50',
      text: 'text-[var(--risk-low)]',
      border: 'border-lime-200',
      icon: CheckCircle,
    };
  };

  const styles = getStyles();
  const Icon = styles.icon;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${styles.bg} ${styles.text} ${styles.border} ${
        large ? 'text-sm' : 'text-xs'
      }`}
    >
      <Icon className={large ? 'w-4 h-4' : 'w-3 h-3'} />
      <span className="font-semibold uppercase tracking-wide">{severity}</span>
    </div>
  );
}

function StatusMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <p className="text-xs text-[var(--muted-foreground)] mb-2">{label}</p>
      <p className={`text-2xl font-medium ${color}`}>{value}</p>
    </div>
  );
}

function FindingItem({
  finding,
  expanded,
  onToggle,
}: {
  finding: UiFinding;
  expanded: boolean;
  onToggle: () => void;
}) {
  const getLeakageIcon = () => {
    if (finding.leakageType === 'temporal') return Clock;
    if (finding.leakageType === 'feature') return Network;
    return Layers;
  };

  const Icon = getLeakageIcon();

  return (
    <motion.div
      className="px-8 py-5 transition-colors cursor-pointer"
      whileHover={{
        backgroundColor: 'rgba(255,255,255,0.28)',
        y: -1,
        boxShadow: '0 4px 16px rgba(167,191,251,0.18)',
        transition: { duration: 0.18, ease: 'easeOut' },
      }}
    >
      <div onClick={onToggle} className="flex items-start justify-between cursor-pointer group">
        <div className="flex items-start gap-5 flex-1">
          <motion.div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--secondary)]"
            whileHover={{ scale: 1.08, transition: { duration: 0.15 } }}
          >
            <Icon className="w-5 h-5 text-[var(--muted-foreground)]" />
          </motion.div>
          <div className="flex-1 pt-0.5 min-w-0">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">{finding.title}</p>
            <code className="text-sm text-[var(--foreground)] font-mono font-medium break-all block mb-2">
              {finding.feature}
            </code>
            <div className="flex items-center gap-2 flex-wrap">
              <RiskBadge severity={finding.severity} />
              <span className="text-xs text-[var(--muted-foreground)]">
                {finding.leakageType === 'feature' ? 'Feature Leakage' : finding.leakageType === 'temporal' ? 'Temporal Leakage' : 'Pipeline Leakage'}
              </span>
              {finding.humanReviewRequired && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                  Human review required
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="text-[var(--muted-foreground)] hover:text-[var(--accent-primary)] transition-colors p-1"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="mt-6 ml-[60px] space-y-5 border-l border-[var(--border)]/50 pl-6"
        >
          <div>
            <h4 className="text-xs uppercase tracking-wide text-[var(--muted-foreground)] mb-3 font-medium">
              Why it matters
            </h4>
            <p className="text-sm text-[var(--foreground)] leading-relaxed">{finding.whyItMatters}</p>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-wide text-[var(--muted-foreground)] mb-3 font-medium">
              Evidence
            </h4>
            <ul className="space-y-3">
              {finding.evidence.map((item, idx) => (
                <EvidenceRow key={idx} item={item} />
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-wide text-[var(--muted-foreground)] mb-3 font-medium">
              Recommendation
            </h4>
            <p className="text-sm text-[var(--foreground)] leading-relaxed">{finding.recommendation}</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

const FILTER_OPTIONS: Array<{ key: 'all' | Severity; label: string; dot?: string; icon?: typeof AlertTriangle }> = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical', dot: 'bg-red-500', icon: AlertTriangle },
  { key: 'high', label: 'High', dot: 'bg-orange-500', icon: AlertCircle },
  { key: 'medium', label: 'Medium', dot: 'bg-amber-500', icon: Info },
  { key: 'low', label: 'Low', dot: 'bg-lime-500', icon: CheckCircle },
];

function SeverityFilterBar({
  active,
  counts,
  onChange,
}: {
  active: 'all' | Severity;
  counts: Record<string, number>;
  onChange: (value: 'all' | Severity) => void;
}) {
  return (
    <div className="flex items-center gap-1 mb-2 p-0.5 bg-white/55 backdrop-blur-sm rounded-lg border border-[var(--border)]/50 w-fit">
      {FILTER_OPTIONS.map(({ key, label, dot }) => {
        const count = counts[key] ?? 0;
        if (key !== 'all' && count === 0) return null;
        const isActive = active === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              isActive
                ? 'bg-white text-[var(--foreground)] shadow-sm border border-[var(--border)]/60'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-transparent'
            }`}
          >
            {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />}
            <span>{label}</span>
            <span className={`text-xs ${isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--muted-foreground)]'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const LEAKAGE_FILTER_OPTIONS: Array<{ key: 'all' | LeakageType; label: string; dot?: string }> = [
  { key: 'all', label: 'All' },
  { key: 'temporal', label: 'Temporal', dot: 'bg-blue-500' },
  { key: 'feature', label: 'Feature', dot: 'bg-violet-400' },
  { key: 'pipeline', label: 'Pipeline', dot: 'bg-blue-300' },
];

function LeakageFilterBar({
  active,
  counts,
  onChange,
}: {
  active: 'all' | LeakageType;
  counts: Record<string, number>;
  onChange: (value: 'all' | LeakageType) => void;
}) {
  return (
    <div className="flex items-center gap-1 mb-4 p-0.5 bg-white/55 backdrop-blur-sm rounded-lg border border-[var(--border)]/50 w-fit">
      {LEAKAGE_FILTER_OPTIONS.map(({ key, label, dot }) => {
        const count = counts[key] ?? 0;
        if (key !== 'all' && count === 0) return null;
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              isActive
                ? 'bg-white text-[var(--foreground)] shadow-sm border border-[var(--border)]/60'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-transparent'
            }`}
          >
            {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />}
            <span>{label}</span>
            <span className={`text-xs ${isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--muted-foreground)]'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EvidenceRow({ item }: { item: EvidenceCitation }) {
  const [expanded, setExpanded] = useState(false);

  if (!item.text?.trim()) return null;

  const hasLabel = Boolean(item.citation_label?.trim());
  const isCode = item.source_type === 'preprocessing_code' || item.source_type === 'model_training_code';
  const isCsv = item.source_type === 'csv_header';

  return (
    <li>
      <div className="flex items-start gap-3 text-sm text-[var(--foreground)]">
        <span className="text-[var(--accent-primary)] mt-0.5 font-bold flex-shrink-0">•</span>
        <span className="leading-relaxed">{item.text}</span>
      </div>

      {hasLabel && (
        <div className="ml-6 mt-1.5">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF3F8] text-[#64748B] text-xs cursor-pointer hover:bg-[#E2E8F0] transition-colors"
          >
            <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 1h8a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1zm0 1v12h8V2H4zm1 2h6v1H5V4zm0 2.5h6v1H5v-1zm0 2.5h4v1H5V9z" />
            </svg>
            <span>{item.citation_label}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>

          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 overflow-hidden"
            >
              {isCode ? (
                <pre className="bg-[#1E293B] text-[#E2E8F0] p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {item.citation_detail}
                </pre>
              ) : isCsv ? (
                <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-[var(--border)] bg-[#fafbfc]">
                  {item.citation_detail.split(', ').map((col, i) => (
                    <span
                      key={i}
                      className="bg-[#E2E8F0] px-2 py-1 rounded text-xs font-mono text-[var(--foreground)]"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="border-l-2 border-[#94A3B8] pl-4 text-sm text-[#64748B] italic leading-relaxed">
                  {item.citation_detail}
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </li>
  );
}

// Splits text on backtick-quoted tokens and snake_case/camelCase identifiers,
// rendering them as inline <code> elements.
function inlineCode(text: string): React.ReactNode[] {
  // Match `backtick` spans first, then bare snake_case or camelCase identifiers
  const parts = text.split(/(`[^`]+`|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z]+[A-Z][a-zA-Z0-9]+\b)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[0.75em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(part) || /^[a-z]+[A-Z][a-zA-Z0-9]+$/.test(part)) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[0.75em]">
          {part}
        </code>
      );
    }
    return part;
  });
}

// Returns true when a double-quoted string's contents look like code or an identifier.
function looksLikeCode(s: string): boolean {
  // Strip trailing sentence punctuation that sometimes ends up inside the quotes
  const clean = s.replace(/[.,;:!?]+$/, '').trim();
  if (clean.length === 0) return false;
  // Code expressions: contain brackets, operators, or dots (e.g. df['col'] = ...)
  if (/[\[\]()=]/.test(clean)) return true;
  // Identifier: has at least one underscore (snake_case, any case start)
  if (/_/.test(clean)) return true;
  // CamelCase / PascalCase identifier (≥ 2 words merged, e.g. SelectKBest, trainTestSplit)
  if (/^[A-Za-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(clean)) return true;
  return false;
}

// One-pass scanner: backtick spans → "double-quoted code/identifiers" → bare snake_case/camelCase.
// This handles uppercase starts ("Days_on_market"), trailing punctuation inside quotes
// ("leased_within_7_days."), and full code expressions ("df['col'] = df.groupby(...)").
function renderReportInline(text: string): React.ReactNode[] {
  const codeClass =
    'px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--accent-primary)] text-xs font-mono border border-[var(--border)]';
  // Order matters: backtick first, then double-quoted, then bare identifiers
  const re = /`([^`]+)`|"([^"]+)"|(\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z]+[A-Z][a-zA-Z0-9]+\b)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    if (match[1] !== undefined) {
      // `backtick` span
      nodes.push(<code key={match.index} className={codeClass}>{match[1]}</code>);
    } else if (match[2] !== undefined) {
      // "double-quoted" content — render as code only if it looks like an identifier/snippet
      const inner = match[2];
      const trailingPunct = inner.match(/[.,;:!?]+$/)?.[0] ?? '';
      const clean = inner.slice(0, inner.length - trailingPunct.length).trim();
      if (looksLikeCode(inner)) {
        // Emit the code block, then restore any punctuation that was inside the quotes
        nodes.push(<code key={match.index} className={codeClass}>{clean}</code>);
        if (trailingPunct) nodes.push(trailingPunct);
      } else {
        nodes.push(`"${inner}"`);
      }
    } else if (match[3] !== undefined) {
      // bare snake_case or camelCase identifier
      nodes.push(<code key={match.index} className={codeClass}>{match[3]}</code>);
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return nodes;
}

function ActionItem({
  index,
  priority,
  action,
  description,
  severity,
}: {
  index: number;
  priority: string;
  action: string;
  description: string;
  severity: Severity;
}) {
  const indexColor = severity === 'critical' ? 'text-red-400'
    : severity === 'high' ? 'text-orange-400'
    : severity === 'medium' ? 'text-amber-400'
    : 'text-lime-500';

  return (
    <motion.div
      className="group flex items-start gap-5 px-8 py-5"
      whileHover={{
        backgroundColor: 'rgba(255,255,255,0.28)',
        y: -1,
        boxShadow: '0 4px 16px rgba(167,191,251,0.18)',
        transition: { duration: 0.18, ease: 'easeOut' },
      }}
    >
      <span className={`text-lg font-serif font-semibold ${indexColor} flex-shrink-0 w-5 text-center leading-tight mt-0.5`}>
        {String(index).padStart(2, '0')}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <h4 className="text-sm font-medium text-[var(--foreground)]">{inlineCode(action)}</h4>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <RiskBadge severity={severity} />
          </span>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{inlineCode(description)}</p>
      </div>
    </motion.div>
  );
}
