import { NextResponse, type NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import { isGitHubAppConfigured } from "@/lib/github/app-auth";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import {
  getFeedbackPostedStatus,
  postAnalysisFeedback,
} from "@/services/feedback";

/**
 * GET /api/analysis/:id/feedback
 * Whether feedback was already posted for this analysis.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isAdminClientConfigured()) {
    return NextResponse.json(
      { error: "Server database admin client is not configured" },
      { status: 503 },
    );
  }

  const result = await getFeedbackPostedStatus(user.id, id);
  if (!result.ok) {
    const status =
      result.code === "unauthorized"
        ? 403
        : result.code === "not_found"
          ? 404
          : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ ok: true, ...result.data });
}

/**
 * POST /api/analysis/:id/feedback
 * Build deterministic feedback and post as a GitHub PR comment.
 * Body: { force?: boolean } — force creates a new comment even if already posted.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminClientConfigured()) {
    return NextResponse.json(
      { error: "Server database admin client is not configured" },
      { status: 503 },
    );
  }

  if (!isGitHubAppConfigured()) {
    return NextResponse.json(
      {
        error:
          "GitHub App is not configured. Set GITHUB_APP_ID and private key (path or PEM).",
      },
      { status: 503 },
    );
  }

  const { id } = await context.params;

  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    force = Boolean(body?.force);
  } catch {
    // empty body is fine
  }

  const result = await postAnalysisFeedback({
    userId: user.id,
    analysisId: id,
    force,
  });

  if (!result.ok) {
    const status =
      result.code === "unauthorized"
        ? 403
        : result.code === "not_found"
          ? 404
          : result.code === "not_ready"
            ? 409
            : result.code === "github_permission"
              ? 403
              : result.code === "misconfigured"
                ? 400
                : result.code === "github_not_found"
                  ? 404
                  : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    feedback: {
      analysisId: result.data.analysisId,
      pullRequestId: result.data.pullRequestId,
      decision: result.data.decision,
      commentId: result.data.commentId,
      commentUrl: result.data.commentUrl,
      title: result.data.title,
      preview: result.data.preview,
      reused: result.data.reused,
    },
  });
}
