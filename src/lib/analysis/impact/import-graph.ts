/**
 * Build reverse import graph (who imports whom) from file texts.
 */

import {
  extractImportSpecifiers,
  isResolvableSpecifier,
  isSourceCodePath,
  normalizePath,
  resolveImportBase,
  resolveToExistingFile,
} from "@/lib/analysis/impact/parse-imports";

export type ReverseImportGraph = Map<string, Set<string>>;

export interface ImportGraphBuildResult {
  /** target file → set of importers */
  reverseGraph: ReverseImportGraph;
  /** All source paths included in the scan */
  scannedPaths: string[];
  /** Files whose content was successfully parsed */
  parsedCount: number;
  /** Files we intended to scan but failed to fetch/parse */
  failedCount: number;
  /** Truncated because of budget */
  truncated: boolean;
}

/**
 * Build reverse dependency graph from path → source text map.
 */
export function buildReverseImportGraph(
  files: Map<string, string>,
): ImportGraphBuildResult {
  const pathSet = new Set(
    [...files.keys()].map((p) => normalizePath(p)).filter(isSourceCodePath),
  );
  const reverseGraph: ReverseImportGraph = new Map();

  let parsedCount = 0;
  let failedCount = 0;

  for (const [rawPath, source] of files) {
    const importer = normalizePath(rawPath);
    if (!isSourceCodePath(importer)) continue;
    try {
      const specs = extractImportSpecifiers(source);
      parsedCount += 1;
      for (const spec of specs) {
        if (!isResolvableSpecifier(spec)) continue;
        const base = resolveImportBase(importer, spec);
        if (!base) continue;
        const target = resolveToExistingFile(base, pathSet);
        if (!target || target === importer) continue;
        let set = reverseGraph.get(target);
        if (!set) {
          set = new Set();
          reverseGraph.set(target, set);
        }
        set.add(importer);
      }
    } catch {
      failedCount += 1;
    }
  }

  return {
    reverseGraph,
    scannedPaths: [...pathSet],
    parsedCount,
    failedCount,
    truncated: false,
  };
}

export interface DependentSets {
  direct: string[];
  indirect: string[];
  /** direct + indirect unique */
  all: string[];
}

/**
 * Direct + transitive dependents of `filePath`, depth-capped.
 */
export function collectDependents(
  reverseGraph: ReverseImportGraph,
  filePath: string,
  maxDepth = 3,
): DependentSets {
  const key = normalizePath(filePath);
  // Also try without extension variants already in graph keys
  const startKeys = findGraphKeys(reverseGraph, key);
  const direct = new Set<string>();
  for (const k of startKeys) {
    for (const d of reverseGraph.get(k) ?? []) direct.add(d);
  }

  const all = new Set<string>(direct);
  let frontier = [...direct];
  for (let depth = 1; depth < maxDepth; depth += 1) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const dep of reverseGraph.get(node) ?? []) {
        if (all.has(dep) || dep === key) continue;
        // avoid counting the seed as dependent of itself via aliases
        if (startKeys.includes(dep)) continue;
        all.add(dep);
        next.push(dep);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  const indirect = [...all].filter((p) => !direct.has(p));
  return {
    direct: [...direct].sort(),
    indirect: indirect.sort(),
    all: [...all].sort(),
  };
}

function findGraphKeys(graph: ReverseImportGraph, path: string): string[] {
  const n = normalizePath(path);
  if (graph.has(n)) return [n];
  const keys: string[] = [];
  const base = n.replace(/\.(tsx?|jsx?|mjs|cjs)$/i, "");
  for (const k of graph.keys()) {
    const kb = k.replace(/\.(tsx?|jsx?|mjs|cjs)$/i, "");
    if (k === n || kb === base || k.toLowerCase() === n.toLowerCase()) {
      keys.push(k);
    }
  }
  // Also if path not a graph key (never imported as target), return [n]
  return keys.length > 0 ? keys : [n];
}

/** Next.js App Router / Pages convention helpers. */
export function isRouteLikePath(path: string): boolean {
  const p = normalizePath(path);
  return (
    /(^|\/)app\/.*\/(page|layout|route|loading|error|template)\.(tsx?|jsx?)$/i.test(
      p,
    ) ||
    /(^|\/)pages\/.+\.(tsx?|jsx?)$/i.test(p) ||
    /(^|\/)app\/(page|layout|route)\.(tsx?|jsx?)$/i.test(p)
  );
}

export function classifyModuleArea(path: string): string {
  const p = normalizePath(path).toLowerCase();
  if (/(^|\/)(auth|session|oauth|middleware)/.test(p)) return "Authentication";
  if (/(^|\/)(migrations?|prisma|drizzle|supabase|database|sql)/.test(p)) {
    return "Database";
  }
  if (isRouteLikePath(p)) return "Route";
  if (/(^|\/)app\//.test(p) || /(^|\/)pages\//.test(p)) return "App UI";
  if (/(^|\/)components?\//.test(p)) return "UI Components";
  if (/(^|\/)(api|services?|server)\//.test(p)) return "Backend";
  if (/(^|\/)lib\//.test(p)) return "Library";
  if (/(^|\/)hooks?\//.test(p)) return "Hooks";
  return "Module";
}
