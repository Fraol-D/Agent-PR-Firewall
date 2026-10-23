import { NextResponse, type NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import { isAiProviderConfigured } from "@/lib/analysis/ai";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { startPullRequestAnalysis } from "@/services/analyses";

export const maxDuration = 300;

/**
 * POST /api/analysis/start
 * Body: { pullRequestId: string, force?: boolean }
 */
export async function POST(request: NextRequest) {
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

  if (!isAiProviderConfigured()) {
    return NextResponse.json(
      {
        error:
          "AI provider is not configured. Set OPENROUTER_API_KEY in the server environment (free model cohere/north-mini-code:free).",
      },
      { status: 503 },
    );
  }

  let body: { pullRequestId?: string; force?: boolean };
  try {
    body = (await request.json()) as { pullRequestId?: string; force?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.pullRequestId) {
    return NextResponse.json(
      { error: "pullRequestId is required" },
      { status: 400 },
    );
  }

  const result = await startPullRequestAnalysis({
    userId: user.id,
    pullRequestId: body.pullRequestId,
    force: Boolean(body.force),
  });

  if (!result.ok) {
    const status =
      result.code === "unauthorized"
        ? 403
        : result.code === "not_found"
          ? 404
          : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    analysisId: result.data.analysisId,
    reused: result.data.reused,
  });
}
