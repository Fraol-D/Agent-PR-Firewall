import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import {
  getGitHubAppInstallUrl,
  getGitHubAppMissingConfig,
  isGitHubAppConfigured,
} from "@/lib/github/config";
import { createInstallState } from "@/lib/github/install-state";

/**
 * Starts the GitHub App installation flow for the authenticated user.
 * GET /api/github/install
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login?next=/dashboard/repositories", getBaseUrl()),
    );
  }

  if (!isGitHubAppConfigured()) {
    const missing = getGitHubAppMissingConfig()
      .filter((k) => k !== "GITHUB_APP_WEBHOOK_SECRET")
      .join(", ");
    return NextResponse.redirect(
      new URL(
        `/dashboard/repositories?error=github_app_not_configured&missing=${encodeURIComponent(missing)}`,
        getBaseUrl(),
      ),
    );
  }

  const state = createInstallState(user.id);
  const installUrl = getGitHubAppInstallUrl(state);

  if (!installUrl) {
    return NextResponse.redirect(
      new URL(
        "/dashboard/repositories?error=github_app_not_configured",
        getBaseUrl(),
      ),
    );
  }

  return NextResponse.redirect(installUrl);
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}
