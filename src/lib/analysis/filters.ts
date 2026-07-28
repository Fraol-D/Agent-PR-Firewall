/**
 * Cost, safety, and token-protection filters for analysis context.
 */

const SECRET_PATH_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.env\.local$/i,
  /(^|\/)secrets?\//i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /credentials/i,
  /service[_-]?account/i,
  /\.p12$/i,
  /\.pfx$/i,
];

const LOCKFILE_PATTERNS = [
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
  /yarn\.lock$/i,
  /bun\.lockb?$/i,
  /Cargo\.lock$/i,
  /poetry\.lock$/i,
  /composer\.lock$/i,
  /go\.sum$/i,
];

const GENERATED_PATTERNS = [
  /(^|\/)dist\//i,
  /(^|\/)build\//i,
  /(^|\/)\.next\//i,
  /(^|\/)coverage\//i,
  /(^|\/)node_modules\//i,
  /\.min\.(js|css)$/i,
  /\.map$/i,
];

const BINARY_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
  ".wasm",
];

export const ANALYSIS_LIMITS = {
  maxFilesInAiContext: 40,
  maxPatchCharsPerFile: 2500,
  maxTotalPatchChars: 40_000,
  maxAiContextChars: 60_000,
  maxConcurrentAnalysesPerPr: 1,
} as const;

export function shouldExcludeFromAi(path: string): {
  exclude: boolean;
  reason?: string;
} {
  const normalized = path.replace(/\\/g, "/");

  for (const re of SECRET_PATH_PATTERNS) {
    if (re.test(normalized)) {
      return { exclude: true, reason: "Potential secret or credential file" };
    }
  }
  for (const re of LOCKFILE_PATTERNS) {
    if (re.test(normalized)) {
      return { exclude: true, reason: "Lockfile excluded to reduce noise/cost" };
    }
  }
  for (const re of GENERATED_PATTERNS) {
    if (re.test(normalized)) {
      return { exclude: true, reason: "Generated/build artifact" };
    }
  }
  const lower = normalized.toLowerCase();
  if (BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { exclude: true, reason: "Binary or media file" };
  }

  return { exclude: false };
}

export function redactSecretsInText(input: string): string {
  let text = input;
  // Common secret-looking assignments
  text = text.replace(
    /((?:api[_-]?key|secret|token|password|private[_-]?key|authorization)\s*[:=]\s*)(["']?)([^\s"'\\]{8,})(\2)/gi,
    "$1$2[REDACTED]$4",
  );
  text = text.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  );
  text = text.replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    "[REDACTED_JWT]",
  );
  return text;
}

export function truncatePatch(
  patch: string | undefined | null,
  maxChars: number = ANALYSIS_LIMITS.maxPatchCharsPerFile,
): { text: string | null; truncated: boolean } {
  if (!patch) return { text: null, truncated: false };
  const redacted = redactSecretsInText(patch);
  if (redacted.length <= maxChars) {
    return { text: redacted, truncated: false };
  }
  return {
    text:
      redacted.slice(0, maxChars) +
      `\n… [patch truncated at ${maxChars} chars]`,
    truncated: true,
  };
}
