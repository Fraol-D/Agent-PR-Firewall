import type { StructuredFinding } from "@/lib/analysis/types";

/**
 * Keep only affected file paths that exist in the analyzed PR change set.
 * Drops hallucinated paths before persistence.
 */
export function filterFindingsAffectedFiles(
  findings: StructuredFinding[],
  analyzedPaths: Set<string>,
): StructuredFinding[] {
  const normalized = new Map<string, string>();
  for (const p of analyzedPaths) {
    normalized.set(normalizePath(p), p);
  }

  return findings.map((finding) => {
    const valid: string[] = [];
    for (const raw of finding.affectedFiles) {
      const key = normalizePath(raw);
      const match = normalized.get(key);
      if (match && !valid.includes(match)) {
        valid.push(match);
      }
    }
    return {
      ...finding,
      affectedFiles: valid,
    };
  });
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").trim().toLowerCase();
}

export function buildAnalyzedPathSet(
  paths: Array<{ path: string; previousPath?: string | null }>,
): Set<string> {
  const set = new Set<string>();
  for (const p of paths) {
    set.add(p.path);
    if (p.previousPath) set.add(p.previousPath);
  }
  return set;
}
