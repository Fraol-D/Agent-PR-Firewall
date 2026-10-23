import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

import {
  getGitHubAppId,
  getGitHubAppPrivateKey,
  isGitHubAppConfigured,
} from "@/lib/github/config";

function requireAppCredentials() {
  const appId = getGitHubAppId();
  const privateKey = getGitHubAppPrivateKey();

  if (!appId || !privateKey) {
    throw new Error(
      "GitHub App credentials missing. Set GITHUB_APP_ID and either GITHUB_APP_PRIVATE_KEY_PATH (local PEM file) or GITHUB_APP_PRIVATE_KEY (multiline or \\n-escaped PEM).",
    );
  }

  return { appId, privateKey };
}

export function createAppOctokit(): Octokit {
  const { appId, privateKey } = requireAppCredentials();

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });
}

export function createInstallationOctokit(
  installationId: number,
): Octokit {
  const { appId, privateKey } = requireAppCredentials();

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });
}

export { isGitHubAppConfigured };