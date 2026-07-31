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

  console.log("GitHub App credential check:", {
    hasAppId: Boolean(appId),
    appIdLength: appId?.length ?? 0,
    hasPrivateKey: Boolean(privateKey),
    privateKeyLength: privateKey?.length ?? 0,
  });

  if (!appId || !privateKey) {
    throw new Error(
      "GitHub App credentials missing. Check GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.",
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