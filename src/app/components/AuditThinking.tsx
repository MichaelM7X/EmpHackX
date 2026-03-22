import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import {
  CheckCircle,
  Loader2,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Search,
  Code,
  FileSearch,
  Bot,
  FileText,
} from 'lucide-react';
import type { ThinkingStep } from '../../lib/llmEngine';
import { ClarionLogo } from './ClarionLogo';

const ClarionIconSmall = ({ className }: { className?: string }) => (
  <ClarionLogo size={16} animate={false} className={className} />
);

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'pipeline-scan': Search,
  'proxy-detector': ClarionIconSmall,
  'temporal-detector': FileSearch,
  'code-auditor': Code,
  'model-auditor': Code,
  'structural-check': Search,
  'review-agent': Bot,
  'report-gen': FileText,
};

function StepIcon({ stepId, status }: { stepId: string; status: string }) {
  if (status === 'running') {
    return <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin" />;
  }
  if (status === 'done') {
    return <CheckCircle className="w-4 h-4 text-emerald-500" />;
  }
  if (status === 'skipped') {
    return <SkipForward className="w-4 h-4 text-[var(--muted-foreground)]" />;
  }
  const Icon = STEP_ICONS[stepId] ?? Search;
  return <Icon className="w-4 h-4 text-[var(--muted-foreground)]" />;
}

function StatusDot({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent-primary)] opacity-75 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-primary)]" />
      </span>
    );
  }
  if (status === 'done') {
    return <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />;
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />;
}

function ThinkingOrb({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
      <motion.div
        className="absolute inset-0 rounded-[32%] opacity-90 blur-[1px]"
        style={{
          background:
            'radial-gradient(circle at 30% 28%, rgba(255,255,255,0.98) 0%, rgba(206,233,255,0.95) 24%, rgba(189,210,255,0.9) 50%, rgba(215,188,255,0.82) 72%, rgba(255,173,228,0.68) 100%)',
          boxShadow:
            '0 0 0 1px rgba(255,255,255,0.75) inset, 0 0 36px rgba(139, 92, 246, 0.18), 0 0 56px rgba(96, 165, 250, 0.22)',
        }}
        animate={
          reduceMotion
            ? undefined
            : {
                rotate: active ? [0, 10, -6, 0] : 0,
                scale: active ? [1, 1.04, 0.98, 1] : 1,
                borderRadius: active
                  ? ['32% 37% 34% 39%', '40% 32% 42% 30%', '35% 44% 31% 41%', '32% 37% 34% 39%']
                  : '34% 36% 38% 35%',
              }
        }
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -inset-2 rounded-[38%] blur-xl"
        style={{
          background:
            'conic-gradient(from 180deg, rgba(255,255,255,0.72), rgba(125,211,252,0.48), rgba(244,114,182,0.4), rgba(196,181,253,0.46), rgba(255,255,255,0.72))',
        }}
        animate={
          reduceMotion
            ? undefined
            : {
                rotate: active ? 360 : 0,
                scale: active ? [0.96, 1.04, 0.98] : 0.98,
                opacity: active ? [0.45, 0.8, 0.55] : 0.35,
              }
        }
        transition={{
          rotate: { duration: 12, repeat: Infinity, ease: 'linear' },
          scale: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
          opacity: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' },
        }}
      />
      <motion.div
        className="absolute inset-2 rounded-[42%] blur-md"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(219,234,254,0.78) 42%, rgba(196,181,253,0.4) 72%, rgba(255,255,255,0) 100%)',
        }}
        animate={
          reduceMotion
            ? undefined
            : {
                scale: active ? [0.9, 1.08, 0.94] : 0.92,
                opacity: active ? [0.35, 0.78, 0.42] : 0.3,
              }
        }
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative z-10 flex items-center justify-center">
        <ClarionLogo size={28} animate={false} />
      </div>
    </div>
  );
}

export function AuditThinking({ steps }: { steps: ThinkingStep[] }) {
  const [expanded, setExpanded] = useState(true);
  const reduceMotion = useReducedMotion();
  const activeCount = steps.filter((s) => s.status === 'running').length;
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const totalSteps = steps.length;
  const currentStep = [...steps].reverse().find((s) => s.status === 'running');
  const latestDone = [...steps].reverse().find((s) => s.status === 'done');

  const uniqueSteps = steps.reduce<ThinkingStep[]>((acc, step) => {
    const idx = acc.findIndex((s) => s.id === step.id);
    if (idx >= 0) {
      acc[idx] = step;
    } else {
      acc.push(step);
    }
    return acc;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto w-full"
    >
      <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        {/* Header - always visible */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="relative w-full overflow-hidden px-5 py-5 sm:px-6 sm:py-6 transition-colors"
        >
          <motion.div
            className="absolute inset-0 opacity-95"
            style={{
              background:
                'radial-gradient(circle at 20% 18%, rgba(255,255,255,0.98), rgba(255,255,255,0.78) 18%, rgba(214,234,255,0.82) 34%, rgba(226,232,255,0.72) 52%, rgba(241,222,255,0.82) 72%, rgba(255,255,255,0.92) 100%)',
            }}
            animate={
              reduceMotion
                ? undefined
                : {
                    backgroundPosition: activeCount > 0 ? ['0% 50%', '100% 50%', '0% 50%'] : '50% 50%',
                    opacity: activeCount > 0 ? [0.92, 1, 0.94] : 0.96,
                  }
            }
            transition={{
              backgroundPosition: { duration: 10, repeat: Infinity, ease: 'easeInOut' },
              opacity: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
            }}
          />
          <motion.div
            className="absolute inset-x-[-10%] top-[-35%] h-[140%] rounded-full blur-3xl"
            style={{
              background:
                'conic-gradient(from 180deg, rgba(125,211,252,0.18), rgba(255,255,255,0.06), rgba(244,114,182,0.16), rgba(196,181,253,0.20), rgba(125,211,252,0.18))',
            }}
            animate={
              reduceMotion
                ? undefined
                : {
                    rotate: activeCount > 0 ? 360 : 0,
                    scale: activeCount > 0 ? [1, 1.06, 0.98] : 1,
                  }
            }
            transition={{
              rotate: { duration: 14, repeat: Infinity, ease: 'linear' },
              scale: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
            }}
          />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <ThinkingOrb active={activeCount > 0} />
              <div className="min-w-0 text-left">
                <div className="mb-1 flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--foreground)] sm:text-base">
                    {activeCount > 0 ? 'Clarion is auditing…' : 'Processing complete'}
                  </p>
                  {activeCount > 0 && (
                    <span className="inline-flex items-center rounded-full border border-sky-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600 backdrop-blur-sm">
                      Live
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted-foreground)] sm:text-sm">
                  {currentStep?.title ?? latestDone?.title ?? 'Initializing…'}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">
                  {activeCount > 0
                    ? 'Scanning signals, reasoning over patterns, and assembling the report.'
                    : 'All analysis passes finished successfully.'}
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-3 self-start pt-1">
              <span className="rounded-full border border-white/80 bg-white/65 px-2.5 py-1 text-xs text-[var(--muted-foreground)] tabular-nums backdrop-blur-sm">
                {doneCount}/{totalSteps > 0 ? totalSteps : '?'}
              </span>
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-[var(--muted-foreground)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
              )}
            </div>
          </div>
        </button>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100/80">
          <motion.div
            className="relative h-full overflow-hidden"
            style={{
              background:
                'linear-gradient(90deg, rgba(186,230,253,0.9) 0%, rgba(191,219,254,0.95) 28%, rgba(216,180,254,0.95) 58%, rgba(244,114,182,0.85) 100%)',
            }}
            initial={{ width: '0%' }}
            animate={{ width: totalSteps > 0 ? `${(doneCount / totalSteps) * 100}%` : '5%' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <motion.span
              className="absolute inset-y-0 right-0 w-16"
              style={{
                background:
                  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.78) 45%, rgba(255,255,255,0) 100%)',
              }}
              animate={reduceMotion ? undefined : { x: activeCount > 0 ? [-50, 30, -50] : 0 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </div>

        {/* Expandable step list */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="bg-white/90 px-6 py-4 space-y-1">
                {uniqueSteps.map((step, i) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.2 }}
                    className="flex items-start gap-3 py-2"
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      <StepIcon stepId={step.id} status={step.status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm ${
                            step.status === 'running'
                              ? 'text-[var(--foreground)] font-medium'
                              : step.status === 'skipped'
                                ? 'text-[var(--muted-foreground)] line-through'
                                : 'text-[var(--foreground)]'
                          }`}
                        >
                          {step.title}
                        </p>
                        <StatusDot status={step.status} />
                      </div>
                      {step.detail && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`text-xs mt-0.5 ${
                            step.status === 'running'
                              ? 'text-[var(--accent-primary)]'
                              : 'text-[var(--muted-foreground)]'
                          }`}
                        >
                          {step.detail}
                        </motion.p>
                      )}
                    </div>
                  </motion.div>
                ))}

                {activeCount > 0 && (
                  <motion.div
                    className="mt-2 flex items-center gap-2 border-t border-[var(--border)] pt-3"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      Working on it…
                    </span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
