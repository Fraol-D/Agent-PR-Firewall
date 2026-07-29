import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildConfidenceReason,
  buildOverallConfidenceReason,
} from "@/lib/analysis/confidence";
import {
  buildRiskBreakdown,
  computeMergeDecision,
} from "@/lib/analysis/decision";
import { structureFindingEvidence } from "@/lib/analysis/evidence";
import { logAnalysis } from "@/lib/analysis/log";
import { runPullRequestAnalysis } from "@/lib/analysis/orchestrator";
import type {
  AnalysisDetail,
  AnalysisFindingRecord,
  AnalysisJobStatus,
  AnalysisPerformanceMetrics,
  AnalysisRecord,
  ChangedFileEvidence,
  DeterministicAnalysisResult,
  FindingSeverity,
  OverallAnalysisStatus,
} from "@/lib/analysis/types";
import type { ServiceResult } from "@/types/domain";
import type { Json, Tables } from "@/types/database";

function emptySeverity(): Record<FindingSeverity, number> {
  return { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
}

function mapAnalysis(
  row: Tables<"analyses">,
  currentHeadSha: string | null,
): AnalysisRecord {
  return {
    id: row.id,
    pullRequestId: row.pull_request_id,
    analysisVersion: row.analysis_version,
    status: row.status as AnalysisJobStatus,
    headSha: row.head_sha,
    overallStatus: row.overall_status as OverallAnalysisStatus | null,
    summary: row.summary,
    errorMessage: row.error_message,
    filesChanged: row.files_changed,
    linesAdded: row.lines_added,
    linesDeleted: row.lines_deleted,
    provider: row.provider,
    model: row.model,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms ?? null,
    evaluationNotes: row.evaluation_notes ?? null,
    createdAt: row.created_at,
    isOutdated: Boolean(
      currentHeadSha &&
        row.head_sha &&
        row.status === "completed" &&
        row.head_sha !== currentHeadSha,
    ),
  };
}

export async function getAnalysisPerformanceMetrics(
  userId: string,
): Promise<ServiceResult<AnalysisPerformanceMetrics>> {
  try {
    const supabase = await createClient();
    const { data: repos, error: repoError } = await supabase
      .from("repositories")
      .select("id")
      .eq("connected_by_user_id", userId);

    if (repoError) {
      return {
        ok: false,
        error: "Failed to load performance metrics",
        code: "db_error",
      };
    }

    const repoIds = (repos ?? []).map((r) => r.id);
    if (repoIds.length === 0) {
      return {
        ok: true,
        data: {
          totalCompleted: 0,
          averageDurationMs: null,
          fastestDurationMs: null,
          slowestDurationMs: null,
        },
      };
    }

    const { data: prs, error: prError } = await supabase
      .from("pull_requests")
      .select("id")
      .in("repository_id", repoIds);

    if (prError) {
      return {
        ok: false,
        error: "Failed to load performance metrics",
        code: "db_error",
      };
    }

    const prIds = (prs ?? []).map((p) => p.id);
    if (prIds.length === 0) {
      return {
        ok: true,
        data: {
          totalCompleted: 0,
          averageDurationMs: null,
          fastestDurationMs: null,
          slowestDurationMs: null,
        },
      };
    }

    const { data: analyses, error } = await supabase
      .from("analyses")
      .select("duration_ms")
      .in("pull_request_id", prIds)
      .eq("status", "completed")
      .not("duration_ms", "is", null);

    if (error) {
      return {
        ok: false,
        error: "Failed to load performance metrics",
        code: "db_error",
      };
    }

    const durations = (analyses ?? [])
      .map((a) => a.duration_ms)
      .filter((d): d is number => typeof d === "number" && d >= 0);

    if (durations.length === 0) {
      return {
        ok: true,
        data: {
          totalCompleted: 0,
          averageDurationMs: null,
          fastestDurationMs: null,
          slowestDurationMs: null,
        },
      };
    }

    const sum = durations.reduce((a, b) => a + b, 0);
    return {
      ok: true,
      data: {
        totalCompleted: durations.length,
        averageDurationMs: Math.round(sum / durations.length),
        fastestDurationMs: Math.min(...durations),
        slowestDurationMs: Math.max(...durations),
      },
    };
  } catch (err) {
    console.error("getAnalysisPerformanceMetrics:", err);
    return {
      ok: false,
      error: "Failed to load performance metrics",
      code: "unexpected",
    };
  }
}

export async function listAnalysesForPullRequest(
  userId: string,
  pullRequestId: string,
  currentHeadSha: string | null,
): Promise<ServiceResult<AnalysisRecord[]>> {
  try {
    const supabase = await createClient();
    // Authorization via PR ownership is enforced by RLS on analyses
    const { data: pr, error: prError } = await supabase
      .from("pull_requests")
      .select("id, repositories!inner(connected_by_user_id)")
      .eq("id", pullRequestId)
      .maybeSingle();

    if (prError) {
      return { ok: false, error: "Failed to authorize pull request", code: "db_error" };
    }
    if (!pr) {
      return { ok: true, data: [] };
    }
    const prRow = pr as unknown as {
      id: string;
      repositories: { connected_by_user_id: string };
    };
    if (prRow.repositories.connected_by_user_id !== userId) {
      return { ok: true, data: [] };
    }

    const { data, error } = await supabase
      .from("analyses")
      .select("*")
      .eq("pull_request_id", pullRequestId)
      .order("analysis_version", { ascending: false });

    if (error) {
      console.error("listAnalysesForPullRequest:", error.message);
      return { ok: false, error: "Failed to load analyses", code: "db_error" };
    }

    return {
      ok: true,
      data: (data ?? []).map((row) => mapAnalysis(row, currentHeadSha)),
    };
  } catch (err) {
    console.error("listAnalysesForPullRequest unexpected:", err);
    return { ok: false, error: "Failed to load analyses", code: "unexpected" };
  }
}

export async function getAnalysisDetail(
  userId: string,
  analysisId: string,
  currentHeadSha: string | null,
): Promise<ServiceResult<AnalysisDetail | null>> {
  try {
    const supabase = await createClient();
    const { data: analysis, error } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", analysisId)
      .maybeSingle();

    if (error) {
      return { ok: false, error: "Failed to load analysis", code: "db_error" };
    }
    if (!analysis) {
      return { ok: true, data: null };
    }

    // Verify ownership
    const { data: pr } = await supabase
      .from("pull_requests")
      .select("id, head_sha, repositories!inner(connected_by_user_id)")
      .eq("id", analysis.pull_request_id)
      .maybeSingle();

    const prRow = pr as unknown as {
      id: string;
      head_sha: string | null;
      repositories: { connected_by_user_id: string };
    } | null;
    if (!prRow || prRow.repositories.connected_by_user_id !== userId) {
      return { ok: true, data: null };
    }

    const [{ data: findings }, { data: files }] = await Promise.all([
      supabase
        .from("analysis_findings")
        .select("*")
        .eq("analysis_id", analysisId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("analysis_changed_files")
        .select("*")
        .eq("analysis_id", analysisId)
        .order("path", { ascending: true }),
    ]);

    const severityBreakdown = emptySeverity();
    const mappedFindings: AnalysisFindingRecord[] = (findings ?? []).map(
      (f) => {
        const sev = f.severity as FindingSeverity;
        severityBreakdown[sev] = (severityBreakdown[sev] ?? 0) + 1;
        const affectedFiles = Array.isArray(f.affected_files)
          ? (f.affected_files as string[])
          : [];
        const confidence =
          f.confidence === null || f.confidence === undefined
            ? null
            : Number(f.confidence);
        const base = {
          id: f.id,
          analysisId: f.analysis_id,
          category: f.category as AnalysisFindingRecord["category"],
          severity: sev,
          title: f.title,
          summary: f.summary,
          explanation: f.explanation,
          evidence: f.evidence ?? "",
          affectedFiles,
          confidence,
          isInference: f.is_inference,
          sortOrder: f.sort_order,
        };
        return {
          ...base,
          confidenceReason: buildConfidenceReason(base),
          structuredEvidence: structureFindingEvidence(base),
        };
      },
    );

    const changedFiles: ChangedFileEvidence[] = (files ?? []).map((f) => ({
      path: f.path,
      previousPath: f.previous_path,
      status: f.status as ChangedFileEvidence["status"],
      additions: f.additions,
      deletions: f.deletions,
      category: f.category as ChangedFileEvidence["category"],
      isBinary: f.is_binary,
      excludedFromAi: f.excluded_from_ai,
      excludeReason: f.exclude_reason,
      patchExcerpt: f.patch_excerpt,
    }));

    const deterministicResult =
      (analysis.deterministic_result as unknown as DeterministicAnalysisResult) ??
      null;

    // Prefer deterministic recompute so historical rows get Stage 2.6 UX fields.
    const decisionResult = computeMergeDecision({
      findings: mappedFindings,
      deterministic: deterministicResult,
      aiOverallStatus: analysis.overall_status as OverallAnalysisStatus | null,
    });

    return {
      ok: true,
      data: {
        ...mapAnalysis(analysis, currentHeadSha ?? prRow.head_sha),
        // Align stored overall with deterministic decision for display consistency
        overallStatus: decisionResult.overallStatus,
        findings: mappedFindings,
        changedFiles,
        deterministicResult,
        severityBreakdown,
        decision: decisionResult.decision,
        primaryReason: decisionResult.primaryReason,
        decisionTrace: decisionResult.trace,
        overallConfidence: decisionResult.overallConfidence,
        overallConfidenceReason: buildOverallConfidenceReason(
          decisionResult.overallConfidence,
          {
            docsOnly: decisionResult.docsOnly,
            findingCount: mappedFindings.length,
          },
        ),
        riskBreakdown: buildRiskBreakdown(mappedFindings),
        docsOnly: decisionResult.docsOnly,
      },
    };
  } catch (err) {
    console.error("getAnalysisDetail unexpected:", err);
    return { ok: false, error: "Failed to load analysis", code: "unexpected" };
  }
}

export async function getLatestAnalysisForPullRequest(
  userId: string,
  pullRequestId: string,
  currentHeadSha: string | null,
): Promise<ServiceResult<AnalysisDetail | null>> {
  const list = await listAnalysesForPullRequest(
    userId,
    pullRequestId,
    currentHeadSha,
  );
  if (!list.ok) return list;
  if (list.data.length === 0) return { ok: true, data: null };
  return getAnalysisDetail(userId, list.data[0].id, currentHeadSha);
}

/**
 * Start analysis for a PR the user owns. Idempotent for in-flight jobs on same SHA.
 * force=true creates a new version even if completed exists for the SHA.
 */
export async function startPullRequestAnalysis(input: {
  userId: string;
  pullRequestId: string;
  force?: boolean;
}): Promise<ServiceResult<{ analysisId: string; reused: boolean }>> {
  try {
    const admin = createAdminClient();

    const { data: prRaw, error: prError } = await admin
      .from("pull_requests")
      .select(
        "*, repositories!inner(id, owner, name, full_name, default_branch, github_installation_id, connected_by_user_id, connection_status)",
      )
      .eq("id", input.pullRequestId)
      .maybeSingle();

    if (prError || !prRaw) {
      return { ok: false, error: "Pull request not found", code: "not_found" };
    }

    const pr = prRaw as unknown as Tables<"pull_requests"> & {
      repositories: {
        id: string;
        owner: string;
        name: string;
        full_name: string;
        default_branch: string;
        github_installation_id: number | null;
        connected_by_user_id: string;
        connection_status: string;
      };
    };

    const repo = pr.repositories;

    if (repo.connected_by_user_id !== input.userId) {
      return { ok: false, error: "Unauthorized", code: "unauthorized" };
    }
    if (!repo.github_installation_id) {
      return {
        ok: false,
        error: "Repository is missing GitHub installation metadata",
        code: "misconfigured",
      };
    }
    if (!pr.head_sha) {
      return {
        ok: false,
        error: "Pull request has no head SHA to analyze",
        code: "missing_sha",
      };
    }

    // Reuse in-flight analysis for same SHA
    const { data: inFlight } = await admin
      .from("analyses")
      .select("id, status")
      .eq("pull_request_id", input.pullRequestId)
      .eq("head_sha", pr.head_sha)
      .in("status", ["pending", "running"])
      .order("analysis_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inFlight) {
      return {
        ok: true,
        data: { analysisId: inFlight.id, reused: true },
      };
    }

    // Reuse completed analysis for same SHA unless force
    if (!input.force) {
      const { data: completed } = await admin
        .from("analyses")
        .select("id")
        .eq("pull_request_id", input.pullRequestId)
        .eq("head_sha", pr.head_sha)
        .eq("status", "completed")
        .order("analysis_version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (completed) {
        return {
          ok: true,
          data: { analysisId: completed.id, reused: true },
        };
      }
    }

    const { data: latest } = await admin
      .from("analyses")
      .select("analysis_version")
      .eq("pull_request_id", input.pullRequestId)
      .order("analysis_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latest?.analysis_version ?? 0) + 1;
    const now = new Date().toISOString();

    const { data: created, error: createError } = await admin
      .from("analyses")
      .insert({
        pull_request_id: input.pullRequestId,
        analysis_version: nextVersion,
        status: "pending",
        head_sha: pr.head_sha,
        started_at: now,
      })
      .select("*")
      .single();

    if (createError || !created) {
      console.error("startPullRequestAnalysis create:", createError?.message);
      return {
        ok: false,
        error: "Failed to create analysis job",
        code: "db_error",
      };
    }

    await admin.from("analysis_events").insert({
      analysis_id: created.id,
      pull_request_id: input.pullRequestId,
      event_type: "analysis_started",
      message: `Analysis v${nextVersion} queued for ${pr.head_sha.slice(0, 7)}`,
      metadata: { head_sha: pr.head_sha, version: nextVersion },
    });

    logAnalysis("analysis_started", {
      analysisId: created.id,
      pullRequestId: input.pullRequestId,
      headSha: pr.head_sha,
    });

    // Run inline so serverless runtimes do not cancel the job.
    // Status transitions pending → running → completed/failed for the client poller.
    // Pin headSha from job creation — never re-read live tip mid-run.
    await executeAnalysisJob({
      analysisId: created.id,
      pullRequestId: input.pullRequestId,
      headSha: pr.head_sha,
      pullNumber: pr.number,
      title: pr.title,
      description: pr.description,
      authorLogin: pr.author_login,
      sourceBranch: pr.source_branch,
      targetBranch: pr.target_branch,
      htmlUrl: pr.html_url,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      installationId: repo.github_installation_id,
    });

    return {
      ok: true,
      data: { analysisId: created.id, reused: false },
    };
  } catch (err) {
    console.error("startPullRequestAnalysis unexpected:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to start analysis",
      code: "unexpected",
    };
  }
}

async function executeAnalysisJob(job: {
  analysisId: string;
  pullRequestId: string;
  headSha: string;
  pullNumber: number;
  title: string;
  description: string | null;
  authorLogin: string;
  sourceBranch: string;
  targetBranch: string;
  htmlUrl: string | null;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  installationId: number;
}): Promise<void> {
  const admin = createAdminClient();
  const startedMs = Date.now();
  const started = new Date(startedMs).toISOString();

  try {
    // Guard: refuse to run if stored SHA was mutated
    const { data: row } = await admin
      .from("analyses")
      .select("head_sha, status")
      .eq("id", job.analysisId)
      .single();

    if (!row || row.head_sha !== job.headSha) {
      throw new Error(
        "Analysis SHA integrity check failed before run (stored SHA mismatch)",
      );
    }

    await admin
      .from("analyses")
      .update({ status: "running", started_at: started })
      .eq("id", job.analysisId)
      .eq("head_sha", job.headSha);

    const result = await runPullRequestAnalysis({
      analysisId: job.analysisId,
      pullRequestId: job.pullRequestId,
      owner: job.owner,
      repo: job.name,
      pullNumber: job.pullNumber,
      installationId: job.installationId,
      headSha: job.headSha,
      repository: {
        fullName: job.fullName,
        owner: job.owner,
        name: job.name,
        defaultBranch: job.defaultBranch,
      },
      pullRequest: {
        number: job.pullNumber,
        title: job.title,
        description: job.description,
        authorLogin: job.authorLogin,
        sourceBranch: job.sourceBranch,
        targetBranch: job.targetBranch,
        htmlUrl: job.htmlUrl,
      },
    });

    if (result.headSha !== job.headSha) {
      throw new Error(
        `Analysis SHA integrity violation after fetch (expected ${job.headSha.slice(0, 12)}, got ${result.headSha.slice(0, 12)})`,
      );
    }

    const durationMs = Math.max(0, Date.now() - startedMs);

    const changedFilesJson = result.deterministic.changedFiles.map((f) => ({
      path: f.path,
      previous_path: f.previousPath ?? "",
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      category: f.category,
      is_binary: f.isBinary,
      excluded_from_ai: f.excludedFromAi,
      exclude_reason: f.excludeReason ?? "",
      patch_excerpt: f.excludedFromAi
        ? ""
        : (f.patchExcerpt?.slice(0, 1500) ?? ""),
    }));

    const findingsJson = result.ai.findings.map((f, index) => ({
      category: f.category,
      severity: f.severity,
      title: f.title,
      summary: f.summary,
      explanation: f.explanation,
      evidence: f.evidence,
      affected_files: f.affectedFiles,
      confidence: f.confidence,
      is_inference: f.isInference,
      sort_order: index,
    }));

    const riskFactorsJson = result.ai.findings.map((f) => ({
      category: f.category.toLowerCase(),
      severity: f.severity,
      score_contribution: severityToScore(f.severity),
      title: f.title,
      description: f.explanation,
      source_file: f.affectedFiles[0] ?? "",
      metadata: {
        summary: f.summary,
        evidence: f.evidence,
        confidence: f.confidence,
        isInference: f.isInference,
      },
    }));

    // Atomic persistence (Postgres function transaction).
    // Fallback to sequential+cleanup if RPC is not migrated yet.
    const rpcArgs = {
      p_analysis_id: job.analysisId,
      p_pull_request_id: job.pullRequestId,
      p_head_sha: job.headSha,
      p_summary: result.ai.summary,
      p_overall_status: result.ai.overallStatus,
      p_files_changed: result.deterministic.filesChanged,
      p_lines_added: result.deterministic.linesAdded,
      p_lines_deleted: result.deterministic.linesDeleted,
      p_provider: result.ai.provider,
      p_model: result.ai.model,
      p_deterministic_result: result.deterministic as unknown as Json,
      p_context_stats: {
        ...result.context.stats,
        baseSha: result.baseSha,
        headSha: result.headSha,
      } as unknown as Json,
      p_risk_classification: overallToRisk(result.ai.overallStatus),
      p_duration_ms: durationMs,
      p_changed_files: changedFilesJson as unknown as Json,
      p_findings: findingsJson as unknown as Json,
      p_risk_factors: riskFactorsJson as unknown as Json,
      p_event_message: `Analysis completed with ${result.ai.findings.length} finding(s)`,
      p_event_metadata: {
        overall_status: result.ai.overallStatus,
        findings: result.ai.findings.length,
        duration_ms: durationMs,
        head_sha: job.headSha,
      } as unknown as Json,
    };

    // Typed client may not know custom RPCs until types are regenerated.
    const { error: persistError } = await (
      admin as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc("complete_analysis_atomic", rpcArgs);

    if (persistError) {
      if (/function .* does not exist|schema cache/i.test(persistError.message)) {
        await persistAnalysisSequential(admin, job, result, durationMs);
      } else {
        await cleanupAnalysisChildren(admin, job.analysisId);
        throw new Error(`Atomic persistence failed: ${persistError.message}`);
      }
    }

    logAnalysis("persistence_completed", {
      analysisId: job.analysisId,
      pullRequestId: job.pullRequestId,
      headSha: job.headSha,
      durationMs,
      findingsCount: result.ai.findings.length,
      filesChanged: result.deterministic.filesChanged,
      ok: true,
    });

    logAnalysis("analysis_completed", {
      analysisId: job.analysisId,
      pullRequestId: job.pullRequestId,
      headSha: job.headSha,
      provider: result.ai.provider,
      model: result.ai.model,
      durationMs,
      findingsCount: result.ai.findings.length,
      ok: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Analysis failed unexpectedly";
    const durationMs = Math.max(0, Date.now() - startedMs);

    logAnalysis(
      "analysis_failed",
      {
        analysisId: job.analysisId,
        pullRequestId: job.pullRequestId,
        headSha: job.headSha,
        durationMs,
        reason: message.slice(0, 300),
        ok: false,
      },
      "error",
    );

    await cleanupAnalysisChildren(admin, job.analysisId);

    await admin
      .from("analyses")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_message: message.slice(0, 1000),
      })
      .eq("id", job.analysisId)
      .eq("head_sha", job.headSha);

    await admin.from("analysis_events").insert({
      analysis_id: job.analysisId,
      pull_request_id: job.pullRequestId,
      event_type: "analysis_failed",
      message: message.slice(0, 500),
      metadata: { duration_ms: durationMs, head_sha: job.headSha },
    });
  }
}

async function cleanupAnalysisChildren(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string,
): Promise<void> {
  await Promise.all([
    admin.from("analysis_changed_files").delete().eq("analysis_id", analysisId),
    admin.from("analysis_findings").delete().eq("analysis_id", analysisId),
    admin.from("risk_factors").delete().eq("analysis_id", analysisId),
  ]);
}

/**
 * Sequential fallback when complete_analysis_atomic RPC is not installed.
 * Cleans children first, writes required rows, then marks completed.
 * On any failure: delete children and leave status to caller as failed.
 */
async function persistAnalysisSequential(
  admin: ReturnType<typeof createAdminClient>,
  job: {
    analysisId: string;
    pullRequestId: string;
    headSha: string;
  },
  result: Awaited<ReturnType<typeof runPullRequestAnalysis>>,
  durationMs: number,
): Promise<void> {
  await cleanupAnalysisChildren(admin, job.analysisId);

  if (result.deterministic.changedFiles.length > 0) {
    const { error } = await admin.from("analysis_changed_files").insert(
      result.deterministic.changedFiles.map((f) => ({
        analysis_id: job.analysisId,
        path: f.path,
        previous_path: f.previousPath ?? null,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        category: f.category,
        is_binary: f.isBinary,
        excluded_from_ai: f.excludedFromAi,
        exclude_reason: f.excludeReason ?? null,
        patch_excerpt: f.excludedFromAi
          ? null
          : (f.patchExcerpt?.slice(0, 1500) ?? null),
      })),
    );
    if (error) {
      await cleanupAnalysisChildren(admin, job.analysisId);
      throw new Error(`Failed to persist changed files: ${error.message}`);
    }
  }

  if (result.ai.findings.length > 0) {
    const { error } = await admin.from("analysis_findings").insert(
      result.ai.findings.map((f, index) => ({
        analysis_id: job.analysisId,
        category: f.category,
        severity: f.severity,
        title: f.title,
        summary: f.summary,
        explanation: f.explanation,
        evidence: f.evidence,
        affected_files: f.affectedFiles as unknown as Json,
        confidence: f.confidence,
        is_inference: f.isInference,
        sort_order: index,
      })),
    );
    if (error) {
      await cleanupAnalysisChildren(admin, job.analysisId);
      throw new Error(`Failed to persist findings: ${error.message}`);
    }

    const { error: riskError } = await admin.from("risk_factors").insert(
      result.ai.findings.map((f) => ({
        analysis_id: job.analysisId,
        category: f.category.toLowerCase(),
        severity: f.severity,
        score_contribution: severityToScore(f.severity),
        title: f.title,
        description: f.explanation,
        source_file: f.affectedFiles[0] ?? null,
        metadata: {
          summary: f.summary,
          evidence: f.evidence,
          confidence: f.confidence,
          isInference: f.isInference,
        } as Json,
      })),
    );
    if (riskError) {
      await cleanupAnalysisChildren(admin, job.analysisId);
      throw new Error(`Failed to persist risk factors: ${riskError.message}`);
    }
  }

  const { error: updateError } = await admin
    .from("analyses")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      summary: result.ai.summary,
      overall_status: result.ai.overallStatus,
      files_changed: result.deterministic.filesChanged,
      lines_added: result.deterministic.linesAdded,
      lines_deleted: result.deterministic.linesDeleted,
      provider: result.ai.provider,
      model: result.ai.model,
      deterministic_result: result.deterministic as unknown as Json,
      context_stats: {
        ...result.context.stats,
        baseSha: result.baseSha,
        headSha: result.headSha,
      } as unknown as Json,
      error_message: null,
      risk_classification: overallToRisk(result.ai.overallStatus),
    })
    .eq("id", job.analysisId)
    .eq("head_sha", job.headSha);

  if (updateError) {
    await cleanupAnalysisChildren(admin, job.analysisId);
    throw new Error(`Failed to finalize analysis: ${updateError.message}`);
  }

  await admin.from("analysis_events").insert({
    analysis_id: job.analysisId,
    pull_request_id: job.pullRequestId,
    event_type: "analysis_completed",
    message: `Analysis completed with ${result.ai.findings.length} finding(s)`,
    metadata: {
      overall_status: result.ai.overallStatus,
      findings: result.ai.findings.length,
      duration_ms: durationMs,
      head_sha: job.headSha,
    },
  });
}

function severityToScore(severity: FindingSeverity): number {
  switch (severity) {
    case "info":
      return 0;
    case "low":
      return 10;
    case "medium":
      return 25;
    case "high":
      return 40;
    case "critical":
      return 60;
  }
}

function overallToRisk(
  status: OverallAnalysisStatus,
): "LOW" | "MEDIUM" | "HIGH" {
  switch (status) {
    case "no_significant_concerns":
      return "LOW";
    case "review_recommended":
      return "MEDIUM";
    case "high_risk_concerns":
      return "HIGH";
  }
}
