/**
 * GitHub Integration Layer — Stage 1 public exports.
 */

export {
  GITHUB_APP_PERMISSIONS,
  GITHUB_APP_WEBHOOK_EVENTS,
  GITHUB_OAUTH_SCOPES,
  getAppUrl,
  getGitHubAppInstallUrl,
  getGitHubAppMissingConfig,
  getGitHubAppSlug,
  isGitHubAppConfigured,
  isGitHubWebhookConfigured,
} from "@/lib/github/config";

export {
  createAppOctokit,
  createInstallationOctokit,
} from "@/lib/github/app-auth";
