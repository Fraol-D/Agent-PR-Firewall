import { type NextRequest } from "next/server";

import {
  jsonError,
  jsonOk,
  parseJsonBody,
  requireApiUser,
  statusFromServiceCode,
} from "@/lib/api/route-helpers";
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
  const auth = await requireApiUser();
  if (auth.error) {
    return auth.error;
  }

  if (!isGitHubAppConfigured() || !isAdminClientConfigured()) {
    return jsonError(
      503,
      "GitHub App or Supabase service role is not configured",
      { missing: getGitHubAppMissingConfig() },
    );
  }

  // Empty body is allowed (sync all repos for the user).
  const parsed = await parseJsonBody<{ repositoryId?: string }>(request, {
    optional: true,
  });
  if (parsed.error) {
    return parsed.error;
  }

  const repositoryId =
    typeof parsed.body.repositoryId === "string" &&
    parsed.body.repositoryId.trim() !== ""
      ? parsed.body.repositoryId.trim()
      : undefined;

  const result = await syncPullRequestsForUser({
    userId: auth.user.id,
    repositoryId,
    state: "all",
  });

  if (!result.ok) {
    return jsonError(statusFromServiceCode(result.code), result.error, {
      code: result.code,
    });
  }

  return jsonOk({ ...result.data });
}
