/**
 * Stage 5 — Post deterministic analysis feedback as a GitHub PR comment.
 */

import { RequestError } from "@octokit/request-error";

import { buildFeedbackPayload } from "@/lib/analysis/feedback";
import { createInstallationOctokit } from "@/lib/github/app-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnalysisDetail } from "@/services/analyses";
import type { Decision, ServiceResult } from "@/types/domain";
import type { Json, Tables } from "@/types/database";

export interface PostedFeedback {
  analysisId: string;
  pullRequestId: string;
  decision: Decision;
  commentId: number;
  commentUrl: string | null;
  bodyMarkdown: string;
  title: string;
  preview: string;
  /** True when an existing feedback_posted event was reused (no new comment). */
  reused: boolean;
}

type PrWithRepo = Tables<"pull_requests"> & {
  repositories: {
    id: string;
    owner: string;
    name: string;
    full_name: string;
    github_installation_id: number | null;
    connected_by_user_id: string;
    connection_status: string;
  };
};

function appBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "";
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "");
  }
  return `https://${raw.replace(/\/$/, "")}`;
}

function mapPermissionError(err: unknown): ServiceResult<PostedFeedback> {
  if (err instanceof RequestError) {
    const status = err.status;
    if (status === 403 || status === 401) {
      return {
        ok: false,
        error:
          "GitHub App cannot comment on this pull request. Grant the App **Pull requests: Read and write** (or Issues: Read and write), then reinstall/update the installation on the repository.",
        code: "github_permission",
      };
    }
    if (status === 404) {
      return {
        ok: false,
        error:
          "Pull request not found via GitHub App. Confirm the App is installed on this repository.",
        code: "github_not_found",
      };
    }
    return {
      ok: false,
      error: `GitHub API error (${status}): ${err.message}`,
      code: "github_error",
    };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Failed to post feedback",
    code: "unexpected",
  };
}

/**
 * Load completed analysis + PR/repo, build deterministic feedback, post PR comment,
 * and record analysis_events.feedback_posted.
 *
 * Idempotent per analysis unless force=true: reuses prior feedback_posted metadata.
 */
export async function postAnalysisFeedback(input: {
  userId: string;
  analysisId: string;
  force?: boolean;
}): Promise<ServiceResult<PostedFeedback>> {
  try {
    const admin = createAdminClient();

    // Authorize + load full analysis (reasons recomputed consistently with UI)
    const detailResult = await getAnalysisDetail(
      input.userId,
      input.analysisId,
      null,
    );
    if (!detailResult.ok) {
      return {
        ok: false,
        error: detailResult.error,
        code: detailResult.code ?? "db_error",
      };
    }
    if (!detailResult.data) {
      return { ok: false, error: "Analysis not found", code: "not_found" };
    }

    const detail = detailResult.data;
    if (detail.status !== "completed") {
      return {
        ok: false,
        error: "Only completed analyses can post feedback",
        code: "not_ready",
      };
    }

    const { data: prRaw, error: prError } = await admin
      .from("pull_requests")
      .select(
        "*, repositories!inner(id, owner, name, full_name, github_installation_id, connected_by_user_id, connection_status)",
      )
      .eq("id", detail.pullRequestId)
      .maybeSingle();

    if (prError || !prRaw) {
      return { ok: false, error: "Pull request not found", code: "not_found" };
    }

    const pr = prRaw as unknown as PrWithRepo;
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

    // Idempotency: reuse prior post for this analysis unless force
    if (!input.force) {
      const { data: existing } = await admin
        .from("analysis_events")
        .select("id, message, metadata, created_at")
        .eq("analysis_id", input.analysisId)
        .eq("event_type", "feedback_posted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.metadata && typeof existing.metadata === "object") {
        const meta = existing.metadata as Record<string, unknown>;
        const commentId = Number(meta.comment_id);
        if (Number.isFinite(commentId) && commentId > 0) {
          const decision =
            (meta.decision as Decision) ??
            (detail.finalDecision as Decision) ??
            "REVIEW_RECOMMENDED";
          return {
            ok: true,
            data: {
              analysisId: input.analysisId,
              pullRequestId: detail.pullRequestId,
              decision,
              commentId,
              commentUrl:
                typeof meta.comment_url === "string" ? meta.comment_url : null,
              bodyMarkdown:
                typeof meta.body_markdown === "string"
                  ? meta.body_markdown
                  : "",
              title:
                typeof meta.title === "string"
                  ? meta.title
                  : existing.message ?? "Feedback already posted",
              preview:
                typeof meta.preview === "string" ? meta.preview : "",
              reused: true,
            },
          };
        }
      }
    }

    const finalDecision =
      detail.finalDecisionResult?.finalDecision ??
      (detail.finalDecision as Decision | null) ??
      "REVIEW_RECOMMENDED";

    const reasons = detail.finalDecisionResult?.reasons ?? [];
    const intent = detail.intentScope;
    const impactReason = reasons.find((r) => r.source === "impact");

    const base = appBaseUrl();
    const dashboardUrl = base
      ? `${base}/dashboard/pull-requests/${detail.pullRequestId}`
      : null;

    const payload = buildFeedbackPayload({
      analysisId: input.analysisId,
      finalDecision,
      reasons,
      summary: detail.summary,
      taskSummary: intent?.taskSummary ?? pr.title,
      scopeCreepDetected: intent?.scopeCreepDetected,
      unrelatedFiles: intent?.unrelatedFiles,
      coverage: intent?.coverage ?? null,
      impactClassification: detail.impactClassification ?? null,
      impactExplanation: impactReason?.message ?? null,
      riskClassification: detail.riskClassification ?? null,
      riskScore: detail.riskScore ?? null,
      scopeClassification: detail.scopeClassification ?? null,
      findings: detail.findings.map((f) => ({
        severity: f.severity,
        category: f.category,
        title: f.title,
        summary: f.summary,
        affectedFiles: f.affectedFiles,
      })),
      repositoryFullName: repo.full_name,
      pullRequestNumber: pr.number,
      headSha: detail.headSha,
      analysisVersion: detail.analysisVersion,
      dashboardUrl,
      productName: "Veris",
    });

    const octokit = createInstallationOctokit(repo.github_installation_id);

    let comment: { id: number; html_url: string };
    try {
      const { data } = await octokit.rest.issues.createComment({
        owner: repo.owner,
        repo: repo.name,
        issue_number: pr.number,
        body: payload.bodyMarkdown,
      });
      comment = { id: data.id, html_url: data.html_url };
    } catch (err) {
      return mapPermissionError(err);
    }

    const metadata: Record<string, unknown> = {
      comment_id: comment.id,
      comment_url: comment.html_url,
      decision: payload.decision,
      title: payload.title,
      preview: payload.preview,
      head_sha: detail.headSha,
      analysis_version: detail.analysisVersion,
      force: Boolean(input.force),
      body_markdown: payload.bodyMarkdown.slice(0, 8000),
      posted_by_user_id: input.userId,
    };

    await admin.from("analysis_events").insert({
      analysis_id: input.analysisId,
      pull_request_id: detail.pullRequestId,
      event_type: "feedback_posted",
      message: `Feedback posted to PR #${pr.number}: ${payload.decision}`,
      metadata: metadata as Json,
    });

    return {
      ok: true,
      data: {
        analysisId: input.analysisId,
        pullRequestId: detail.pullRequestId,
        decision: payload.decision,
        commentId: comment.id,
        commentUrl: comment.html_url,
        bodyMarkdown: payload.bodyMarkdown,
        title: payload.title,
        preview: payload.preview,
        reused: false,
      },
    };
  } catch (err) {
    console.error("postAnalysisFeedback:", err);
    return mapPermissionError(err);
  }
}

/**
 * Whether feedback has already been posted for this analysis (for UI state).
 */
export async function getFeedbackPostedStatus(
  userId: string,
  analysisId: string,
): Promise<
  ServiceResult<{
    posted: boolean;
    commentUrl: string | null;
    commentId: number | null;
    createdAt: string | null;
  }>
> {
  try {
    const admin = createAdminClient();

    const { data: analysis } = await admin
      .from("analyses")
      .select("id, pull_request_id")
      .eq("id", analysisId)
      .maybeSingle();

    if (!analysis) {
      return { ok: false, error: "Analysis not found", code: "not_found" };
    }

    const { data: pr } = await admin
      .from("pull_requests")
      .select("id, repositories!inner(connected_by_user_id)")
      .eq("id", analysis.pull_request_id)
      .maybeSingle();

    const prRow = pr as unknown as {
      repositories: { connected_by_user_id: string };
    } | null;

    if (!prRow || prRow.repositories.connected_by_user_id !== userId) {
      return { ok: false, error: "Unauthorized", code: "unauthorized" };
    }

    const { data: event } = await admin
      .from("analysis_events")
      .select("metadata, created_at")
      .eq("analysis_id", analysisId)
      .eq("event_type", "feedback_posted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!event) {
      return {
        ok: true,
        data: {
          posted: false,
          commentUrl: null,
          commentId: null,
          createdAt: null,
        },
      };
    }

    const meta = (event.metadata ?? {}) as Record<string, unknown>;
    const commentId = Number(meta.comment_id);
    return {
      ok: true,
      data: {
        posted: true,
        commentUrl:
          typeof meta.comment_url === "string" ? meta.comment_url : null,
        commentId: Number.isFinite(commentId) ? commentId : null,
        createdAt: event.created_at,
      },
    };
  } catch (err) {
    console.error("getFeedbackPostedStatus:", err);
    return {
      ok: false,
      error: "Failed to load feedback status",
      code: "unexpected",
    };
  }
}
