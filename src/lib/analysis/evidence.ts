/**
 * Structure free-form finding evidence for UI display (Stage 2.6).
 * Backward compatible: works with existing string `evidence` columns.
 */

import type {
  StructuredEvidence,
  StructuredFinding,
} from "@/lib/analysis/types";

const LINE_RANGE =
  /(?:lines?|L)\s*[:#]?\s*(\d{1,6})\s*[-–—:]\s*(\d{1,6})/i;
const SINGLE_LINE = /(?:line|L)\s*[:#]?\s*(\d{1,6})\b/i;

/**
 * Build structured evidence from a finding without requiring schema migration.
 */
export function structureFindingEvidence(
  finding: Pick<
    StructuredFinding,
    "evidence" | "affectedFiles" | "summary" | "title" | "explanation"
  >,
): StructuredEvidence {
  const raw = (finding.evidence ?? "").trim();
  const file =
    finding.affectedFiles[0] ??
    extractPath(raw) ??
    null;

  const lines = extractLines(raw);
  const observed = truncate(
    stripRedundantPrefix(raw) || finding.summary || "See finding explanation.",
    420,
  );
  const supports = truncate(
    finding.summary || finding.title || "Supports this finding.",
    200,
  );

  return {
    file,
    lines,
    observedChange: observed,
    supportsFinding: supports,
    raw: raw || null,
  };
}

function extractPath(text: string): string | null {
  // Common path-like tokens
  const match = text.match(
    /(?:^|[\s`"'(])((?:src|app|lib|components|supabase|docs|scripts)\/[\w./@+-]+\.[\w]+)(?:$|[\s`"'),])/,
  );
  return match?.[1] ?? null;
}

function extractLines(text: string): string | null {
  const range = text.match(LINE_RANGE);
  if (range) return `${range[1]}–${range[2]}`;
  const single = text.match(SINGLE_LINE);
  if (single) return String(single[1]);
  return null;
}

function stripRedundantPrefix(text: string): string {
  return text
    .replace(/^(evidence|observed|change)\s*[:\-–—]\s*/i, "")
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** True when evidence is long enough that the UI should collapse it. */
export function evidenceNeedsCollapse(evidence: StructuredEvidence): boolean {
  const rawLen = evidence.raw?.length ?? 0;
  return rawLen > 320 || evidence.observedChange.length > 280;
}
