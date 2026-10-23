import { NextResponse, type NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import {
  getGitHubAppMissingConfig,
  isGitHubAppConfigured,
} from "@/lib/github/config";
import { verifyInstallState } from "@/lib/github/install-state";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { completeInstallationSetup } from "@/services/github-installations";

/**
 * GitHub App Setup URL target.
 * GitHub redirects here after install/update with installation_id.
 *
 * Configure in GitHub App settings:
 * Setup URL = {APP_URL}/api/github/setup
 * Redirect on update = checked (recommended)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const installationIdRaw = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action");
  const state = searchParams.get("state");

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin;

  if (!isGitHubAppConfigured() || !isAdminClientConfigured()) {
    const missing = getGitHubAppMissingConfig().join(", ");
    console.error("GitHub setup blocked; missing config:", missing);
    return NextResponse.redirect(
      `${base}/dashboard/repositories?error=github_app_not_configured&missing=${encodeURIComponent(missing)}`,
    );
  }

  if (!installationIdRaw) {
    return NextResponse.redirect(
      `${base}/dashboard/repositories?error=missing_installation_id`,
    );
  }

  const installationId = Number(installationIdRaw);
  if (!Number.isFinite(installationId)) {
    return NextResponse.redirect(
      `${base}/dashboard/repositories?error=invalid_installation_id`,
    );
  }

  const sessionUser = await getAuthUser();
  const stateResult = verifyInstallState(state);

  let userId: string | null = sessionUser?.id ?? null;

  if (sessionUser && stateResult.ok && stateResult.userId !== sessionUser.id) {
    return NextResponse.redirect(
      `${base}/dashboard/repositories?error=install_state_mismatch`,
    );
  }

  if (!userId && stateResult.ok) {
    userId = stateResult.userId;
  }

  if (!userId) {
    return NextResponse.redirect(
      `${base}/login?next=${encodeURIComponent(
        `/api/github/setup?installation_id=${installationId}&setup_action=${setupAction ?? "install"}`,
      )}`,
    );
  }

  const result = await completeInstallationSetup({
    installationId,
    userId,
  });

  if (!result.ok) {
    console.error("GitHub setup failed:", result.error);
    return NextResponse.redirect(
      `${base}/dashboard/repositories?error=setup_failed&detail=${encodeURIComponent(result.error)}`,
    );
  }

  return NextResponse.redirect(
    `${base}/dashboard/repositories?connected=1&repos=${result.data.repositoryCount}&action=${setupAction ?? "install"}`,
  );
}
