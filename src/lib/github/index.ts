/**
 * GitHub Integration Layer — Stage 0 stubs.
 * Full GitHub App, webhooks, and API clients land in Stage 1.
 */

export const GITHUB_OAUTH_SCOPES = ["read:user", "user:email"] as const;

/** Minimum permissions planned for the GitHub App (Stage 1). */
export const GITHUB_APP_PERMISSIONS = {
  contents: "read",
  pull_requests: "write",
  metadata: "read",
  checks: "write",
} as const;

export function getGitHubAppInstallUrl(): string | null {
  const appSlug = process.env.GITHUB_APP_SLUG;
  if (!appSlug) {
    return null;
  }
  return `https://github.com/apps/${appSlug}/installations/new`;
}

export function isGitHubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY &&
      process.env.GITHUB_APP_SLUG,
  );
}
