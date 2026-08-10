"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Crosshair,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Target,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ensureNotificationPermission,
  notifyAnalysisComplete,
} from "@/lib/analysis/client-notify";
import {
  evidenceNeedsCollapse,
  structureFindingEvidence,
} from "@/lib/analysis/evidence";
import {
  overallToMergeDecision,
} from "@/lib/analysis/decision";
import {
  buildConfidenceReason,
  buildOverallConfidenceReason,
} from "@/lib/analysis/confidence";
import { finalDecisionLabel } from "@/lib/analysis/decision-engine";
import { classificationLabel } from "@/lib/analysis/scope/classify-pr";
import type {
  AnalysisDetail,
  AnalysisFindingRecord,
  AnalysisJobStatus,
  ConfidenceReason,
  DecisionTraceItem,
  FindingSeverity,
  IntentScopeResult,
  MergeDecision,
  StructuredEvidence,
} from "@/lib/analysis/types";
import type { Decision } from "@/types/domain";
import { cn } from "@/lib/utils";

interface AnalysisPanelProps {
  pullRequestId: string;
  currentHeadSha: string | null;
  initialAnalysis: AnalysisDetail | null;
}

const severityOrder: FindingSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

const severityStyles: Record<FindingSeverity, string> = {
  critical:
    "border-transparent bg-red-600/15 text-red-900 dark:bg-red-500/20 dark:text-red-100",
  high:
    "border-transparent bg-orange-600/15 text-orange-950 dark:bg-orange-500/20 dark:text-orange-100",
  medium:
    "border-transparent bg-amber-600/15 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100",
  low:
    "border-transparent bg-emerald-600/15 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100",
  info:
    "border-transparent bg-sky-500/15 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100",
};

const PROGRESS_STEPS = [
  { id: "collect", label: "Collecting PR files" },
  { id: "intent", label: "Extracting intent & scope" },
  { id: "filter", label: "Filtering context" },
  { id: "prompt", label: "Preparing prompt" },
  { id: "ai", label: "Running AI analysis" },
  { id: "validate", label: "Validating output" },
  { id: "save", label: "Saving analysis" },
  { id: "done", label: "Completed" },
] as const;

const RISK_STRIP_ORDER = [
  "SECURITY",
  "RELIABILITY",
  "PERFORMANCE",
  "MAINTAINABILITY",
  "AUTHENTICATION",
  "CONFIGURATION",
  "DATABASE",
  "API",
] as const;

function statusLabel(status: AnalysisJobStatus | "not_started"): string {
  switch (status) {
    case "not_started":
      return "Not started";
    case "pending":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function finalDecisionVisual(decision: Decision): {
  icon: typeof ShieldCheck;
  shell: string;
  badge: string;
  label: string;
  code: Decision;
} {
  switch (decision) {
    case "LOW":
      return {
        icon: ShieldCheck,
        shell:
          "border-emerald-600/30 bg-emerald-50 text-emerald-950 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-50",
        badge:
          "border-transparent bg-emerald-600/15 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-50",
        label: finalDecisionLabel(decision),
        code: decision,
      };
    case "REVIEW_RECOMMENDED":
      return {
        icon: ShieldAlert,
        shell:
          "border-amber-600/30 bg-amber-50 text-amber-950 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-50",
        badge:
          "border-transparent bg-amber-600/15 text-amber-950 dark:bg-amber-400/20 dark:text-amber-50",
        label: finalDecisionLabel(decision),
        code: decision,
      };
    case "REVIEW_REQUIRED":
      return {
        icon: ShieldAlert,
        shell:
          "border-orange-600/35 bg-orange-50 text-orange-950 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-50",
        badge:
          "border-transparent bg-orange-600/15 text-orange-950 dark:bg-orange-400/20 dark:text-orange-50",
        label: finalDecisionLabel(decision),
        code: decision,
      };
    case "BLOCKED":
      return {
        icon: ShieldX,
        shell:
          "border-red-600/35 bg-red-50 text-red-950 dark:border-red-400/40 dark:bg-red-500/15 dark:text-red-50",
        badge:
          "border-transparent bg-red-600/15 text-red-950 dark:bg-red-400/25 dark:text-red-50",
        label: finalDecisionLabel(decision),
        code: decision,
      };
  }
}

function mergeToFinal(decision: MergeDecision): Decision {
  switch (decision) {
    case "safe_to_merge":
      return "LOW";
    case "block_merge":
      return "BLOCKED";
    case "review_recommended":
    default:
      return "REVIEW_RECOMMENDED";
  }
}

function shortModelName(model: string | null | undefined): string {
  if (!model) return "—";
  const last = model.split("/").pop() ?? model;
  return last.replace(/:free$/i, "");
}

export function AnalysisPanel({
  pullRequestId,
  currentHeadSha,
  initialAnalysis,
}: AnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(
    initialAnalysis,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [progressFailed, setProgressFailed] = useState(false);
  const userTriggeredRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveStatus: AnalysisJobStatus | "not_started" =
    analysis?.status ?? "not_started";

  const isJobActive =
    effectiveStatus === "pending" || effectiveStatus === "running";

  const isActive = busy || isJobActive;

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const startProgressSimulation = useCallback(() => {
    clearProgressTimer();
    setProgressIndex(0);
    setProgressFailed(false);
    let step = 0;
    progressTimerRef.current = setInterval(() => {
      step += 1;
      // Advance through steps except final "Completed" until real finish
      setProgressIndex((prev) =>
        Math.min(prev + 1, PROGRESS_STEPS.length - 2),
      );
      if (step > 40) {
        clearProgressTimer();
      }
    }, 2200);
  }, [clearProgressTimer]);

  const refreshAnalysis = useCallback(async (analysisId: string) => {
    const res = await fetch(`/api/analysis/${analysisId}`);
    const body = (await res.json()) as {
      error?: string;
      analysis?: AnalysisDetail;
    };
    if (!res.ok) {
      throw new Error(body.error ?? "Failed to load analysis");
    }
    if (body.analysis) {
      setAnalysis(body.analysis);
    }
    return body.analysis ?? null;
  }, []);

  // Poll only while the job is truly pending/running.
  // Cap attempts so a stuck row can never spam the API forever.
  useEffect(() => {
    if (!analysis?.id || !isJobActive || busy) return;

    const id = analysis.id;
    let attempts = 0;
    const maxAttempts = 90; // ~3 minutes at 2s
    const pollStarted = Date.now();
    const maxPollMs = 5 * 60 * 1000;

    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > maxAttempts || Date.now() - pollStarted > maxPollMs) {
        clearInterval(timer);
        setProgressFailed(true);
        setError(
          "Analysis appears stuck or timed out. Use Retry analysis to start a fresh run.",
        );
        setAnalysis((prev) => {
          if (!prev) return prev;
          if (prev.status !== "pending" && prev.status !== "running") {
            return prev;
          }
          return {
            ...prev,
            status: "failed",
            errorMessage:
              prev.errorMessage ??
              "Analysis timed out while waiting for completion. Retry analysis.",
          };
        });
        return;
      }
      void refreshAnalysis(id).catch(() => {
        /* ignore transient poll errors */
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [analysis?.id, isJobActive, busy, refreshAnalysis]);

  useEffect(() => () => clearProgressTimer(), [clearProgressTimer]);

  async function startAnalysis(force: boolean) {
    setBusy(true);
    setError(null);
    userTriggeredRef.current = true;
    startProgressSimulation();

    // Request notification permission once (user gesture path).
    void ensureNotificationPermission();

    try {
      const res = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pullRequestId, force }),
      });
      const body = (await res.json()) as {
        error?: string;
        analysisId?: string;
        reused?: boolean;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to start analysis");
      }
      if (body.analysisId) {
        const detail = await refreshAnalysis(body.analysisId);
        clearProgressTimer();
        if (detail?.status === "failed") {
          setProgressFailed(true);
          setProgressIndex((i) => Math.min(i, PROGRESS_STEPS.length - 2));
        } else {
          setProgressIndex(PROGRESS_STEPS.length - 1);
          if (userTriggeredRef.current && detail?.status === "completed") {
            // Defer so paint isn't delayed
            queueMicrotask(() => notifyAnalysisComplete());
          }
        }
      }
    } catch (err) {
      clearProgressTimer();
      setProgressFailed(true);
      setError(err instanceof Error ? err.message : "Failed to start analysis");
    } finally {
      setBusy(false);
      userTriggeredRef.current = false;
    }
  }

  const finalDecision: Decision = useMemo(() => {
    if (analysis?.finalDecisionResult?.finalDecision) {
      return analysis.finalDecisionResult.finalDecision;
    }
    if (analysis?.finalDecision) {
      return analysis.finalDecision as Decision;
    }
    const merge =
      analysis?.decision ??
      overallToMergeDecision(analysis?.overallStatus ?? null);
    return mergeToFinal(merge);
  }, [analysis]);

  const decisionMeta = finalDecisionVisual(finalDecision);

  const primaryReason =
    analysis?.primaryReason ??
    analysis?.finalDecisionResult?.reasons[0]?.message ??
    (analysis?.summary
      ? analysis.summary.slice(0, 160)
      : "Run an analysis to produce a merge recommendation.");

  const decisionReasons =
    analysis?.finalDecisionResult?.reasons ?? [];

  const overallConfidence = analysis?.overallConfidence ?? null;
  const overallConfidenceReason: ConfidenceReason | null =
    analysis?.overallConfidenceReason ??
    (overallConfidence != null
      ? buildOverallConfidenceReason(overallConfidence, {
          docsOnly: analysis?.docsOnly,
        })
      : null);

  const decisionTrace: DecisionTraceItem[] = analysis?.decisionTrace ?? [];

  const riskBreakdown = analysis?.riskBreakdown ?? {};

  const severityChips = useMemo(() => {
    if (!analysis) return [];
    return severityOrder
      .filter((s) => (analysis.severityBreakdown[s] ?? 0) > 0)
      .map((s) => ({
        severity: s,
        count: analysis.severityBreakdown[s],
      }));
  }, [analysis]);

  const metadataChips = useMemo(() => {
    if (!analysis || analysis.status !== "completed") return [];
    return [
      analysis.provider ? titleCase(analysis.provider) : null,
      analysis.model ? shortModelName(analysis.model) : null,
      analysis.filesChanged != null
        ? `${analysis.filesChanged} files analyzed`
        : null,
      analysis.durationMs != null
        ? `Duration ${formatDuration(analysis.durationMs)}`
        : null,
      `Version ${analysis.analysisVersion}`,
      analysis.headSha ? `Commit ${analysis.headSha.slice(0, 7)}` : null,
    ].filter(Boolean) as string[];
  }, [analysis]);

  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Pull request analysis</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Deterministic change collection plus AI-assisted findings with a
              clear merge recommendation.
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-medium">
            {statusLabel(effectiveStatus)}
          </Badge>
        </div>

        {currentHeadSha ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            Current head · {currentHeadSha.slice(0, 12)}
            {analysis?.headSha
              ? ` · analyzed ${analysis.headSha.slice(0, 12)}`
              : ""}
          </p>
        ) : null}

        {analysis?.isOutdated ? (
          <div
            role="status"
            className="flex gap-2 rounded-lg border border-risk-review/40 bg-risk-review/10 px-3 py-2 text-sm text-risk-review-foreground"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              This analysis is outdated. The pull request has new commits since
              SHA {analysis.headSha?.slice(0, 7)}. Run a new analysis for the
              latest code.
            </p>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {effectiveStatus === "not_started" ||
          effectiveStatus === "failed" ||
          analysis?.isOutdated ? (
            <Button
              disabled={busy || isActive}
              onClick={() => {
                void startAnalysis(
                  Boolean(
                    analysis?.isOutdated || forceNeeded(effectiveStatus),
                  ),
                );
              }}
            >
              {busy || isActive ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              {effectiveStatus === "failed"
                ? "Retry analysis"
                : analysis?.isOutdated
                  ? "Analyze latest commit"
                  : "Analyze pull request"}
            </Button>
          ) : null}

          {effectiveStatus === "completed" && !analysis?.isOutdated ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                void startAnalysis(true);
              }}
            >
              {busy ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              Re-analyze this commit
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {effectiveStatus === "not_started" && !busy ? (
          <EmptyState
            icon={<FileText className="size-8 text-muted-foreground/70" />}
            title="This pull request has not been analyzed yet"
            body="Start an analysis to collect changed files, classify them, and produce a merge recommendation with structured findings."
          />
        ) : null}

        {(busy ||
          effectiveStatus === "pending" ||
          effectiveStatus === "running") &&
        effectiveStatus !== "completed" ? (
          <ProgressPanel
            activeIndex={progressIndex}
            failed={progressFailed}
          />
        ) : null}

        {effectiveStatus === "failed" && !busy ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4"
          >
            <div className="flex items-start gap-2">
              <XCircle
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-destructive">
                  Analysis failed
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {analysis?.errorMessage ??
                    "The analysis could not be completed. You can retry."}
                </p>
              </div>
            </div>
            {progressFailed ? (
              <div className="mt-4">
                <ProgressPanel
                  activeIndex={progressIndex}
                  failed
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {effectiveStatus === "completed" && analysis ? (
          <div className="space-y-6">
            <section
              aria-label="Final decision"
              className={cn(
                "rounded-3xl border p-5 transition-colors",
                decisionMeta.shell,
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <decisionMeta.icon
                    className="mt-0.5 size-7 shrink-0"
                    aria-hidden
                  />
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-current/75">
                      Decision
                    </p>
                    <p className="font-mono text-xs text-current/70">
                      {decisionMeta.code}
                    </p>
                    <p className="text-2xl font-semibold tracking-tight">
                      {decisionMeta.label}
                    </p>
                    <p className="max-w-2xl text-sm leading-relaxed text-current/90">
                      {primaryReason}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <Badge variant="outline" className={cn(decisionMeta.badge)}>
                    {decisionMeta.code}
                  </Badge>
                  {analysis.riskClassification ? (
                    <p className="font-mono text-xs text-current/90">
                      Risk {analysis.riskClassification}
                      {analysis.riskScore != null
                        ? ` · ${analysis.riskScore}`
                        : ""}
                    </p>
                  ) : null}
                  {analysis.scopeClassification ? (
                    <p className="font-mono text-xs text-current/80">
                      Scope {analysis.scopeClassification}
                      {analysis.scopeScore != null
                        ? ` · ${analysis.scopeScore}`
                        : ""}
                    </p>
                  ) : null}
                  {overallConfidence != null ? (
                    <p className="font-mono text-xs text-current/90">
                      Confidence {(overallConfidence * 100).toFixed(0)}%
                      {overallConfidenceReason
                        ? ` · ${titleCase(overallConfidenceReason.level)}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Stage 4 — Decision Explanation (§22.3) */}
            {decisionReasons.length > 0 ? (
              <section
                aria-label="Decision explanation"
                className="space-y-3 rounded-3xl border border-border/70 bg-card/70 p-5"
              >
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">
                    Decision explanation
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Why the system produced{" "}
                    <span className="font-mono font-medium text-foreground">
                      {decisionMeta.code}
                    </span>
                    . Reasons reference risk factors and affected areas from
                    Stages 2–3 (no extra model calls).
                  </p>
                </div>
                <ul className="space-y-2">
                  {decisionReasons.map((reason) => (
                    <li
                      key={reason.id}
                      className="flex items-start gap-2.5 rounded-2xl border border-border/60 bg-background/50 px-3 py-2.5 text-sm"
                    >
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                          reason.source === "risk_factor" &&
                            "bg-red-500/10 text-red-800 dark:text-red-200",
                          reason.source === "scope" &&
                            "bg-amber-500/10 text-amber-900 dark:text-amber-100",
                          reason.source === "affected_area" &&
                            "bg-sky-500/10 text-sky-900 dark:text-sky-100",
                          reason.source === "impact" &&
                            "bg-orange-500/10 text-orange-900 dark:text-orange-100",
                          reason.source === "policy" &&
                            "bg-muted text-muted-foreground",
                        )}
                      >
                        {reason.source.replace(/_/g, " ")}
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <p className="leading-snug">{reason.message}</p>
                        {reason.filePath ? (
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            {reason.filePath}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {decisionTrace.length > 0 ? (
              <section aria-label="Decision trace" className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Decision trace
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {decisionTrace.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-2 rounded-2xl border border-border/70 bg-card/70 px-3 py-2.5 text-xs"
                    >
                      <TraceIcon tone={item.tone} />
                      <span className="leading-snug">{item.label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section
              aria-label="Analysis summary"
              className="sticky top-14 z-20 -mx-4 border-y border-border/70 bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6"
            >
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                <MetaStat
                  label="Confidence"
                  value={
                    overallConfidence != null
                      ? `${(overallConfidence * 100).toFixed(0)}%`
                      : "—"
                  }
                />
                <MetaStat
                  label="Files analyzed"
                  value={String(analysis.filesChanged ?? 0)}
                />
                <MetaStat
                  label="Duration"
                  value={formatDuration(analysis.durationMs)}
                />
                <MetaStat
                  label="Provider"
                  value={
                    analysis.provider
                      ? `${titleCase(analysis.provider)}${
                          analysis.model
                            ? ` · ${shortModelName(analysis.model)}`
                            : ""
                        }`
                      : "—"
                  }
                />
                <MetaStat
                  label="Commit SHA"
                  value={analysis.headSha ? analysis.headSha.slice(0, 12) : "—"}
                  mono
                />
                <MetaStat
                  label="Findings"
                  value={String(analysis.findings.length)}
                />
              </div>
            </section>

            <section aria-label="Risk breakdown">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Risk breakdown
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {RISK_STRIP_ORDER.map((key) => {
                  const count = riskBreakdown[key] ?? 0;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "inline-flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-xs",
                        count > 0
                          ? "border-border/80 bg-card/70"
                          : "border-border/50 bg-muted/20 text-muted-foreground",
                      )}
                    >
                      <span className="font-medium tracking-wide">
                        {titleCase(key.toLowerCase())}
                      </span>
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          count > 0 ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {metadataChips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5" aria-label="Metadata">
                {metadataChips.map((chip) => (
                  <Badge
                    key={chip}
                    variant="secondary"
                    className="font-normal text-[11px]"
                  >
                    {chip}
                  </Badge>
                ))}
              </div>
            ) : null}

            {severityChips.length > 0 ? (
              <div className="flex flex-wrap gap-2" aria-label="Severity counts">
                {severityChips.map((chip) => (
                  <Badge
                    key={chip.severity}
                    variant="outline"
                    className={cn(severityStyles[chip.severity])}
                  >
                    {chip.severity} · {chip.count}
                  </Badge>
                ))}
              </div>
            ) : null}

            {analysis.docsOnly ? (
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-900 dark:text-sky-100">
                This pull request modifies documentation only.
              </div>
            ) : null}

            {analysis.deterministicResult?.sensitiveAreas?.length ? (
              <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Sensitive areas (deterministic)
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysis.deterministicResult.sensitiveAreas.map((area) => (
                    <Badge key={area} variant="secondary">
                      {area}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <section className="space-y-3" aria-label="Findings">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-foreground" aria-hidden />
                <h3 className="text-sm font-semibold">Findings</h3>
                <span className="text-xs text-muted-foreground">
                  {analysis.findings.length}
                </span>
              </div>
              {analysis.findings.length === 0 ? (
                <EmptyState
                  icon={
                    <CheckCircle2
                      className="size-8 text-emerald-600 dark:text-emerald-400"
                      aria-hidden
                    />
                  }
                  title="No findings"
                  body="The analysis completed without structured findings for this change set."
                />
              ) : (
                <div className="space-y-3">
                  {analysis.findings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                </div>
              )}
            </section>

            {analysis.intentScope ? (
              <IntentScopeSection
                intent={analysis.intentScope}
                decisionLabel={decisionMeta.label}
              />
            ) : null}

            {analysis.changedFiles.length > 0 ? (
              <section className="space-y-2" aria-label="Changed files">
                <h3 className="text-sm font-semibold">Changed files</h3>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-border/70 bg-card/70 p-2">
                  {analysis.changedFiles.map((file) => (
                    <div
                      key={`${file.path}-${file.status}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-xs transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono">{file.path}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {file.status} · {file.category}
                          {file.excludedFromAi
                            ? ` · excluded from AI (${file.excludeReason ?? "yes"})`
                            : ""}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        +{file.additions}/-{file.deletions}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : analysis.status === "completed" ? (
              <EmptyState
                title="No changed files recorded"
                body="This analysis has no stored changed-file list."
              />
            ) : null}
          </div>
        ) : null}

        {busy && effectiveStatus === "not_started" ? (
          <div className="space-y-3" aria-hidden>
            <Skeleton className="h-28 w-full rounded-3xl" />
            <div className="grid gap-3 lg:grid-cols-2">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function IntentScopeSection({
  intent,
  decisionLabel,
}: {
  intent: IntentScopeResult;
  decisionLabel: string;
}) {
  const matchStyles: Record<string, string> = {
    matches:
      "border-transparent bg-emerald-600/15 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100",
    partial:
      "border-transparent bg-amber-600/15 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100",
    exceeds:
      "border-transparent bg-orange-600/15 text-orange-950 dark:bg-orange-500/20 dark:text-orange-100",
    unrelated:
      "border-transparent bg-red-600/15 text-red-950 dark:bg-red-500/20 dark:text-red-100",
    unknown: "bg-muted text-muted-foreground border-transparent",
  };

  return (
    <section
      aria-label="Intent and scope"
      className="space-y-4 rounded-3xl border border-border/70 bg-card/70 p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Target className="size-4 text-brand" aria-hidden />
        <h3 className="text-sm font-semibold">Intent &amp; scope</h3>
        <Badge variant="outline" className="text-[10px]">
          Stage 3
        </Badge>
      </div>

      {/* Compact summary strip */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <MetaStat label="Decision" value={decisionLabel} />
        <MetaStat label="Task summary" value={intent.taskSummary} />
        <MetaStat
          label="Scope match"
          value={scopeMatchLabel(intent.scopeMatch)}
        />
        <MetaStat
          label="Coverage"
          value={titleCase(intent.coverage)}
        />
        <MetaStat
          label="Scope creep"
          value={
            intent.scopeCreepDetected
              ? `Detected (${intent.unrelatedFiles.length} file${intent.unrelatedFiles.length === 1 ? "" : "s"})`
              : "None detected"
          }
        />
        <MetaStat
          label="Overall recommendation"
          value={intent.overallRecommendation}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {classificationLabel(intent.classification)}
        </Badge>
        {intent.secondaryClassifications.map((c) => (
          <Badge key={c} variant="outline" className="text-[11px]">
            {classificationLabel(c)}
          </Badge>
        ))}
        <Badge
          variant="outline"
          className={cn(matchStyles[intent.scopeMatch] ?? matchStyles.unknown)}
        >
          {scopeMatchLabel(intent.scopeMatch)}
        </Badge>
        <Badge variant="outline">
          Coverage · {titleCase(intent.coverage)}
        </Badge>
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="flex items-start gap-2">
          <Crosshair
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Task
            </p>
            <p className="text-sm font-medium leading-snug">{intent.taskSummary}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {intent.scopeMatchReason}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {intent.coverageReason}
            </p>
          </div>
        </div>
      </div>

      {(intent.expectedAreas.length > 0 || intent.actualAreas.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Expected areas
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {intent.expectedAreas.length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                intent.expectedAreas.map((a) => (
                      <Badge
                        key={a}
                        variant="outline"
                        className="font-normal text-[11px]"
                      >
                    {a}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Actual areas
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {intent.actualAreas.length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                intent.actualAreas.map((a) => (
                      <Badge
                        key={a}
                        variant="secondary"
                        className="font-normal text-[11px]"
                      >
                    {a}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {intent.scopeCreepDetected ? (
        <div
          role="status"
          className="rounded-2xl border border-risk-review/40 bg-risk-review/10 px-3 py-3"
        >
          <p className="text-xs font-semibold text-risk-review-foreground">
            Scope creep detected
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {intent.scopeCreepSummary}
          </p>
          {intent.unrelatedFiles.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {intent.unrelatedFiles.slice(0, 12).map((f) => (
                <code
                  key={f}
                  className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {f}
                </code>
              ))}
              {intent.unrelatedFiles.length > 12 ? (
                <span className="text-[10px] text-muted-foreground">
                  +{intent.unrelatedFiles.length - 12} more
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {intent.missingWork.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Warnings · missing work
          </p>
          <ul className="space-y-1.5">
            {intent.missingWork.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs"
              >
                {item.severity === "high" ? (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                ) : item.severity === "warning" ? (
                  <AlertTriangle
                    className="mt-0.5 size-3.5 shrink-0 text-risk-review-foreground"
                    aria-hidden
                  />
                ) : (
                  <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-muted-foreground">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {intent.taskSources.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Task sources ({intent.taskSources.length})
          </summary>
          <ul className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
            {intent.taskSources.map((s) => (
              <li key={`${s.type}-${s.label}`}>
                <span className="font-medium">{s.label}: </span>
                <span className="text-muted-foreground">{s.excerpt}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function scopeMatchLabel(match: IntentScopeResult["scopeMatch"]): string {
  switch (match) {
    case "matches":
      return "Matches task";
    case "partial":
      return "Partial match";
    case "exceeds":
      return "Exceeds scope";
    case "unrelated":
      return "Unrelated";
    default:
      return "Unknown";
  }
}

function FindingCard({ finding }: { finding: AnalysisFindingRecord }) {
  const [expanded, setExpanded] = useState(false);
  const evidence: StructuredEvidence =
    finding.structuredEvidence ?? structureFindingEvidence(finding);
  const confidenceReason: ConfidenceReason =
    finding.confidenceReason ?? buildConfidenceReason(finding);
  const longExplanation = (finding.explanation?.length ?? 0) > 220;
  const showFullEvidence = evidenceNeedsCollapse(evidence);

  return (
    <article className="space-y-3 rounded-3xl border border-border/70 bg-card/70 p-4 transition-colors hover:border-border hover:bg-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(severityStyles[finding.severity])}
        >
          {finding.severity}
        </Badge>
        <Badge variant="outline">{finding.category}</Badge>
        {finding.confidence != null ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {(finding.confidence * 100).toFixed(0)}% ·{" "}
            {titleCase(confidenceReason.level)}
          </span>
        ) : null}
        {finding.isInference ? (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Inference
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Observed
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold leading-snug">{finding.title}</h4>
        <p className="text-sm text-muted-foreground">{finding.summary}</p>
      </div>

      <p className="text-sm leading-relaxed text-foreground/90">
        {expanded || !longExplanation
          ? finding.explanation
          : `${finding.explanation.slice(0, 220).trimEnd()}…`}
      </p>

      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Evidence
        </p>
        <dl className="mt-3 space-y-1.5 text-xs">
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">File</dt>
            <dd className="min-w-0 truncate font-mono text-[11px] text-foreground/90">
              {evidence.file ?? "—"}
            </dd>
          </div>
          {evidence.lines ? (
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              <dt className="text-muted-foreground">Lines</dt>
              <dd className="font-mono">{evidence.lines}</dd>
            </div>
          ) : null}
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">Observed</dt>
            <dd className="leading-relaxed text-foreground/90">
              {expanded || !showFullEvidence
                ? evidence.observedChange
                : `${evidence.observedChange.slice(0, 160).trimEnd()}…`}
            </dd>
          </div>
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">Supports</dt>
            <dd className="leading-relaxed text-foreground/90">{evidence.supportsFinding}</dd>
          </div>
        </dl>
        {expanded && evidence.raw && evidence.raw !== evidence.observedChange ? (
          <p className="mt-3 whitespace-pre-wrap border-t border-border/50 pt-3 text-[11px] leading-relaxed text-muted-foreground">
            {evidence.raw}
          </p>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Confidence reason: {confidenceReason.label}
      </p>

      {finding.affectedFiles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {finding.affectedFiles.map((file) => (
            <code
              key={file}
              className="rounded-md border border-border/60 bg-background/70 px-1.5 py-0.5 font-mono text-[10px]"
            >
              {file}
            </code>
          ))}
        </div>
      ) : null}

      {longExplanation || showFullEvidence ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
          {expanded ? "Show less" : "View more"}
        </Button>
      ) : null}
    </article>
  );
}

function ProgressPanel({
  activeIndex,
  failed,
}: {
  activeIndex: number;
  failed?: boolean;
}) {
  return (
    <div
      className="rounded-3xl border border-border/70 bg-card/70 px-4 py-4"
      role="status"
      aria-live="polite"
      aria-label="Analysis progress"
    >
      <p className="mb-3 text-sm font-medium">
        {failed ? "Analysis stopped" : "Analysis in progress"}
      </p>
      <ol className="space-y-2">
        {PROGRESS_STEPS.map((step, index) => {
          const done = !failed && index < activeIndex;
          const current = index === activeIndex;
          const isFailedStep = Boolean(failed && current);
          const pending = index > activeIndex;

          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-2 text-sm transition-opacity",
                pending && !isFailedStep ? "opacity-50" : "opacity-100",
              )}
            >
              {done ? (
                <Check
                  className="size-4 text-emerald-600 dark:text-emerald-400"
                  aria-label="Completed"
                />
              ) : isFailedStep ? (
                <XCircle
                  className="size-4 text-destructive"
                  aria-label="Failed"
                />
              ) : current ? (
                <Loader2
                  className="size-4 animate-spin text-brand"
                  aria-label="Current step"
                />
              ) : (
                <Circle className="size-3.5 text-muted-foreground" aria-hidden />
              )}
              <span
                className={cn(
                  isFailedStep && "font-medium text-destructive",
                  current && !failed && "font-medium",
                  done && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TraceIcon({ tone }: { tone: DecisionTraceItem["tone"] }) {
  if (tone === "positive") {
    return (
      <Check
        className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-label="Positive"
      />
    );
  }
  if (tone === "warning") {
    return (
      <AlertTriangle
        className="mt-0.5 size-3.5 shrink-0 text-risk-review-foreground"
        aria-label="Warning"
      />
    );
  }
  if (tone === "negative") {
    return (
      <XCircle
        className="mt-0.5 size-3.5 shrink-0 text-destructive"
        aria-label="Negative"
      />
    );
  }
  return (
    <Circle
      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
      aria-label="Neutral"
    />
  );
}

function forceNeeded(status: AnalysisJobStatus | "not_started"): boolean {
  return status === "failed";
}

function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center">
      {icon ? (
        <div className="mb-3 flex justify-center" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function MetaStat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-medium leading-snug",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem.toFixed(0)}s`;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
