/**
 * Impact Graph engine — structural dependency neighborhood of a pull request.
 *
 * Pure and deterministic (no I/O). Produces the data behind the interactive
 * Impact Graph: which scanned modules import (directly or transitively, up to
 * IMPACT_GRAPH_MAX_DEPTH hops) the files changed by a PR.
 *
 * Semantics:
 * - An import edge is a structural dependency. It does NOT prove that a
 *   dependent is broken or behaviorally affected ("potentially affected").
 * - This module never reads, computes, or modifies risk scores.
 * - Coverage is bounded by the repository scan (see fetch-sources.ts) and the
 *   regex-based static import parser (see parse-imports.ts).
 */

import {
  classifyModuleArea,
  extractImportSpecifiers,
  isResolvableSpecifier,
  isRouteLikePath,
  isSourceCodePath,
  normalizePath,
  resolveImportBase,
  resolveToExistingFile,
} from "@/lib/analysis/impact/parse-imports";
import type {
  ChangeStatus,
  ChangedFileEvidence,
  FileCategory,
} from "@/lib/analysis/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const IMPACT_GRAPH_VERSION = 1 as const;
/** Matches the depth cap used by collectDependents() in import-graph.ts. */
export const IMPACT_GRAPH_MAX_DEPTH = 3;
export const IMPACT_GRAPH_DEFAULT_MAX_EDGES = 1000;

export const IMPACT_PATH_DEFAULTS = {
  maxPathsPerOrigin: 3,
  maxTotalPaths: 12,
  maxExpandedStatesPerOrigin: 64,
} as const;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export type ImpactDepth = 1 | 2 | 3;

export type ImpactNodeCategory =
  | "changed"
  | "direct_dependent"
  | "indirect_dependent";

/**
 * Whether this node's own outgoing imports could be analyzed.
 * An isolated changed file is `analyzed` with no edges; the other statuses
 * mean the file could not be (fully) analyzed.
 */
export type ImpactNodeAnalysisStatus =
  | "analyzed"
  | "deleted_source"
  | "non_source"
  | "unscanned_source"
  | "parse_failed";

export type ImpactEdgeRole =
  | "primary"
  | "multi_origin"
  | "changed_to_changed"
  | "secondary";

export type ImpactEdgeResolutionKind = "direct_path" | "renamed_previous_path";

export interface ImpactGraphNode {
  id: string;
  path: string;
  /** Normalized previous path for renamed changed files, else null. */
  previousPath: string | null;
  label: string;
  directory: string;
  category: ImpactNodeCategory;
  analysisStatus: ImpactNodeAnalysisStatus;
  /** 0 for changed files; global minimum hop distance for dependents. */
  depth: 0 | ImpactDepth;
  /** Shortest hop distance from each reaching changed file (never self). */
  depthByOrigin: Record<string, ImpactDepth>;
  area: string;
  fileCategory?: FileCategory;
  isRoute: boolean;
  changeType?: ChangeStatus;
  additions?: number;
  deletions?: number;
  /** Sorted changed files that reach this node within the depth cap. */
  originChangedFiles: string[];
  /** Origins with no complete retained shortest path to this node. */
  missingOrigins: string[];
  provenanceComplete: boolean;
  /**
   * Unresolved local/alias specifiers (./, ../, @/) when analysisStatus is
   * "analyzed"; null when outgoing imports could not be analyzed.
   */
  unresolvedImportCount: number | null;
  cycleGroupId: string | null;
  /** null when not in a cycle; true iff every edge of its SCC is retained. */
  cycleComplete: boolean | null;
  omittedIncomingEdgeCount: number;
  omittedOutgoingEdgeCount: number;
}

export interface ImpactGraphEdge {
  /** `${from}->${to}` */
  id: string;
  /** Imported module (upstream, toward the change). */
  from: string;
  /** Importing module (downstream dependent). */
  to: string;
  structuralRole: ImpactEdgeRole;
  resolutionKind: ImpactEdgeResolutionKind;
  /** Origins c where dist(c, from) + 1 === dist(c, to) <= max depth. */
  shortestForOrigins: string[];
  /** min dist(c, to) over shortestForOrigins; null when empty. */
  minOriginHop: ImpactDepth | null;
  /** depth(to) < depth(from). Visual tier comparison only — not a cycle. */
  isBackTierEdge: boolean;
  isSameTierEdge: boolean;
  /** from and to belong to the same non-trivial SCC of the eligible graph. */
  isCycleEdge: boolean;
  cycleGroupId: string | null;
}

export interface ImpactCycleGroup {
  id: string;
  nodeIds: string[];
  totalEdgeCount: number;
  retainedEdgeCount: number;
  omittedEdgeCount: number;
  isComplete: boolean;
  /** Retained intra-group edges still form one SCC over nodeIds. */
  remainsStronglyConnected: boolean;
}

export interface ImpactGraphMetadata {
  maxDepth: number;
  maxEdges: number;
  scannedFileCount: number;
  /** Eligible source blobs in the repo tree when known, else null. */
  treeFileCount: number | null;
  changedFileCount: number;
  changedSourceNodeCount: number;
  unmappedChangedFiles: string[];
  directDependentNodeCount: number;
  indirectDependentNodeCount: number;
  eligibleEdgeCount: number;
  cycleGroupCount: number;
  cyclesTruncated: boolean;
  cycleGroups: ImpactCycleGroup[];
  /** Explicit flag supplied by the source fetcher (never inferred). */
  truncatedFileScan: boolean;
  fetchErrorCount: number;
  edgesTruncated: boolean;
  omittedEdgesTotal: number;
  provenanceTruncated: boolean;
}

export interface ImpactGraphData {
  version: typeof IMPACT_GRAPH_VERSION;
  nodes: ImpactGraphNode[];
  edges: ImpactGraphEdge[];
  metadata: ImpactGraphMetadata;
}

export interface ImpactPathRecord {
  origin: string;
  /** [origin, ..., target] */
  nodes: string[];
  /** Retained edge IDs along the path, in order. */
  edgeIds: string[];
  hopCount: ImpactDepth;
  /** hopCount === target.depthByOrigin[origin] */
  isOriginShortest: boolean;
  containsCycleEdge: boolean;
}

export interface ImpactPathReconstructionOptions {
  maxPathsPerOrigin?: number;
  /** Enforced across all origins. */
  maxTotalPaths?: number;
  maxExpandedStatesPerOrigin?: number;
}

export interface ImpactPathReconstructionResult {
  nodeId: string;
  paths: ImpactPathRecord[];
  provenanceComplete: boolean;
  missingOrigins: string[];
  omittedIncomingEdgeCount: number;
  /** Additional origins or valid paths were skipped because of a limit. */
  pathsTruncatedByLimit: boolean;
  /**
   * Conservative, global completeness indicator. True only when the node's
   * provenance is complete, no limit truncated enumeration, none of its
   * incoming edges were omitted, AND the graph as a whole had no edge
   * truncation (`metadata.edgesTruncated === false`). It can therefore be
   * false even when truncation elsewhere did not affect this node.
   */
  isExhaustive: boolean;
}

// ---------------------------------------------------------------------------
// Import index (with deleted / renamed / unresolved semantics)
// ---------------------------------------------------------------------------

export interface ImpactImportIndex {
  /** imported target → importers */
  reverse: Map<string, Set<string>>;
  /** `${from}->${to}` → how the importer's specifier resolved */
  edgeResolution: Map<string, ImpactEdgeResolutionKind>;
  /** importer → count of unresolved local/alias specifiers (parsed files only) */
  unresolvedByImporter: Map<string, number>;
  parseFailed: Set<string>;
  scannedSourcePaths: Set<string>;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const edgeKey = (from: string, to: string): string => `${from}->${to}`;

/**
 * Parse every scanned source file and resolve local/alias imports against:
 * scanned files, PR-changed source paths (so imports of deleted or unscanned
 * changed files still resolve), and previous paths of renamed files.
 */
export function buildImpactImportIndex(
  files: Map<string, string>,
  changedFiles: ChangedFileEvidence[] = [],
): ImpactImportIndex {
  const normalizedFiles = new Map<string, string>();
  for (const [raw, source] of files) {
    const p = normalizePath(raw);
    if (!isSourceCodePath(p)) continue;
    normalizedFiles.set(p, source);
  }
  const scannedSourcePaths = new Set<string>(normalizedFiles.keys());
  const sortedEntries = [...normalizedFiles.entries()].sort((a, b) => cmp(a[0], b[0]));

  const changedSourcePaths = new Set<string>();
  const renamedFrom = new Map<string, string>();
  for (const f of changedFiles) {
    const p = normalizePath(f.path);
    if (isSourceCodePath(p)) changedSourcePaths.add(p);
  }
  for (const f of changedFiles) {
    if (f.status !== "renamed" || !f.previousPath) continue;
    const current = normalizePath(f.path);
    const prev = normalizePath(f.previousPath);
    if (prev === current || !isSourceCodePath(prev)) continue;
    // A different file now living at the old path wins.
    if (scannedSourcePaths.has(prev) || changedSourcePaths.has(prev)) continue;
    if (!isSourceCodePath(current)) continue;
    renamedFrom.set(prev, current);
  }

  const resolvable = new Set<string>([
    ...scannedSourcePaths,
    ...changedSourcePaths,
    ...renamedFrom.keys(),
  ]);

  const reverse = new Map<string, Set<string>>();
  const edgeResolution = new Map<string, ImpactEdgeResolutionKind>();
  const unresolvedByImporter = new Map<string, number>();
  const parseFailed = new Set<string>();

  for (const [importer, source] of sortedEntries) {
    let specs: string[];
    try {
      specs = extractImportSpecifiers(source);
    } catch {
      parseFailed.add(importer);
      continue;
    }
    let unresolved = 0;
    for (const spec of specs) {
      if (!isResolvableSpecifier(spec)) continue;
      const base = resolveImportBase(importer, spec);
      const matched = base ? resolveToExistingFile(base, resolvable) : null;
      if (!matched) {
        unresolved += 1;
        continue;
      }
      let target = matched;
      let kind: ImpactEdgeResolutionKind = "direct_path";
      const renamedTo = renamedFrom.get(matched);
      if (renamedTo) {
        target = renamedTo;
        kind = "renamed_previous_path";
      }
      if (target === importer) continue;
      let importers = reverse.get(target);
      if (!importers) {
        importers = new Set();
        reverse.set(target, importers);
      }
      importers.add(importer);
      const key = edgeKey(target, importer);
      if (kind === "direct_path" || !edgeResolution.has(key)) {
        edgeResolution.set(key, kind);
      }
    }
    unresolvedByImporter.set(importer, unresolved);
  }

  return {
    reverse,
    edgeResolution,
    unresolvedByImporter,
    parseFailed,
    scannedSourcePaths,
  };
}

// ---------------------------------------------------------------------------
// Strongly connected components (iterative Tarjan)
// ---------------------------------------------------------------------------

export function stronglyConnectedComponents(
  nodes: string[],
  adjacency: Map<string, string[]>,
): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  const open = (n: string) => {
    index.set(n, counter);
    low.set(n, counter);
    counter += 1;
    stack.push(n);
    onStack.add(n);
  };

  for (const root of nodes) {
    if (index.has(root)) continue;
    open(root);
    const work: Array<{ node: string; next: number }> = [{ node: root, next: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const successors = adjacency.get(frame.node) ?? [];
      if (frame.next < successors.length) {
        const w = successors[frame.next];
        frame.next += 1;
        if (!index.has(w)) {
          open(w);
          work.push({ node: w, next: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(w)!));
        }
        continue;
      }
      work.pop();
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== frame.node);
        components.push(component.sort(cmp));
      }
      if (work.length > 0) {
        const parent = work[work.length - 1].node;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.node)!));
      }
    }
  }
  return components;
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

export interface BuildImpactGraphInput {
  /** Scanned repository sources at the analyzed head SHA (path → text). */
  files: Map<string, string>;
  changedFiles: ChangedFileEvidence[];
  /** Optional pre-built import index to avoid parsing `files` twice. */
  importIndex?: ImpactImportIndex;
  /** Explicit scan truncation flag from the fetcher. */
  scanTruncated?: boolean;
  fetchErrorCount?: number;
  treeFileCount?: number | null;
  maxEdges?: number;
}

interface EdgeDraft {
  id: string;
  from: string;
  to: string;
  resolutionKind: ImpactEdgeResolutionKind;
  shortestForOrigins: string[];
  minOriginHop: ImpactDepth | null;
  structuralRole: ImpactEdgeRole;
  isBackTierEdge: boolean;
  isSameTierEdge: boolean;
  isCycleEdge: boolean;
  cycleGroupId: string | null;
}

const ROLE_PRIORITY: Record<ImpactEdgeRole, number> = {
  primary: 0,
  multi_origin: 1,
  changed_to_changed: 2,
  secondary: 3,
};

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : "";
}

export function buildImpactGraphData(input: BuildImpactGraphInput): ImpactGraphData {
  const maxDepth = IMPACT_GRAPH_MAX_DEPTH;
  const maxEdges = Math.max(0, Math.floor(input.maxEdges ?? IMPACT_GRAPH_DEFAULT_MAX_EDGES));
  const index =
    input.importIndex ?? buildImpactImportIndex(input.files, input.changedFiles);

  // --- Stage A1: materialize every PR-changed file -------------------------
  const changedById = new Map<string, ChangedFileEvidence>();
  for (const f of input.changedFiles) {
    const id = normalizePath(f.path);
    if (!changedById.has(id)) changedById.set(id, f);
  }
  const changedIds = [...changedById.keys()].sort(cmp);
  const changedSet = new Set(changedIds);

  const statusOfChanged = (id: string, f: ChangedFileEvidence): ImpactNodeAnalysisStatus => {
    if (!isSourceCodePath(id)) return "non_source";
    if (f.status === "removed") return "deleted_source";
    if (index.parseFailed.has(id)) return "parse_failed";
    if (!index.scannedSourcePaths.has(id)) return "unscanned_source";
    return "analyzed";
  };

  // Origins: changed source paths (including deleted/unscanned — they can
  // still have resolved incoming imports).
  const origins = changedIds.filter((id) => isSourceCodePath(id));

  // --- Stage A2: per-origin bounded BFS (node discovery only) --------------
  const sortedImporters = new Map<string, string[]>();
  const importersOf = (target: string): string[] => {
    let list = sortedImporters.get(target);
    if (!list) {
      list = [...(index.reverse.get(target) ?? [])].sort(cmp);
      sortedImporters.set(target, list);
    }
    return list;
  };

  const distByOrigin = new Map<string, Map<string, number>>();
  for (const origin of origins) {
    const dist = new Map<string, number>([[origin, 0]]);
    let frontier = [origin];
    for (let d = 1; d <= maxDepth && frontier.length > 0; d += 1) {
      const next: string[] = [];
      for (const u of frontier) {
        for (const v of importersOf(u)) {
          if (dist.has(v)) continue;
          dist.set(v, d);
          next.push(v);
        }
      }
      frontier = next;
    }
    distByOrigin.set(origin, dist);
  }

  const dist = (origin: string, node: string): number =>
    distByOrigin.get(origin)?.get(node) ?? Number.POSITIVE_INFINITY;

  const depthByOriginOf = new Map<string, Record<string, ImpactDepth>>();
  for (const origin of origins) {
    for (const [node, d] of distByOrigin.get(origin)!) {
      if (node === origin || d < 1) continue;
      let rec = depthByOriginOf.get(node);
      if (!rec) {
        rec = {};
        depthByOriginOf.set(node, rec);
      }
      rec[origin] = d as ImpactDepth;
    }
  }

  const nodeIds = new Set<string>(changedIds);
  for (const node of depthByOriginOf.keys()) nodeIds.add(node);

  const depthOf = new Map<string, 0 | ImpactDepth>();
  for (const id of nodeIds) {
    if (changedSet.has(id)) {
      depthOf.set(id, 0);
    } else {
      const values = Object.values(depthByOriginOf.get(id) ?? {});
      depthOf.set(id, Math.min(...values) as ImpactDepth);
    }
  }
  const depth = (id: string): number => depthOf.get(id) ?? Number.POSITIVE_INFINITY;

  const originsOf = (id: string): string[] =>
    Object.keys(depthByOriginOf.get(id) ?? {}).sort(cmp);

  // --- Stage B: complete induced subgraph on discovered nodes --------------
  const sortedNodeIds = [...nodeIds].sort(cmp);
  const eligible: EdgeDraft[] = [];
  for (const u of sortedNodeIds) {
    for (const v of importersOf(u)) {
      if (v === u || !nodeIds.has(v)) continue;
      eligible.push({
        id: edgeKey(u, v),
        from: u,
        to: v,
        resolutionKind: index.edgeResolution.get(edgeKey(u, v)) ?? "direct_path",
        shortestForOrigins: [],
        minOriginHop: null,
        structuralRole: "secondary",
        isBackTierEdge: false,
        isSameTierEdge: false,
        isCycleEdge: false,
        cycleGroupId: null,
      });
    }
  }

  // --- Stage C: SCC detection on the complete eligible graph ---------------
  const adjacency = new Map<string, string[]>();
  for (const e of eligible) {
    const list = adjacency.get(e.from);
    if (list) list.push(e.to);
    else adjacency.set(e.from, [e.to]);
  }
  const nonTrivial = stronglyConnectedComponents(sortedNodeIds, adjacency)
    .filter((c) => c.length >= 2)
    .sort((a, b) => cmp(a[0], b[0]));
  const cycleGroupOf = new Map<string, string>();
  nonTrivial.forEach((component, i) => {
    for (const id of component) cycleGroupOf.set(id, `cycle-${i + 1}`);
  });

  // --- Stage D: per-origin edge classification -----------------------------
  for (const e of eligible) {
    const candidates = new Set<string>(originsOf(e.from));
    if (distByOrigin.has(e.from)) candidates.add(e.from);
    const sfo: string[] = [];
    let minHop = Number.POSITIVE_INFINITY;
    let achievesDepth = false;
    for (const c of [...candidates].sort(cmp)) {
      const du = dist(c, e.from);
      const dv = dist(c, e.to);
      if (du + 1 === dv && dv <= maxDepth) {
        sfo.push(c);
        minHop = Math.min(minHop, dv);
        if (dv === depth(e.to)) achievesDepth = true;
      }
    }
    e.shortestForOrigins = sfo;
    e.minOriginHop = sfo.length > 0 ? (minHop as ImpactDepth) : null;
    const bothChanged = depth(e.from) === 0 && depth(e.to) === 0;
    e.structuralRole = bothChanged
      ? "changed_to_changed"
      : achievesDepth
        ? "primary"
        : sfo.length > 0
          ? "multi_origin"
          : "secondary";
    e.isBackTierEdge = depth(e.to) < depth(e.from);
    e.isSameTierEdge = depth(e.to) === depth(e.from);
    const gu = cycleGroupOf.get(e.from) ?? null;
    const gv = cycleGroupOf.get(e.to) ?? null;
    e.isCycleEdge = gu !== null && gu === gv;
    e.cycleGroupId = e.isCycleEdge ? gu : null;
  }

  // --- Retention -----------------------------------------------------------
  const incomingEligible = new Map<string, EdgeDraft[]>();
  for (const e of eligible) {
    const list = incomingEligible.get(e.to);
    if (list) list.push(e);
    else incomingEligible.set(e.to, [e]);
  }
  for (const list of incomingEligible.values()) list.sort((a, b) => cmp(a.from, b.from));
  const incoming = (id: string): EdgeDraft[] => incomingEligible.get(id) ?? [];

  const retained = new Map<string, EdgeDraft>();

  if (eligible.length <= maxEdges) {
    for (const e of eligible) retained.set(e.id, e);
  } else {
    const completeForOrigin = new Map<string, Set<string>>();
    for (const origin of origins) completeForOrigin.set(origin, new Set([origin]));
    const isComplete = (c: string, node: string): boolean =>
      completeForOrigin.get(c)?.has(node) ?? false;

    /**
     * Retain `e` if possible. Completeness propagates to `e.to` only for
     * origins in e.shortestForOrigins whose upstream `e.from` is already
     * complete — and only if the edge is actually retained.
     */
    const retainAndPropagate = (e: EdgeDraft): boolean => {
      if (!retained.has(e.id)) {
        if (retained.size >= maxEdges) return false;
        retained.set(e.id, e);
      }
      for (const c of e.shortestForOrigins) {
        if (isComplete(c, e.from)) completeForOrigin.get(c)!.add(e.to);
      }
      return true;
    };

    // Phase 1 — one global-minimum-depth witness per dependent.
    for (let d = 1; d <= maxDepth; d += 1) {
      for (const v of sortedNodeIds) {
        if (changedSet.has(v) || depth(v) !== d) continue;
        const candidates = incoming(v).filter((e) =>
          e.shortestForOrigins.some((c) => dist(c, v) === d && isComplete(c, e.from)),
        );
        if (candidates.length === 0) continue;
        const pick =
          candidates.find((e) => retained.has(e.id)) ?? candidates[0];
        retainAndPropagate(pick);
      }
    }

    // Phase 2 — per-origin witnesses, in increasing distance order.
    for (let d = 1; d <= maxDepth; d += 1) {
      for (const v of sortedNodeIds) {
        for (const c of originsOf(v)) {
          if (dist(c, v) !== d || isComplete(c, v)) continue;
          const witnesses = incoming(v).filter(
            (e) => e.shortestForOrigins.includes(c) && isComplete(c, e.from),
          );
          if (witnesses.length === 0) continue;
          const already = witnesses.find((e) => retained.has(e.id));
          if (already) {
            retainAndPropagate(already);
            continue;
          }
          if (retained.size >= maxEdges) continue;
          retainAndPropagate(witnesses[0]);
        }
      }
    }

    // Phase 3 — cycle edges.
    for (const component of nonTrivial) {
      const groupId = cycleGroupOf.get(component[0]);
      for (const e of eligible) {
        if (retained.size >= maxEdges) break;
        if (e.cycleGroupId === groupId && !retained.has(e.id)) retained.set(e.id, e);
      }
    }

    // Phase 4 — remaining budget by role priority.
    const rest = eligible
      .filter((e) => !retained.has(e.id))
      .sort(
        (a, b) =>
          ROLE_PRIORITY[a.structuralRole] - ROLE_PRIORITY[b.structuralRole] ||
          (a.minOriginHop ?? 99) - (b.minOriginHop ?? 99) ||
          cmp(a.id, b.id),
      );
    for (const e of rest) {
      if (retained.size >= maxEdges) break;
      retained.set(e.id, e);
    }
  }

  // --- Stage E: ground-truth provenance + cycle completeness ---------------
  const retainedIncoming = new Map<string, EdgeDraft[]>();
  for (const e of retained.values()) {
    const list = retainedIncoming.get(e.to);
    if (list) list.push(e);
    else retainedIncoming.set(e.to, [e]);
  }

  const completeTruth = new Map<string, Set<string>>();
  for (const origin of origins) {
    const complete = new Set<string>([origin]);
    for (let d = 1; d <= maxDepth; d += 1) {
      for (const v of sortedNodeIds) {
        if (dist(origin, v) !== d) continue;
        const ok = (retainedIncoming.get(v) ?? []).some(
          (e) => dist(origin, e.from) === d - 1 && complete.has(e.from),
        );
        if (ok) complete.add(v);
      }
    }
    completeTruth.set(origin, complete);
  }

  const omittedIn = new Map<string, number>();
  const omittedOut = new Map<string, number>();
  for (const e of eligible) {
    if (retained.has(e.id)) continue;
    omittedIn.set(e.to, (omittedIn.get(e.to) ?? 0) + 1);
    omittedOut.set(e.from, (omittedOut.get(e.from) ?? 0) + 1);
  }

  const cycleGroups: ImpactCycleGroup[] = nonTrivial.map((component) => {
    const id = cycleGroupOf.get(component[0])!;
    const intra = eligible.filter((e) => e.cycleGroupId === id);
    const kept = intra.filter((e) => retained.has(e.id));
    const keptAdjacency = new Map<string, string[]>();
    for (const e of kept) {
      const list = keptAdjacency.get(e.from);
      if (list) list.push(e.to);
      else keptAdjacency.set(e.from, [e.to]);
    }
    const keptComponents = stronglyConnectedComponents(component, keptAdjacency);
    return {
      id,
      nodeIds: [...component],
      totalEdgeCount: intra.length,
      retainedEdgeCount: kept.length,
      omittedEdgeCount: intra.length - kept.length,
      isComplete: kept.length === intra.length,
      remainsStronglyConnected:
        keptComponents.length === 1 && keptComponents[0].length === component.length,
    };
  });
  const cycleGroupById = new Map(cycleGroups.map((g) => [g.id, g]));

  // --- Node assembly -------------------------------------------------------
  const nodes: ImpactGraphNode[] = sortedNodeIds.map((id) => {
    const changed = changedById.get(id);
    const analysisStatus: ImpactNodeAnalysisStatus = changed
      ? statusOfChanged(id, changed)
      : index.parseFailed.has(id)
        ? "parse_failed"
        : "analyzed";
    const nodeDepth = depthOf.get(id)!;
    const originList = originsOf(id);
    const missingOrigins = originList.filter(
      (c) => !(completeTruth.get(c)?.has(id) ?? false),
    );
    const cycleGroupId = cycleGroupOf.get(id) ?? null;
    const node: ImpactGraphNode = {
      id,
      path: id,
      previousPath:
        changed && changed.status === "renamed" && changed.previousPath
          ? normalizePath(changed.previousPath)
          : null,
      label: basename(id),
      directory: dirname(id),
      category: changed
        ? "changed"
        : nodeDepth === 1
          ? "direct_dependent"
          : "indirect_dependent",
      analysisStatus,
      depth: nodeDepth,
      depthByOrigin: { ...(depthByOriginOf.get(id) ?? {}) },
      area: classifyModuleArea(id),
      isRoute: isRouteLikePath(id),
      originChangedFiles: originList,
      missingOrigins,
      provenanceComplete: missingOrigins.length === 0,
      unresolvedImportCount:
        analysisStatus === "analyzed" ? (index.unresolvedByImporter.get(id) ?? 0) : null,
      cycleGroupId,
      cycleComplete: cycleGroupId ? cycleGroupById.get(cycleGroupId)!.isComplete : null,
      omittedIncomingEdgeCount: omittedIn.get(id) ?? 0,
      omittedOutgoingEdgeCount: omittedOut.get(id) ?? 0,
    };
    if (changed) {
      node.fileCategory = changed.category;
      node.changeType = changed.status;
      node.additions = changed.additions;
      node.deletions = changed.deletions;
    }
    return node;
  });

  nodes.sort((a, b) => a.depth - b.depth || cmp(a.id, b.id));

  const edges: ImpactGraphEdge[] = [...retained.values()]
    .sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to))
    .map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      structuralRole: e.structuralRole,
      resolutionKind: e.resolutionKind,
      shortestForOrigins: [...e.shortestForOrigins],
      minOriginHop: e.minOriginHop,
      isBackTierEdge: e.isBackTierEdge,
      isSameTierEdge: e.isSameTierEdge,
      isCycleEdge: e.isCycleEdge,
      cycleGroupId: e.cycleGroupId,
    }));

  const changedNodes = nodes.filter((n) => n.category === "changed");

  return {
    version: IMPACT_GRAPH_VERSION,
    nodes,
    edges,
    metadata: {
      maxDepth,
      maxEdges,
      scannedFileCount: index.scannedSourcePaths.size,
      treeFileCount: input.treeFileCount ?? null,
      changedFileCount: changedIds.length,
      changedSourceNodeCount: changedNodes.filter((n) => isSourceCodePath(n.id)).length,
      unmappedChangedFiles: changedNodes
        .filter((n) => n.analysisStatus !== "analyzed")
        .map((n) => n.id)
        .sort(cmp),
      directDependentNodeCount: nodes.filter((n) => n.category === "direct_dependent").length,
      indirectDependentNodeCount: nodes.filter((n) => n.category === "indirect_dependent").length,
      eligibleEdgeCount: eligible.length,
      cycleGroupCount: cycleGroups.length,
      cyclesTruncated: cycleGroups.some((g) => !g.isComplete),
      cycleGroups,
      truncatedFileScan: input.scanTruncated === true,
      fetchErrorCount: input.fetchErrorCount ?? 0,
      edgesTruncated: eligible.length > retained.size,
      omittedEdgesTotal: eligible.length - retained.size,
      provenanceTruncated: nodes.some((n) => !n.provenanceComplete),
    },
  };
}

// ---------------------------------------------------------------------------
// On-demand path reconstruction (never persisted)
// ---------------------------------------------------------------------------

/**
 * Reconstruct a bounded, deterministic set of dependency paths from changed
 * origins to `targetNodeId` using only the retained graph edges.
 *
 * - Pass A: origin-shortest paths (every step on a per-origin shortest path).
 * - Pass B: alternative non-shortest simple paths of at most metadata.maxDepth hops.
 * - Cycles: Pass A strictly decreases distance; Pass B keeps a per-path
 *   visited set. Work is capped by maxExpandedStatesPerOrigin.
 * - maxTotalPaths applies across all origins; reaching any limit while
 *   origins or valid paths remain sets pathsTruncatedByLimit.
 *
 * Returns an empty ImpactPathReconstructionResult when the node is not in the graph.
 */
export function reconstructNodePaths(
  graph: ImpactGraphData,
  targetNodeId: string,
  options: ImpactPathReconstructionOptions = {},
): ImpactPathReconstructionResult {
  const maxPathsPerOrigin = Math.max(
    1,
    Math.floor(options.maxPathsPerOrigin ?? IMPACT_PATH_DEFAULTS.maxPathsPerOrigin),
  );
  const maxTotalPaths = Math.max(
    1,
    Math.floor(options.maxTotalPaths ?? IMPACT_PATH_DEFAULTS.maxTotalPaths),
  );
  const maxStates = Math.max(
    1,
    Math.floor(
      options.maxExpandedStatesPerOrigin ?? IMPACT_PATH_DEFAULTS.maxExpandedStatesPerOrigin,
    ),
  );

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const target = nodeMap.get(targetNodeId);
  if (!target) {
    return {
      nodeId: targetNodeId,
      paths: [],
      provenanceComplete: true,
      missingOrigins: [],
      omittedIncomingEdgeCount: 0,
      pathsTruncatedByLimit: false,
      isExhaustive: !graph.metadata.edgesTruncated,
    };
  }

  const incomingByTo = new Map<string, ImpactGraphEdge[]>();
  for (const e of graph.edges) {
    const list = incomingByTo.get(e.to);
    if (list) list.push(e);
    else incomingByTo.set(e.to, [e]);
  }
  for (const list of incomingByTo.values()) list.sort((a, b) => cmp(a.from, b.from));
  const incoming = (id: string): ImpactGraphEdge[] => incomingByTo.get(id) ?? [];
  const cycleEdgeIds = new Set(graph.edges.filter((e) => e.isCycleEdge).map((e) => e.id));

  const maxDepth = graph.metadata.maxDepth;
  const getDist = (origin: string, node: string): number =>
    node === origin
      ? 0
      : (nodeMap.get(node)?.depthByOrigin[origin] ?? Number.POSITIVE_INFINITY);

  const origins = [...target.originChangedFiles].sort(
    (a, b) => target.depthByOrigin[a] - target.depthByOrigin[b] || cmp(a, b),
  );

  const paths: ImpactPathRecord[] = [];
  let truncated = false;

  for (const origin of origins) {
    const targetDist = target.depthByOrigin[origin];
    const seen = new Set<string>();
    let originCount = 0;
    let states = 0;
    let stop = false;

    const shortestReachableMemo = new Map<string, boolean>();
    const hasShortestPathToOrigin = (node: string, rem: number): boolean => {
      if (node === origin) return rem === 0;
      if (rem <= 0) return false;
      const key = `${node}:${rem}`;
      const cached = shortestReachableMemo.get(key);
      if (cached !== undefined) return cached;
      const ok = incoming(node).some(
        (e) =>
          e.shortestForOrigins.includes(origin) &&
          getDist(origin, e.from) === rem - 1 &&
          hasShortestPathToOrigin(e.from, rem - 1),
      );
      shortestReachableMemo.set(key, ok);
      return ok;
    };

    const canCompleteShortestEdge = (
      e: ImpactGraphEdge,
      rem: number,
      sufNodes: string[],
    ): boolean => {
      if (!e.shortestForOrigins.includes(origin)) return false;
      if (getDist(origin, e.from) !== rem - 1) return false;
      if (e.from === origin) {
        return rem === 1 && !seen.has([origin, ...sufNodes].join("\u0000"));
      }
      return rem > 1 && hasShortestPathToOrigin(e.from, rem - 1);
    };

    const canCompleteSimpleEdge = (
      e: ImpactGraphEdge,
      currDist: number,
      rem: number,
      visited: Set<string>,
      hasDetour: boolean,
      sufNodes: string[],
    ): boolean => {
      const prev = e.from;
      if (visited.has(prev)) return false;
      const prevDist = getDist(origin, prev);
      if (prevDist > rem - 1) return false;
      const edgeIsDetour =
        !e.shortestForOrigins.includes(origin) || prevDist !== currDist - 1;
      const nextHasDetour = hasDetour || edgeIsDetour;
      const nextNodes = [prev, ...sufNodes];
      if (prev === origin) {
        return (
          nextHasDetour &&
          nextNodes.length - 1 !== targetDist &&
          !seen.has(nextNodes.join("\u0000"))
        );
      }
      if (rem - 1 <= 0) return false;
      if (!nextHasDetour && rem - 1 <= prevDist) return false;
      visited.add(prev);
      let ok = false;
      for (const nextEdge of incoming(prev)) {
        if (
          canCompleteSimpleEdge(
            nextEdge,
            prevDist,
            rem - 1,
            visited,
            nextHasDetour,
            nextNodes,
          )
        ) {
          ok = true;
          break;
        }
      }
      visited.delete(prev);
      return ok;
    };

    const emit = (nodes: string[], edgeIds: string[]) => {
      const key = nodes.join("\u0000");
      if (seen.has(key)) return;
      if (originCount >= maxPathsPerOrigin || paths.length >= maxTotalPaths) {
        truncated = true; // another valid path exists beyond a limit
        stop = true;
        return;
      }
      seen.add(key);
      originCount += 1;
      paths.push({
        origin,
        nodes,
        edgeIds,
        hopCount: (nodes.length - 1) as ImpactDepth,
        isOriginShortest: nodes.length - 1 === targetDist,
        containsCycleEdge: edgeIds.some((id) => cycleEdgeIds.has(id)),
      });
    };

    const expand = (): boolean => {
      states += 1;
      if (states > maxStates) {
        truncated = true;
        stop = true;
        return false;
      }
      return true;
    };

    // Pass A — origin-shortest paths (exact length === targetDist).
    const walkShortest = (curr: string, rem: number, sufNodes: string[], sufEdges: string[]) => {
      if (stop) return;
      const candidates = incoming(curr).filter((e) =>
        canCompleteShortestEdge(e, rem, sufNodes),
      );
      if (candidates.length === 0) return;
      if (originCount >= maxPathsPerOrigin || paths.length >= maxTotalPaths) {
        truncated = true;
        stop = true;
        return;
      }
      if (!expand()) return;

      for (const e of candidates) {
        if (stop) return;
        const nodes = [e.from, ...sufNodes];
        const edgeIds = [e.id, ...sufEdges];
        if (e.from === origin) {
          emit(nodes, edgeIds);
          continue;
        }
        if (rem - 1 > 0) walkShortest(e.from, rem - 1, nodes, edgeIds);
      }
    };

    // Pass B — bounded alternative (non-shortest) simple paths of length in (targetDist, maxDepth].
    const walkSimple = (
      curr: string,
      rem: number,
      visited: Set<string>,
      hasDetour: boolean,
      sufNodes: string[],
      sufEdges: string[],
    ) => {
      if (stop) return;
      const currDist = getDist(origin, curr);
      const candidates: Array<{ edge: ImpactGraphEdge; nextHasDetour: boolean }> = [];
      for (const e of incoming(curr)) {
        if (!canCompleteSimpleEdge(e, currDist, rem, visited, hasDetour, sufNodes)) {
          continue;
        }
        const prevDist = getDist(origin, e.from);
        const edgeIsDetour =
          !e.shortestForOrigins.includes(origin) || prevDist !== currDist - 1;
        candidates.push({ edge: e, nextHasDetour: hasDetour || edgeIsDetour });
      }
      if (candidates.length === 0) return;
      if (originCount >= maxPathsPerOrigin || paths.length >= maxTotalPaths) {
        truncated = true;
        stop = true;
        return;
      }
      if (!expand()) return;

      for (const { edge: e, nextHasDetour } of candidates) {
        if (stop) return;
        const prev = e.from;
        const nodes = [prev, ...sufNodes];
        const edgeIds = [e.id, ...sufEdges];
        if (prev === origin) {
          emit(nodes, edgeIds);
          continue;
        }
        visited.add(prev);
        walkSimple(prev, rem - 1, visited, nextHasDetour, nodes, edgeIds);
        visited.delete(prev);
      }
    };

    walkShortest(targetNodeId, targetDist, [targetNodeId], []);
    if (!stop && targetDist < maxDepth) {
      walkSimple(targetNodeId, maxDepth, new Set([targetNodeId]), false, [targetNodeId], []);
    }
  }

  return {
    nodeId: targetNodeId,
    paths,
    provenanceComplete: target.provenanceComplete,
    missingOrigins: [...target.missingOrigins],
    omittedIncomingEdgeCount: target.omittedIncomingEdgeCount,
    pathsTruncatedByLimit: truncated,
    isExhaustive:
      target.provenanceComplete &&
      !truncated &&
      target.omittedIncomingEdgeCount === 0 &&
      !graph.metadata.edgesTruncated,
  };
}
