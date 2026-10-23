import { NextResponse } from "next/server";

import { getAuthUser, getCurrentUserProfile } from "@/lib/auth/session";
import {
  getGitHubAppMissingConfig,
  isGitHubAppConfigured,
} from "@/lib/github/config";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { syncInstallationsForUser } from "@/services/github-installations";

/**
 * POST /api/github/sync
 * Links existing GitHub App installations to the signed-in user and imports repos.
 * Use when install succeeded on GitHub but Setup URL redirect never completed.
 */
export async function POST() {
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

  const profile = await getCurrentUserProfile();
  const result = await syncInstallationsForUser({
    userId: user.id,
    githubUsername: profile?.username ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...result.data,
  });
}
