/**
 * Build reverse import graph (who imports whom) from file texts.
 */

import {
  classifyModuleArea,
  isRouteLikePath,
  normalizePath,
} from "@/lib/analysis/impact/parse-imports";
import {
  IMPACT_GRAPH_DEFAULT_MAX_EDGES,
  IMPACT_GRAPH_MAX_DEPTH,
  IMPACT_GRAPH_VERSION,
  IMPACT_PATH_DEFAULTS,
  buildImpactGraphData,
  buildImpactImportIndex,
  reconstructNodePaths,
  stronglyConnectedComponents,
  type BuildImpactGraphInput,
  type ImpactCycleGroup,
  type ImpactDepth,
  type ImpactEdgeResolutionKind,
  type ImpactEdgeRole,
  type ImpactGraphData,
  type ImpactGraphEdge,
  type ImpactGraphMetadata,
  type ImpactGraphNode,
  type ImpactImportIndex,
  type ImpactNodeAnalysisStatus,
  type ImpactNodeCategory,
  type ImpactPathReconstructionOptions,
  type ImpactPathReconstructionResult,
  type ImpactPathRecord,
} from "@/lib/analysis/impact/impact-graph";
import type { ChangedFileEvidence } from "@/lib/analysis/types";

export {
  classifyModuleArea,
  isRouteLikePath,
  IMPACT_GRAPH_DEFAULT_MAX_EDGES,
  IMPACT_GRAPH_MAX_DEPTH,
  IMPACT_GRAPH_VERSION,
  IMPACT_PATH_DEFAULTS,
  buildImpactGraphData,
  buildImpactImportIndex,
  reconstructNodePaths,
  stronglyConnectedComponents,
  type BuildImpactGraphInput,
  type ImpactCycleGroup,
  type ImpactDepth,
  type ImpactEdgeResolutionKind,
  type ImpactEdgeRole,
  type ImpactGraphData,
  type ImpactGraphEdge,
  type ImpactGraphMetadata,
  type ImpactGraphNode,
  type ImpactImportIndex,
  type ImpactNodeAnalysisStatus,
  type ImpactNodeCategory,
  type ImpactPathReconstructionOptions,
  type ImpactPathReconstructionResult,
  type ImpactPathRecord,
};

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
 * Shares `buildImpactImportIndex` so callers can either pass `files` directly
 * or reuse an already-constructed `importIndex`.
 */
export function buildReverseImportGraph(
  files: Map<string, string>,
  options?: {
    changedFiles?: ChangedFileEvidence[];
    importIndex?: ImpactImportIndex;
  },
): ImportGraphBuildResult {
  const index =
    options?.importIndex ??
    buildImpactImportIndex(files, options?.changedFiles ?? []);

  return {
    reverseGraph: index.reverse,
    scannedPaths: [...index.scannedSourcePaths],
    parsedCount: index.unresolvedByImporter.size,
    failedCount: index.parseFailed.size,
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
