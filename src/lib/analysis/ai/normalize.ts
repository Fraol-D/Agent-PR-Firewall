/**
 * Normalize free-model JSON before Zod validation.
 * Small free models often return valid meaning with invalid casing/aliases.
 */

const CATEGORIES = new Set([
  "SECURITY",
  "DATA",
  "AUTHENTICATION",
  "PERFORMANCE",
  "RELIABILITY",
  "DATABASE",
  "API",
  "DEPENDENCY",
  "CONFIGURATION",
  "MAINTAINABILITY",
  "SCOPE",
  "OTHER",
]);

const CATEGORY_ALIASES: Record<string, string> = {
  security: "SECURITY",
  secure: "SECURITY",
  vuln: "SECURITY",
  vulnerability: "SECURITY",
  data: "DATA",
  privacy: "DATA",
  pii: "DATA",
  auth: "AUTHENTICATION",
  authentication: "AUTHENTICATION",
  authorization: "AUTHENTICATION",
  authn: "AUTHENTICATION",
  authz: "AUTHENTICATION",
  performance: "PERFORMANCE",
  perf: "PERFORMANCE",
  reliability: "RELIABILITY",
  stability: "RELIABILITY",
  database: "DATABASE",
  db: "DATABASE",
  sql: "DATABASE",
  migration: "DATABASE",
  api: "API",
  endpoint: "API",
  dependency: "DEPENDENCY",
  dependencies: "DEPENDENCY",
  deps: "DEPENDENCY",
  package: "DEPENDENCY",
  configuration: "CONFIGURATION",
  config: "CONFIGURATION",
  env: "CONFIGURATION",
  maintainability: "MAINTAINABILITY",
  quality: "MAINTAINABILITY",
  refactor: "MAINTAINABILITY",
  scope: "SCOPE",
  other: "OTHER",
  general: "OTHER",
  misc: "OTHER",
  unknown: "OTHER",
  code: "OTHER",
  frontend: "OTHER",
  backend: "OTHER",
  docs: "OTHER",
  documentation: "OTHER",
  test: "OTHER",
  tests: "OTHER",
};

const SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);

const SEVERITY_ALIASES: Record<string, string> = {
  informational: "info",
  information: "info",
  note: "info",
  minor: "low",
  moderate: "medium",
  med: "medium",
  major: "high",
  severe: "high",
  blocker: "critical",
  urgent: "critical",
};

const OVERALL = new Set([
  "no_significant_concerns",
  "review_recommended",
  "high_risk_concerns",
]);

const OVERALL_ALIASES: Record<string, string> = {
  no_significant_concerns: "no_significant_concerns",
  no_concerns: "no_significant_concerns",
  none: "no_significant_concerns",
  low: "no_significant_concerns",
  ok: "no_significant_concerns",
  clean: "no_significant_concerns",
  review_recommended: "review_recommended",
  review: "review_recommended",
  medium: "review_recommended",
  high_risk_concerns: "high_risk_concerns",
  high_risk: "high_risk_concerns",
  high: "high_risk_concerns",
  critical: "high_risk_concerns",
  blocked: "high_risk_concerns",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeCategory(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "OTHER";
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (CATEGORIES.has(upper)) return upper;
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  if (CATEGORY_ALIASES[trimmed.toLowerCase()]) {
    return CATEGORY_ALIASES[trimmed.toLowerCase()];
  }
  // "Security Risk" → SECURITY
  for (const [alias, mapped] of Object.entries(CATEGORY_ALIASES)) {
    if (trimmed.toLowerCase().includes(alias)) return mapped;
  }
  return "OTHER";
}

function normalizeSeverity(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "info";
  const key = raw.trim().toLowerCase();
  if (SEVERITIES.has(key)) return key;
  if (SEVERITY_ALIASES[key]) return SEVERITY_ALIASES[key];
  return "info";
}

function normalizeOverall(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return "review_recommended";
  }
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (OVERALL.has(key)) return key;
  if (OVERALL_ALIASES[key]) return OVERALL_ALIASES[key];
  return "review_recommended";
}

function normalizeConfidence(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1 && raw <= 100) return Math.min(1, raw / 100);
    return Math.max(0, Math.min(1, raw));
  }
  if (typeof raw === "string") {
    const n = Number(raw.replace(/%/g, "").trim());
    if (!Number.isFinite(n)) return null;
    if (n > 1 && n <= 100) return Math.min(1, n / 100);
    return Math.max(0, Math.min(1, n));
  }
  return null;
}

function normalizeBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (["true", "yes", "1"].includes(v)) return true;
    if (["false", "no", "0"].includes(v)) return false;
  }
  if (typeof raw === "number") return raw !== 0;
  return fallback;
}

function normalizeString(raw: unknown, fallback = ""): string {
  if (typeof raw === "string") return raw;
  if (raw == null) return fallback;
  return String(raw);
}

function normalizeAffectedFiles(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === "string" && raw.trim()) return [raw.trim()];
    return [];
  }
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      const rec = asRecord(item);
      if (rec?.path && typeof rec.path === "string") return rec.path;
      if (rec?.file && typeof rec.file === "string") return rec.file;
      return null;
    })
    .filter((x): x is string => Boolean(x));
}

function normalizeFinding(raw: unknown): Record<string, unknown> {
  const f = asRecord(raw) ?? {};
  return {
    category: normalizeCategory(f.category ?? f.type ?? f.kind),
    severity: normalizeSeverity(f.severity ?? f.level ?? f.priority),
    title: normalizeString(f.title ?? f.name, "Untitled finding").slice(0, 200),
    summary: normalizeString(f.summary ?? f.description, "No summary").slice(
      0,
      500,
    ),
    explanation: normalizeString(
      f.explanation ?? f.details ?? f.rationale ?? f.summary,
      "No explanation provided.",
    ).slice(0, 4000),
    evidence: normalizeString(
      f.evidence ?? f.proof ?? f.reason ?? f.source,
      "No concrete evidence provided by the model.",
    ).slice(0, 4000),
    affectedFiles: normalizeAffectedFiles(
      f.affectedFiles ?? f.affected_files ?? f.files ?? f.file,
    ),
    confidence: normalizeConfidence(f.confidence ?? f.score),
    isInference: normalizeBoolean(
      f.isInference ?? f.is_inference ?? f.inference,
      true,
    ),
  };
}

/**
 * Coerce provider JSON into the shape expected by aiAnalysisResponseSchema.
 */
export function normalizeAiAnalysisPayload(raw: unknown): unknown {
  const root = asRecord(raw);
  if (!root) return raw;

  // Some models nest under data/result/analysis
  const nested =
    asRecord(root.data) ??
    asRecord(root.result) ??
    asRecord(root.analysis) ??
    root;

  const findingsRaw = nested.findings ?? nested.issues ?? nested.results;
  const findings = Array.isArray(findingsRaw)
    ? findingsRaw.map(normalizeFinding)
    : [];

  return {
    summary: normalizeString(
      nested.summary ?? nested.overview ?? nested.analysis_summary,
      "Analysis completed.",
    ).slice(0, 4000),
    overallStatus: normalizeOverall(
      nested.overallStatus ??
        nested.overall_status ??
        nested.status ??
        nested.risk,
    ),
    findings,
  };
}
