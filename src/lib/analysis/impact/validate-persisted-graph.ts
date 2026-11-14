/**
 * Runtime contract check for an impact graph read back from
 * analyses.context_stats.impact.graph.
 *
 * Returns a version-1 ImpactGraphData, or null when the value is missing,
 * malformed, or a different graph version. Never invents nodes or edges.
 */

import type {
  ChangeStatus,
  FileCategory,
} from "@/lib/analysis/types";
import type {
  ImpactCycleGroup,
  ImpactDepth,
  ImpactEdgeResolutionKind,
  ImpactEdgeRole,
  ImpactGraphData,
  ImpactGraphEdge,
  ImpactGraphMetadata,
  ImpactGraphNode,
  ImpactNodeAnalysisStatus,
  ImpactNodeCategory,
} from "@/lib/analysis/impact/impact-graph";

const NODE_CATEGORIES = new Set<ImpactNodeCategory>([
  "changed",
  "direct_dependent",
  "indirect_dependent",
]);

const ANALYSIS_STATUSES = new Set<ImpactNodeAnalysisStatus>([
  "analyzed",
  "deleted_source",
  "non_source",
  "unscanned_source",
  "parse_failed",
]);

const EDGE_ROLES = new Set<ImpactEdgeRole>([
  "primary",
  "multi_origin",
  "changed_to_changed",
  "secondary",
]);

const RESOLUTION_KINDS = new Set<ImpactEdgeResolutionKind>([
  "direct_path",
  "renamed_previous_path",
]);

const FILE_CATEGORIES = new Set<FileCategory>([
  "frontend",
  "backend",
  "database",
  "authentication",
  "configuration",
  "infrastructure",
  "tests",
  "documentation",
  "dependencies",
  "unknown",
]);

const CHANGE_STATUSES = new Set<ChangeStatus>([
  "added",
  "modified",
  "removed",
  "renamed",
  "copied",
  "changed",
  "unchanged",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isImpactDepth(value: unknown): value is ImpactDepth {
  return value === 1 || value === 2 || value === 3;
}

function parseDepthByOrigin(
  value: unknown,
): Record<string, ImpactDepth> | null {
  if (!isObject(value)) return null;
  const out: Record<string, ImpactDepth> = {};
  for (const [key, depth] of Object.entries(value)) {
    if (!isImpactDepth(depth)) return null;
    out[key] = depth;
  }
  return out;
}

function parseNode(value: unknown): ImpactGraphNode | null {
  if (!isObject(value)) return null;
  if (!isString(value.id) || value.id.length === 0) return null;
  if (value.path !== value.id) return null;
  if (!(isString(value.previousPath) || value.previousPath === null)) return null;
  if (!isString(value.label) || !isString(value.directory)) return null;
  if (!NODE_CATEGORIES.has(value.category as ImpactNodeCategory)) return null;
  if (!ANALYSIS_STATUSES.has(value.analysisStatus as ImpactNodeAnalysisStatus)) {
    return null;
  }
  if (value.depth !== 0 && !isImpactDepth(value.depth)) return null;
  const depthByOrigin = parseDepthByOrigin(value.depthByOrigin);
  if (!depthByOrigin) return null;
  if (!isString(value.area) || !isBoolean(value.isRoute)) return null;
  if (!isStringArray(value.originChangedFiles)) return null;
  if (!isStringArray(value.missingOrigins)) return null;
  if (!isBoolean(value.provenanceComplete)) return null;
  if (
    !(
      value.unresolvedImportCount === null ||
      isNonNegativeInt(value.unresolvedImportCount)
    )
  ) {
    return null;
  }
  if (!(isString(value.cycleGroupId) || value.cycleGroupId === null)) return null;
  if (!(isBoolean(value.cycleComplete) || value.cycleComplete === null)) return null;
  if (!isNonNegativeInt(value.omittedIncomingEdgeCount)) return null;
  if (!isNonNegativeInt(value.omittedOutgoingEdgeCount)) return null;

  const node: ImpactGraphNode = {
    id: value.id,
    path: value.path,
    previousPath: value.previousPath,
    label: value.label,
    directory: value.directory,
    category: value.category as ImpactNodeCategory,
    analysisStatus: value.analysisStatus as ImpactNodeAnalysisStatus,
    depth: value.depth as 0 | ImpactDepth,
    depthByOrigin,
    area: value.area,
    isRoute: value.isRoute,
    originChangedFiles: value.originChangedFiles,
    missingOrigins: value.missingOrigins,
    provenanceComplete: value.provenanceComplete,
    unresolvedImportCount: value.unresolvedImportCount,
    cycleGroupId: value.cycleGroupId,
    cycleComplete: value.cycleComplete,
    omittedIncomingEdgeCount: value.omittedIncomingEdgeCount,
    omittedOutgoingEdgeCount: value.omittedOutgoingEdgeCount,
  };

  if ("fileCategory" in value && value.fileCategory !== undefined) {
    if (!FILE_CATEGORIES.has(value.fileCategory as FileCategory)) return null;
    node.fileCategory = value.fileCategory as FileCategory;
  }
  if ("changeType" in value && value.changeType !== undefined) {
    if (!CHANGE_STATUSES.has(value.changeType as ChangeStatus)) return null;
    node.changeType = value.changeType as ChangeStatus;
  }
  if ("additions" in value && value.additions !== undefined) {
    if (!isFiniteNumber(value.additions)) return null;
    node.additions = value.additions;
  }
  if ("deletions" in value && value.deletions !== undefined) {
    if (!isFiniteNumber(value.deletions)) return null;
    node.deletions = value.deletions;
  }

  return node;
}

function parseEdge(value: unknown): ImpactGraphEdge | null {
  if (!isObject(value)) return null;
  if (!isString(value.from) || value.from.length === 0) return null;
  if (!isString(value.to) || value.to.length === 0) return null;
  if (value.id !== `${value.from}->${value.to}`) return null;
  if (!EDGE_ROLES.has(value.structuralRole as ImpactEdgeRole)) return null;
  if (!RESOLUTION_KINDS.has(value.resolutionKind as ImpactEdgeResolutionKind)) {
    return null;
  }
  if (!isStringArray(value.shortestForOrigins)) return null;
  if (!(value.minOriginHop === null || isImpactDepth(value.minOriginHop))) {
    return null;
  }
  if (!isBoolean(value.isBackTierEdge)) return null;
  if (!isBoolean(value.isSameTierEdge)) return null;
  if (!isBoolean(value.isCycleEdge)) return null;
  if (!(isString(value.cycleGroupId) || value.cycleGroupId === null)) return null;

  return {
    id: value.id,
    from: value.from,
    to: value.to,
    structuralRole: value.structuralRole as ImpactEdgeRole,
    resolutionKind: value.resolutionKind as ImpactEdgeResolutionKind,
    shortestForOrigins: value.shortestForOrigins,
    minOriginHop: value.minOriginHop as ImpactDepth | null,
    isBackTierEdge: value.isBackTierEdge,
    isSameTierEdge: value.isSameTierEdge,
    isCycleEdge: value.isCycleEdge,
    cycleGroupId: value.cycleGroupId,
  };
}

function parseCycleGroup(value: unknown): ImpactCycleGroup | null {
  if (!isObject(value)) return null;
  if (!isString(value.id) || value.id.length === 0) return null;
  if (!isStringArray(value.nodeIds)) return null;
  if (!isNonNegativeInt(value.totalEdgeCount)) return null;
  if (!isNonNegativeInt(value.retainedEdgeCount)) return null;
  if (!isNonNegativeInt(value.omittedEdgeCount)) return null;
  if (!isBoolean(value.isComplete)) return null;
  if (!isBoolean(value.remainsStronglyConnected)) return null;
  return {
    id: value.id,
    nodeIds: value.nodeIds,
    totalEdgeCount: value.totalEdgeCount,
    retainedEdgeCount: value.retainedEdgeCount,
    omittedEdgeCount: value.omittedEdgeCount,
    isComplete: value.isComplete,
    remainsStronglyConnected: value.remainsStronglyConnected,
  };
}

function parseMetadata(value: unknown): ImpactGraphMetadata | null {
  if (!isObject(value)) return null;
  if (!isNonNegativeInt(value.maxDepth)) return null;
  if (!isNonNegativeInt(value.maxEdges)) return null;
  if (!isNonNegativeInt(value.scannedFileCount)) return null;
  if (!(value.treeFileCount === null || isNonNegativeInt(value.treeFileCount))) {
    return null;
  }
  if (!isNonNegativeInt(value.changedFileCount)) return null;
  if (!isNonNegativeInt(value.changedSourceNodeCount)) return null;
  if (!isStringArray(value.unmappedChangedFiles)) return null;
  if (!isNonNegativeInt(value.directDependentNodeCount)) return null;
  if (!isNonNegativeInt(value.indirectDependentNodeCount)) return null;
  if (!isNonNegativeInt(value.eligibleEdgeCount)) return null;
  if (!isNonNegativeInt(value.cycleGroupCount)) return null;
  if (!isBoolean(value.cyclesTruncated)) return null;
  if (!Array.isArray(value.cycleGroups)) return null;
  if (!isBoolean(value.truncatedFileScan)) return null;
  if (!isNonNegativeInt(value.fetchErrorCount)) return null;
  if (!isBoolean(value.edgesTruncated)) return null;
  if (!isNonNegativeInt(value.omittedEdgesTotal)) return null;
  if (!isBoolean(value.provenanceTruncated)) return null;

  const cycleGroups: ImpactCycleGroup[] = [];
  for (const raw of value.cycleGroups) {
    const group = parseCycleGroup(raw);
    if (!group) return null;
    cycleGroups.push(group);
  }
  if (value.cycleGroupCount !== cycleGroups.length) return null;

  return {
    maxDepth: value.maxDepth,
    maxEdges: value.maxEdges,
    scannedFileCount: value.scannedFileCount,
    treeFileCount: value.treeFileCount,
    changedFileCount: value.changedFileCount,
    changedSourceNodeCount: value.changedSourceNodeCount,
    unmappedChangedFiles: value.unmappedChangedFiles,
    directDependentNodeCount: value.directDependentNodeCount,
    indirectDependentNodeCount: value.indirectDependentNodeCount,
    eligibleEdgeCount: value.eligibleEdgeCount,
    cycleGroupCount: value.cycleGroupCount,
    cyclesTruncated: value.cyclesTruncated,
    cycleGroups,
    truncatedFileScan: value.truncatedFileScan,
    fetchErrorCount: value.fetchErrorCount,
    edgesTruncated: value.edgesTruncated,
    omittedEdgesTotal: value.omittedEdgesTotal,
    provenanceTruncated: value.provenanceTruncated,
  };
}

/**
 * Validate a value stored at context_stats.impact.graph.
 * Unsupported versions and any contract violation return null.
 */
export function parsePersistedImpactGraph(value: unknown): ImpactGraphData | null {
  try {
    if (!isObject(value)) return null;
    if (value.version !== 1) return null;
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;

    const nodes: ImpactGraphNode[] = [];
    const nodeIds = new Set<string>();
    for (const raw of value.nodes) {
      const node = parseNode(raw);
      if (!node || nodeIds.has(node.id)) return null;
      nodeIds.add(node.id);
      nodes.push(node);
    }

    const edges: ImpactGraphEdge[] = [];
    const edgeIds = new Set<string>();
    for (const raw of value.edges) {
      const edge = parseEdge(raw);
      if (!edge || edgeIds.has(edge.id)) return null;
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return null;
      edgeIds.add(edge.id);
      edges.push(edge);
    }

    const metadata = parseMetadata(value.metadata);
    if (!metadata) return null;
    for (const group of metadata.cycleGroups) {
      if (!group.nodeIds.every((id) => nodeIds.has(id))) return null;
    }

    return { version: 1, nodes, edges, metadata };
  } catch {
    return null;
  }
}
