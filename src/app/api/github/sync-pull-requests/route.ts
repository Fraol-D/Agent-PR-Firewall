import { NextResponse, type NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import {
  getGitHubAppMissingConfig,
  isGitHubAppConfigured,
} from "@/lib/github/config";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { syncPullRequestsForUser } from "@/services/pull-requests";

/**
 * POST /api/github/sync-pull-requests
 * Imports existing PRs from GitHub for connected repositories.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGitHubAppConfigured() || !isAdminClientConfigured()) {
    return NextResponse.json(
      {
        error: "GitHub App or Supabase service role is not configured",
        missing: getGitHubAppMissingConfig(),
      },
      { status: 503 },
    );
  }

  let repositoryId: string | undefined;
  try {
    const body = (await request.json()) as { repositoryId?: string };
    repositoryId = body.repositoryId;
  } catch {
    // empty body is fine
  }

  const result = await syncPullRequestsForUser({
    userId: user.id,
    repositoryId,
    state: "all",
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, ...result.data });
}
