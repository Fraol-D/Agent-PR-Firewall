"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
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
import type {
  AnalysisDetail,
  AnalysisJobStatus,
  FindingSeverity,
  OverallAnalysisStatus,
} from "@/lib/analysis/types";
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
  critical: "bg-risk-blocked/25 text-risk-blocked-foreground border-transparent",
  high: "bg-risk-required/25 text-risk-required-foreground border-transparent",
  medium: "bg-risk-review/25 text-risk-review-foreground border-transparent",
  low: "bg-risk-low/20 text-risk-low-foreground border-transparent",
  info: "bg-muted text-muted-foreground border-transparent",
};

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

function overallLabel(status: OverallAnalysisStatus | null): string {
  switch (status) {
    case "no_significant_concerns":
      return "No significant concerns detected";
    case "review_recommended":
      return "Review recommended";
    case "high_risk_concerns":
      return "High-risk concerns detected";
    default:
      return "—";
  }
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

  const effectiveStatus: AnalysisJobStatus | "not_started" =
    analysis?.status ?? "not_started";

  const isActive =
    effectiveStatus === "pending" || effectiveStatus === "running";

  const refreshAnalysis = useCallback(
    async (analysisId: string) => {
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
    },
    [],
  );

  useEffect(() => {
    if (!analysis || !isActive) return;
    const id = analysis.id;
    const timer = setInterval(() => {
      void refreshAnalysis(id).catch(() => {
        /* ignore transient poll errors */
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [analysis, isActive, refreshAnalysis]);

  async function startAnalysis(force: boolean) {
    setBusy(true);
    setError(null);
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
        await refreshAnalysis(body.analysisId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis");
    } finally {
      setBusy(false);
    }
  }

  const findingCount = analysis?.findings.length ?? 0;

  const severityChips = useMemo(() => {
    if (!analysis) return [];
    return severityOrder
      .filter((s) => (analysis.severityBreakdown[s] ?? 0) > 0)
      .map((s) => ({
        severity: s,
        count: analysis.severityBreakdown[s],
      }));
  }, [analysis]);

  return (
    <Card className="border-border/80 bg-card/80 shadow-none">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Pull request analysis</CardTitle>
            <CardDescription className="mt-1">
              Deterministic change collection plus AI-assisted structured
              findings. Not an approval or block decision.
            </CardDescription>
          </div>
          <Badge variant="outline">{statusLabel(effectiveStatus)}</Badge>
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
          <div className="flex gap-2 rounded-lg border border-risk-review/40 bg-risk-review/10 px-3 py-2 text-sm text-risk-review-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              This analysis is outdated. The pull request has new commits since
              SHA {analysis.headSha?.slice(0, 7)}. Run a new analysis for the
              latest code.
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
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
                void startAnalysis(Boolean(analysis?.isOutdated || forceNeeded(effectiveStatus)));
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
              <RefreshCw data-icon="inline-start" />
              Re-analyze this commit
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {effectiveStatus === "not_started" ? (
          <EmptyState
            title="This pull request has not been analyzed yet"
            body="Start an analysis to collect changed files, classify them, and generate structured review findings."
          />
        ) : null}

        {isActive ? (
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-6">
            <Loader2 className="size-5 animate-spin text-brand" />
            <div>
              <p className="text-sm font-medium">
                {effectiveStatus === "pending"
                  ? "Analysis queued"
                  : "Analysis in progress"}
              </p>
              <p className="text-xs text-muted-foreground">
                Collecting diffs, classifying files, and running AI reasoning.
                Results are not final until status is Completed.
              </p>
            </div>
          </div>
        ) : null}

        {effectiveStatus === "failed" ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4">
            <p className="text-sm font-medium text-destructive">Analysis failed</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {analysis?.errorMessage ??
                "The analysis could not be completed. You can retry."}
            </p>
          </div>
        ) : null}

        {effectiveStatus === "completed" && analysis ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Overall"
                value={overallLabel(analysis.overallStatus)}
              />
              <Stat
                label="Findings"
                value={String(findingCount)}
              />
              <Stat
                label="Change size"
                value={`${analysis.filesChanged ?? 0} files · +${analysis.linesAdded ?? 0}/-${analysis.linesDeleted ?? 0}`}
              />
              <Stat
                label="Duration"
                value={formatDuration(analysis.durationMs)}
              />
            </div>

            {severityChips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
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

            {analysis.summary ? (
              <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Summary
                </p>
                <p className="mt-2 text-sm leading-relaxed">{analysis.summary}</p>
                {analysis.provider ? (
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    {analysis.provider}
                    {analysis.model ? ` · ${analysis.model}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}

            {analysis.deterministicResult?.sensitiveAreas?.length ? (
              <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-brand" />
                <h3 className="text-sm font-semibold">Findings</h3>
              </div>
              {analysis.findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No structured findings were returned for this analysis.
                </p>
              ) : (
                analysis.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-4"
                  >
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
                          confidence {(finding.confidence * 100).toFixed(0)}%
                        </span>
                      ) : null}
                      {finding.isInference ? (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Inference
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide text-risk-low">
                          Observed
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold">{finding.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {finding.summary}
                    </p>
                    <p className="text-sm leading-relaxed">
                      {finding.explanation}
                    </p>
                    {finding.evidence ? (
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Evidence
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
                          {finding.evidence}
                        </p>
                      </div>
                    ) : null}
                    {finding.affectedFiles.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {finding.affectedFiles.map((file) => (
                          <code
                            key={file}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            {file}
                          </code>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {analysis.changedFiles.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Changed files</h3>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border/70 p-2">
                  {analysis.changedFiles.map((file) => (
                    <div
                      key={`${file.path}-${file.status}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/30"
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
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function forceNeeded(status: AnalysisJobStatus | "not_started"): boolean {
  return status === "failed";
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium leading-snug">{value}</p>
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
