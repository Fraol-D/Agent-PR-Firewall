/**
 * GitHub App configuration helpers (server-side only).
 */

import { readFileSync, existsSync } from "fs";
import path from "path";

export const GITHUB_OAUTH_SCOPES = ["read:user", "user:email"] as const;

/**
 * Minimum GitHub App permissions for Stage 1 (ingestion + repo metadata).
 * Document these when creating the App in GitHub settings.
 */
export const GITHUB_APP_PERMISSIONS = {
  /** Repository metadata (always required for apps). */
  metadata: "read",
  /** Read repository contents when needed for metadata verification. */
  contents: "read",
  /** Read pull request metadata and files. */
  pull_requests: "read",
} as const;

/** Events the GitHub App webhook should subscribe to. */
export const GITHUB_APP_WEBHOOK_EVENTS = [
  "installation",
  "installation_repositories",
  "pull_request",
] as const;

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

export function getGitHubAppSlug(): string | null {
  return process.env.GITHUB_APP_SLUG?.trim() || null;
}

export function getGitHubAppId(): string | null {
  return process.env.GITHUB_APP_ID?.trim() || null;
}

/**
 * Private key resolution order:
 * 1. GITHUB_APP_PRIVATE_KEY_PATH → read .pem file from disk (recommended)
 * 2. GITHUB_APP_PRIVATE_KEY env (supports literal \n escapes)
 *
 * A valid RSA key is thousands of characters. Short values mean the env
 * var was split across lines incorrectly.
 */
export function getGitHubAppPrivateKey(): string | null {
  // Prefer explicit path. Also accept a path mistakenly put in PRIVATE_KEY.
  const candidates = [
    process.env.GITHUB_APP_PRIVATE_KEY_PATH?.trim(),
    looksLikeKeyPath(process.env.GITHUB_APP_PRIVATE_KEY)
      ? process.env.GITHUB_APP_PRIVATE_KEY?.trim()
      : null,
  ].filter(Boolean) as string[];

  for (const keyPath of candidates) {
    try {
      const absolute = path.isAbsolute(keyPath)
        ? keyPath
        : path.join(process.cwd(), keyPath);
      if (existsSync(absolute)) {
        // Support PEM files that accidentally contain literal "\n" sequences
        // or extra blank lines (common when pasting from env examples).
        const fileKey = normalizePrivateKeyPem(
          readFileSync(absolute, "utf8"),
        );
        if (isPlausiblePrivateKey(fileKey)) {
          return fileKey;
        }
        console.error(
          "Private key file does not look like a PEM private key:",
          absolute,
        );
      } else {
        console.error("Private key path not found:", absolute);
      }
    } catch (err) {
      console.error("Failed to read private key path:", err);
    }
  }

  const raw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!raw?.trim() || looksLikeKeyPath(raw)) {
    return null;
  }

  const normalized = normalizePrivateKeyPem(raw);
  if (!isPlausiblePrivateKey(normalized)) {
    console.error(
      "GITHUB_APP_PRIVATE_KEY is present but invalid/too short. " +
        "Prefer GITHUB_APP_PRIVATE_KEY_PATH pointing at the downloaded .pem file.",
    );
    return null;
  }

  return normalized;
}

function normalizePrivateKeyPem(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, arr) => {
      // Drop empty lines except we simply drop all empties for PEM body safety
      return line.trim().length > 0;
    })
    .join("\n")
    .trim()
    .concat("\n");
}

function looksLikeKeyPath(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().replace(/^["']|["']$/g, "");
  return (
    v.endsWith(".pem") ||
    v.includes("/") ||
    v.includes("\\") ||
    v.startsWith("secrets")
  );
}

function isPlausiblePrivateKey(value: string): boolean {
  return (
    value.includes("BEGIN") &&
    value.includes("PRIVATE KEY") &&
    value.includes("END") &&
    value.length > 500
  );
}

export function getGitHubWebhookSecret(): string | null {
  return process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() || null;
}

export function isGitHubAppConfigured(): boolean {
  return Boolean(
    getGitHubAppId() && getGitHubAppPrivateKey() && getGitHubAppSlug(),
  );
}

export function isGitHubWebhookConfigured(): boolean {
  return Boolean(getGitHubWebhookSecret() && isGitHubAppConfigured());
}

export function getGitHubAppInstallUrl(state?: string): string | null {
  const slug = getGitHubAppSlug();
  if (!slug) {
    return null;
  }

  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  if (state) {
    url.searchParams.set("state", state);
  }
  return url.toString();
}

export function getGitHubAppMissingConfig(): string[] {
  const missing: string[] = [];
  if (!getGitHubAppId()) missing.push("GITHUB_APP_ID");
  if (!getGitHubAppPrivateKey()) {
    missing.push("GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH");
  }
  if (!getGitHubAppSlug()) missing.push("GITHUB_APP_SLUG");
  if (!getGitHubWebhookSecret()) missing.push("GITHUB_APP_WEBHOOK_SECRET");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY.includes("your-service")) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return missing;
}
