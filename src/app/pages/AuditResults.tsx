import { motion } from 'motion/react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  ArrowRight,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Clock,
  Network,
  Shield,
  ChevronDown,
  ChevronUp,
  Loader2,
  Download,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AmbientBackground } from '../components/AmbientBackground';
import { FloatingChat } from '../components/FloatingChat';
import { Navigation } from '../components/Navigation';
import { Footer } from '../components/Footer';
import type { AuditFinding, AuditReport, AuditRequest, Severity } from '../../types';
import { auditWithLLM } from '../../lib/llmEngine';
import { buildAuditRecord, saveAuditRecord } from '../lib/storage';
import { downloadAuditZip } from '../lib/exportZip';

type LeakageType = 'temporal' | 'feature' | 'pipeline';

interface UiFinding {
  id: string;
  feature: string;
  leakageType: LeakageType;
  severity: Severity;
  evidence: string[];
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
    evidence: f.evidence,
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

type LocationState = { request?: AuditRequest } | null | undefined;

export function AuditResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const request = (location.state as LocationState)?.request;

  const [report, setReport] = useState<AuditReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(request));

  useEffect(() => {
    if (!request) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setReport(null);

    (async () => {
      try {
        const nextReport = await auditWithLLM(request);
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
  }, [request]);

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

  const actionItems = useMemo(() => {
    if (!report) return [];
    return [...report.findings]
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .slice(0, 8);
  }, [report]);

  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

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
        <div className="h-20" />
        <div className="flex flex-col items-center justify-center py-32 px-8">
          <Loader2 className="w-10 h-10 text-[var(--accent-primary)] animate-spin mb-4" />
          <p className="text-[var(--foreground)] font-medium">Running LeakGuard audit…</p>
          <p className="text-sm text-[var(--muted-foreground)] mt-2 max-w-md text-center">
            The agent is analyzing your task, columns, and code. This can take a couple of minutes.
          </p>
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-white text-sm text-[var(--foreground)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download Report
          </button>
        </div>

        <motion.div initial="hidden" animate="visible" variants={fadeInVariants} className="mb-10">
          <div className="bg-white rounded-lg border border-[var(--border)] shadow-sm">
            <div className="px-8 py-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground)] mb-3">
                      Overall Risk
                    </p>
                    <RiskBadge severity={overallRisk} large />
                  </div>
                  <div className="h-16 w-px bg-[var(--border)] hidden sm:block" />
                  <div className="grid grid-cols-3 gap-8">
                    <StatusMetric
                      label="Critical Findings"
                      value={String(counts.critical)}
                      color="text-[var(--risk-critical)]"
                    />
                    <StatusMetric
                      label="High Findings"
                      value={String(counts.high)}
                      color="text-[var(--risk-high)]"
                    />
                    <StatusMetric
                      label="Total Flagged"
                      value={String(counts.total)}
                      color="text-[var(--foreground)]"
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--muted-foreground)] mb-1">Audit completed</p>
                  <p className="text-sm text-[var(--foreground)]">{completedAt}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <div className="mb-6">
            <h2 className="text-2xl text-[var(--foreground)] mb-2">Detailed Findings</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Inspect each flagged item with evidence, severity, and remediation guidance
            </p>
          </div>

          {findings.length === 0 ? (
            <div className="bg-white rounded-lg border border-[var(--border)] px-8 py-12 text-center text-sm text-[var(--muted-foreground)]">
              No issues were flagged for this submission. Review the narrative below for methodology notes.
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-[var(--border)] shadow-sm divide-y divide-[var(--border)]">
              {findings.map((finding) => (
                <FindingItem
                  key={finding.id}
                  finding={finding}
                  expanded={expandedFinding === finding.id}
                  onToggle={() =>
                    setExpandedFinding(expandedFinding === finding.id ? null : finding.id)
                  }
                />
              ))}
            </div>
          )}
        </motion.div>

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

          <div className="bg-white rounded-lg border border-[var(--border)] shadow-sm">
            <div className="px-8 py-8">
              <div className="prose prose-sm max-w-none space-y-6">
                {auditReportText.split('\n\n').map((paragraph, idx) => {
                  const trimmed = paragraph.trim();
                  if (trimmed.startsWith('**')) {
                    const title = trimmed.replace(/^\*\*|\*\*$/g, '').replace(/\*\*/g, '');
                    return (
                      <h3
                        key={idx}
                        className="text-base font-medium text-[var(--foreground)] mt-8 mb-3 first:mt-0"
                      >
                        {title}
                      </h3>
                    );
                  }
                  return (
                    <p key={idx} className="text-sm text-[var(--foreground)] leading-relaxed">
                      {trimmed.split('`').map((part, i) =>
                        i % 2 === 0 ? (
                          part
                        ) : (
                          <code
                            key={i}
                            className="px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--accent-primary)] text-xs font-mono border border-[var(--border)]"
                          >
                            {part}
                          </code>
                        ),
                      )}
                    </p>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {report.clarifying_questions.length > 0 && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            transition={{ delay: 0.25 }}
            className="mb-10"
          >
            <div className="mb-4">
              <h2 className="text-xl text-[var(--foreground)] mb-1">Clarifying questions</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                The agent flagged these for human confirmation
              </p>
            </div>
            <ul className="bg-white rounded-lg border border-[var(--border)] px-8 py-6 space-y-3 text-sm text-[var(--foreground)] list-disc pl-5">
              {report.clarifying_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </motion.div>
        )}

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          transition={{ delay: 0.3 }}
          className="mb-16"
        >
          <div className="mb-6">
            <h2 className="text-2xl text-[var(--foreground)] mb-2">Recommended Actions</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Prioritized steps from the audit (by severity)
            </p>
          </div>

          <div className="bg-white rounded-lg border border-[var(--border)] shadow-sm">
            <div className="px-8 py-8 space-y-6">
              {actionItems.map((f) => (
                <ActionItem
                  key={f.id}
                  priority={f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}
                  action={f.title}
                  description={[f.why_it_matters, ...f.fix_recommendation].filter(Boolean).join(' ')}
                  severity={f.severity}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      <Footer />

      <FloatingChat context="results" auditContext={{ request, report }} />
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
      className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-md border ${styles.bg} ${styles.text} ${styles.border} ${
        large ? 'text-base' : 'text-xs'
      }`}
    >
      <Icon className={large ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
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
    return Shield;
  };

  const Icon = getLeakageIcon();

  return (
    <div className="px-8 py-6 hover:bg-[var(--secondary)] transition-colors">
      <div onClick={onToggle} className="flex items-start justify-between cursor-pointer group">
        <div className="flex items-start gap-5 flex-1">
          <div className="w-10 h-10 rounded-lg bg-[var(--secondary)] flex items-center justify-center flex-shrink-0 border border-[var(--border)] group-hover:border-[var(--accent-primary)] transition-colors">
            <Icon className="w-5 h-5 text-[var(--accent-primary)]" />
          </div>
          <div className="flex-1 pt-0.5 min-w-0">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">{finding.title}</p>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <code className="text-base text-[var(--foreground)] font-mono font-medium break-all">
                {finding.feature}
              </code>
              <RiskBadge severity={finding.severity} />
              {finding.humanReviewRequired && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                  Human review required
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--muted-foreground)] capitalize">
              {finding.leakageType} leakage
            </p>
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
          className="mt-6 ml-[60px] space-y-5 border-l-2 border-[var(--border)] pl-6"
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
            <ul className="space-y-2">
              {finding.evidence.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-[var(--foreground)]">
                  <span className="text-[var(--accent-primary)] mt-1 font-bold">•</span>
                  <span className="leading-relaxed">{item}</span>
                </li>
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
    </div>
  );
}

function ActionItem({
  priority,
  action,
  description,
  severity,
}: {
  priority: string;
  action: string;
  description: string;
  severity: Severity;
}) {
  const getBadgeColor = () => {
    if (severity === 'critical') return 'bg-red-50 text-[var(--risk-critical)] border-red-200';
    if (severity === 'high') return 'bg-orange-50 text-[var(--risk-high)] border-orange-200';
    if (severity === 'medium') return 'bg-amber-50 text-[var(--risk-medium)] border-amber-200';
    return 'bg-lime-50 text-[var(--risk-low)] border-lime-200';
  };

  return (
    <div className="flex items-start gap-4">
      <div
        className={`px-3 py-1 rounded-md border text-xs font-semibold uppercase tracking-wide ${getBadgeColor()} flex-shrink-0 mt-0.5`}
      >
        {priority}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-base text-[var(--foreground)] font-medium mb-2">{action}</h4>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
