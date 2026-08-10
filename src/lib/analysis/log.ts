/**
 * Structured analysis logging (server-only).
 * Never log secrets, tokens, private keys, or full patches.
 */

type LogLevel = "info" | "warn" | "error";

export type AnalysisLogEvent =
  | "analysis_started"
  | "github_fetch_completed"
  | "ai_request_started"
  | "ai_request_completed"
  | "zod_validation"
  | "decision_computed"
  | "final_decision_computed"
  | "impact_analysis_completed"
  | "scope_analysis_completed"
  | "persistence_completed"
  | "analysis_failed"
  | "analysis_completed";

export interface AnalysisLogFields {
  analysisId?: string;
  pullRequestId?: string;
  headSha?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  filesChanged?: number;
  findingsCount?: number;
  ok?: boolean;
  reason?: string;
  [key: string]: string | number | boolean | undefined | null;
}

const SENSITIVE_KEY =
  /(key|secret|token|password|authorization|private|pem|credential)/i;

function sanitizeFields(
  fields: AnalysisLogFields,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (SENSITIVE_KEY.test(k)) continue;
    if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`;
      continue;
    }
    // Never log full SHAs as secrets — short refs are fine; keep short form
    if (k === "headSha" && typeof v === "string") {
      out[k] = v.slice(0, 12);
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function logAnalysis(
  event: AnalysisLogEvent,
  fields: AnalysisLogFields = {},
  level: LogLevel = "info",
): void {
  const payload = {
    scope: "analysis",
    event,
    ts: new Date().toISOString(),
    ...sanitizeFields(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
