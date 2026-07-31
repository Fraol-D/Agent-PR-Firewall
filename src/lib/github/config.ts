/**
 * GitHub App configuration helpers (server-side only).
 */

import { readFileSync, existsSync } from "fs";
import path from "path";

export const GITHUB_OAUTH_SCOPES = ["read:user", "user:email"] as const;

export const GITHUB_APP_PERMISSIONS = {
  metadata: "read",
  contents: "read",
  pull_requests: "read",
} as const;

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

export function getGitHubAppPrivateKey(): string | null {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!raw?.trim()) {
    console.error("GITHUB_APP_PRIVATE_KEY is empty.");
    return null;
  }

  const normalized = normalizePrivateKeyPem(raw);

  if (!isPlausiblePrivateKey(normalized)) {
    console.error(
      "GITHUB_APP_PRIVATE_KEY exists but is not a valid PEM private key.",
    );
    return null;
  }

  return normalized;
}

function normalizePrivateKeyPem(value: string): string {
  return value
    .replace(/^["']|["']$/g, "")
    .replace(/^\uFEFF/, "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .concat("\n");
}

function isPlausiblePrivateKey(value: string): boolean {
  return (
    value.includes("-----BEGIN") &&
    value.includes("PRIVATE KEY-----") &&
    value.includes("-----END") &&
    value.length > 500
  );
}

export function getGitHubWebhookSecret(): string | null {
  return process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() || null;
}

export function isGitHubAppConfigured(): boolean {
  return Boolean(
    getGitHubAppId() &&
      getGitHubAppPrivateKey() &&
      getGitHubAppSlug(),
  );
}

export function isGitHubWebhookConfigured(): boolean {
  return Boolean(
    getGitHubWebhookSecret() &&
      isGitHubAppConfigured(),
  );
}

export function getGitHubAppInstallUrl(
  state?: string,
): string | null {
  const slug = getGitHubAppSlug();

  if (!slug) {
    return null;
  }

  const url = new URL(
    `https://github.com/apps/${slug}/installations/new`,
  );

  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}

export function getGitHubAppMissingConfig(): string[] {
  const missing: string[] = [];

  if (!getGitHubAppId()) {
    missing.push("GITHUB_APP_ID");
  }

  if (!getGitHubAppPrivateKey()) {
    missing.push("GITHUB_APP_PRIVATE_KEY");
  }

  if (!getGitHubAppSlug()) {
    missing.push("GITHUB_APP_SLUG");
  }

  if (!getGitHubWebhookSecret()) {
    missing.push("GITHUB_APP_WEBHOOK_SECRET");
  }

  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY.includes("your-service")
  ) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return missing;
}