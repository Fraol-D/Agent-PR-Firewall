/**
 * GitHub App configuration helpers (server-side only).
 *
 * Private key loading supports a single code path for:
 * - Local file via GITHUB_APP_PRIVATE_KEY_PATH (recommended for npm run dev)
 * - Multiline PEM in GITHUB_APP_PRIVATE_KEY (.env.local)
 * - Escaped-newline PEM in GITHUB_APP_PRIVATE_KEY (Vercel env UI)
 */

import { existsSync, readFileSync } from "fs";
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

/**
 * Load and normalize the GitHub App private key for Octokit.
 * Prefer PATH locally; env PEM works for both local multiline and Vercel `\n` form.
 */
export function getGitHubAppPrivateKey(): string | null {
  const fromPath = readPrivateKeyFromPath();
  const fromEnv = process.env.GITHUB_APP_PRIVATE_KEY ?? null;
  const raw = fromPath ?? fromEnv;

  if (!raw?.trim()) {
    logPrivateKeyDiagnostics({
      detected: false,
      source: "none",
      rawLength: 0,
      normalizedLength: 0,
      hadEscapedNewlines: false,
      convertedEscapedNewlines: false,
      hadRealNewlines: false,
      pemValid: false,
    });
    return null;
  }

  const source = fromPath ? "path" : "env";
  const hadEscapedNewlines = /\\n/.test(raw);
  const hadRealNewlines = raw.includes("\n");
  const normalized = normalizePrivateKeyPem(raw);
  const convertedEscapedNewlines =
    hadEscapedNewlines && normalized.includes("\n");
  const pemValid = isValidPrivateKeyPem(normalized);

  logPrivateKeyDiagnostics({
    detected: true,
    source,
    rawLength: raw.length,
    normalizedLength: normalized.length,
    hadEscapedNewlines,
    convertedEscapedNewlines,
    hadRealNewlines,
    pemValid,
  });

  if (!pemValid) {
    console.error(
      "[github-app] GITHUB_APP_PRIVATE_KEY is set but failed PEM validation after normalization.",
    );
    return null;
  }

  return normalized;
}

/**
 * Normalize PEM from file, multiline env, or Vercel-style escaped newlines.
 * Does not log or return secrets beyond the normalized key string to the caller.
 */
export function normalizePrivateKeyPem(value: string): string {
  let key = value.trim();

  // Strip UTF-8 BOM
  key = key.replace(/^\uFEFF/, "");

  // Strip wrapping single/double quotes (common in .env)
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  // Vercel / dotenv: literal backslash-n sequences → real newlines
  // Only replace escaped sequences; existing real newlines are preserved.
  if (key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }
  // Rare double-escaping from some dashboards
  if (key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }

  // Normalize Windows CRLF and lone CR
  key = key.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Trim each line but keep PEM structure (blank lines dropped)
  key = key
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  // PEM parsers expect a trailing newline
  if (!key.endsWith("\n")) {
    key = `${key}\n`;
  }

  return key;
}

/**
 * Validate PEM shape without inspecting key material beyond headers.
 * Accepts PKCS#8 ("BEGIN PRIVATE KEY") and legacy RSA ("BEGIN RSA PRIVATE KEY").
 */
export function isValidPrivateKeyPem(value: string): boolean {
  const v = value.trim();
  const hasBegin =
    v.includes("-----BEGIN PRIVATE KEY-----") ||
    v.includes("-----BEGIN RSA PRIVATE KEY-----");
  const hasEnd =
    v.includes("-----END PRIVATE KEY-----") ||
    v.includes("-----END RSA PRIVATE KEY-----");
  return hasBegin && hasEnd && v.length > 100;
}

function readPrivateKeyFromPath(): string | null {
  const configured = process.env.GITHUB_APP_PRIVATE_KEY_PATH?.trim();
  if (!configured) return null;

  const absolute = path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), configured);

  if (!existsSync(absolute)) {
    console.error(
      `[github-app] GITHUB_APP_PRIVATE_KEY_PATH file not found: ${configured}`,
    );
    return null;
  }

  try {
    return readFileSync(absolute, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : "read failed";
    console.error(
      `[github-app] Failed to read GITHUB_APP_PRIVATE_KEY_PATH: ${message}`,
    );
    return null;
  }
}

function logPrivateKeyDiagnostics(info: {
  detected: boolean;
  source: "path" | "env" | "none";
  rawLength: number;
  normalizedLength: number;
  hadEscapedNewlines: boolean;
  convertedEscapedNewlines: boolean;
  hadRealNewlines: boolean;
  pemValid: boolean;
}): void {
  // Temporary server-side diagnostics — never log key contents.
  console.info("[github-app] private-key diagnostics", {
    detected: info.detected,
    source: info.source,
    keyLengthRaw: info.rawLength,
    keyLengthNormalized: info.normalizedLength,
    hadEscapedNewlines: info.hadEscapedNewlines,
    convertedEscapedNewlines: info.convertedEscapedNewlines,
    hadRealNewlines: info.hadRealNewlines,
    pemValidationPassed: info.pemValid,
  });
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
    missing.push("GITHUB_APP_PRIVATE_KEY (or GITHUB_APP_PRIVATE_KEY_PATH)");
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
