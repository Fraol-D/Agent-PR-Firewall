/**
 * Stage 5 — GitHub Check Run reporter (advisory / report-only).
 */

import { RequestError } from "@octokit/request-error";

import {
  CHECK_RUN_NAME,
  buildCheckOutput,
  decisionToCheckConclusion,
  overrideToCheckConclusion,
} from "@/lib/analysis/checks";
import { createInstallationOctokit } from "@/lib/github/app-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Decision, ServiceResult } from "@/types/domain";
import type { Json } from "@/types/database";

export interface ReportedCheckRun {
  checkRunId: number;
  htmlUrl: string | null;
  conclusion: string;
}

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

function permissionError(err: unknown): ServiceResult<ReportedCheckRun> {
  if (err instanceof RequestError) {
    if (err.status === 403 || err.status === 401) {
      return {
        ok: false,
        error:
          "GitHub App cannot create check runs. Grant the App **Checks: Read and write**, then accept the permission update on the installation.",
        code: "github_permission",
      };
    }
    return {
      ok: false,
      error: `GitHub Checks API error (${err.status}): ${err.message}`,
      code: "github_error",
    };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Failed to report check run",
    code: "unexpected",
  };
}

/**
 * Create a completed, report-only Check Run for a finished analysis.
 * Soft-fails: callers should not fail the analysis if GitHub rejects this.
 */
export async function reportAnalysisCheckRun(input: {
  analysisId: string;
  pullRequestId: string;
  owner: string;
  repo: string;
  installationId: number;
  headSha: string;
  decision: Decision;
  summary?: string | null;
  reasons?: Array<{ message: string }>;
}): Promise<ServiceResult<ReportedCheckRun>> {
  try {
    const dashboardUrl = appBaseUrl()
      ? `${appBaseUrl()}/dashboard/pull-requests/${input.pullRequestId}`
      : null;
    const conclusion = decisionToCheckConclusion(input.decision);
    const output = buildCheckOutput({
      decision: input.decision,
      summary: input.summary,
      reasons: input.reasons,
      dashboardUrl,
    });

    const octokit = createInstallationOctokit(input.installationId);
    const { data } = await octokit.rest.checks.create({
      owner: input.owner,
      repo: input.repo,
      name: CHECK_RUN_NAME,
      head_sha: input.headSha,
      status: "completed",
      conclusion,
      details_url: dashboardUrl ?? undefined,
      output,
    });

    const admin = createAdminClient();
    await admin.from("analysis_events").insert({
      analysis_id: input.analysisId,
      pull_request_id: input.pullRequestId,
      event_type: "check_run_reported",
      message: `Check run ${conclusion} for ${input.decision}`,
      metadata: {
        check_run_id: data.id,
        html_url: data.html_url,
        conclusion,
        head_sha: input.headSha,
        decision: input.decision,
      } as Json,
    });

    return {
      ok: true,
      data: {
        checkRunId: data.id,
        htmlUrl: data.html_url ?? null,
        conclusion,
      },
    };
  } catch (err) {
    console.error("reportAnalysisCheckRun:", err);
    return permissionError(err);
  }
}

export async function updateCheckRunForOverride(input: {
  analysisId: string;
  pullRequestId: string;
  owner: string;
  repo: string;
  installationId: number;
  checkRunId: number;
  action: "approve" | "keep_blocked";
  originalDecision: Decision;
}): Promise<ServiceResult<ReportedCheckRun>> {
  try {
    const conclusion = overrideToCheckConclusion(input.action);
    const dashboardUrl = appBaseUrl()
      ? `${appBaseUrl()}/dashboard/pull-requests/${input.pullRequestId}`
      : null;
    const output = buildCheckOutput({
      decision: input.originalDecision,
      summary:
        input.action === "approve"
          ? "A human approved this pull request despite the engine decision. Advisory override — GitHub merge is unchanged."
          : "A human kept this pull request blocked. Advisory override — GitHub merge is unchanged.",
      dashboardUrl,
      advisoryNote: `Human override: ${input.action.replace("_", " ")}. Engine decision remains ${input.originalDecision}.`,
    });

    const octokit = createInstallationOctokit(input.installationId);
    const { data } = await octokit.rest.checks.update({
      owner: input.owner,
      repo: input.repo,
      check_run_id: input.checkRunId,
      conclusion,
      output,
    });

    return {
      ok: true,
      data: {
        checkRunId: data.id,
        htmlUrl: data.html_url ?? null,
        conclusion,
      },
    };
  } catch (err) {
    console.error("updateCheckRunForOverride:", err);
    return permissionError(err);
  }
}
