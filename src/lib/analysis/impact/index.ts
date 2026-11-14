/**
 * Impact Engine — blast radius via deterministic import graph.
 * REQUIREMENTS §8.7, §14, §21.7
 */

import {
  buildImpactGraphData,
  buildImpactImportIndex,
  classifyModuleArea,
  collectDependents,
  isRouteLikePath,
  buildReverseImportGraph,
  type ImpactGraphData,
} from "@/lib/analysis/impact/import-graph";
import { normalizePath } from "@/lib/analysis/impact/parse-imports";
import type { ChangedFileEvidence } from "@/lib/analysis/types";
import type { ImpactClassification } from "@/types/domain";
import type { AffectedAreaDraft } from "@/lib/analysis/decision-engine/affected-areas";

export interface FileImpactDetail {
  path: string;
  directDependents: string[];
  indirectDependents: string[];
  dependencyCount: number;
  affectedRoutes: string[];
}

export interface ImpactAnalysisResult {
  impactClassification: ImpactClassification;
  confidence: number;
  explanation: string;
  /** Total unique reverse dependents across all changed files */
  totalDependencyCount: number;
  directDependencyCount: number;
  indirectDependencyCount: number;
  affectedModules: string[];
  affectedRoutes: string[];
  perFile: FileImpactDetail[];
  /** §21.7 rows derived from the graph (replaces sensitivity-only drafts). */
  affectedAreas: AffectedAreaDraft[];
  graphMeta: {
    scannedFiles: number;
    parsedFiles: number;
    truncated: boolean;
    fetchErrors: number;
  };
  /** Interactive dependency impact graph data. */
  impactGraph: ImpactGraphData;
}

export interface AnalyzeImpactInput {
  owner: string;
  repo: string;
  installationId: number;
  headSha: string;
  changedFiles: ChangedFileEvidence[];
  /** Optional pre-fetched sources for tests */
  prefetchedSources?: Map<string, string>;
  /** Optional explicit scan truncation flag when using prefetchedSources */
  scanTruncated?: boolean;
}

/**
 * Compute blast radius for PR changed files using a reverse import graph.
 */
export async function analyzeImpact(
  input: AnalyzeImpactInput,
): Promise<ImpactAnalysisResult> {
  const changedCode = input.changedFiles.filter((f) =>
    /\.(tsx?|jsx?|mjs|cjs)$/i.test(f.path),
  );
  const priorityPaths = input.changedFiles.map((f) => f.path);

  let files: Map<string, string>;
  let truncated = input.scanTruncated === true;
  let fetchErrors = 0;
  let treeFileCount = 0;
  let fetchedCount = 0;

  if (input.prefetchedSources) {
    files = input.prefetchedSources;
    fetchedCount = files.size;
  } else {
    try {
      const { fetchRepositorySources } = await import(
        "@/lib/analysis/impact/fetch-sources"
      );
      const fetched = await fetchRepositorySources({
        owner: input.owner,
        repo: input.repo,
        installationId: input.installationId,
        headSha: input.headSha,
        priorityPaths,
      });
      files = fetched.files;
      truncated = fetched.truncated;
      fetchErrors = fetched.errors;
      treeFileCount = fetched.treeFileCount;
      fetchedCount = fetched.fetchedCount;
    } catch (err) {
      // Soft-fail: empty graph → unknown/low impact, analysis continues
      const message = err instanceof Error ? err.message : "fetch failed";
      return emptyImpactResult(
        `Import graph unavailable (${message}). Impact not fully assessed.`,
        0.25,
        input.changedFiles,
      );
    }
  }

  // Ensure changed file paths exist as keys even if empty (deleted files)
  for (const f of changedCode) {
    const p = normalizePath(f.path);
    if (!files.has(p) && f.status !== "removed") {
      // missing content — graph may under-count dependents
    }
  }

  // Build the shared import index once and reuse it for both reverse-graph
  // dependent aggregation and ImpactGraphData construction.
  const importIndex = buildImpactImportIndex(files, input.changedFiles);
  const graphResult = buildReverseImportGraph(files, {
    changedFiles: input.changedFiles,
    importIndex,
  });
  truncated = truncated || graphResult.truncated;

  const changedPathSet = new Set(
    input.changedFiles.map((f) => normalizePath(f.path)),
  );

  const perFile: FileImpactDetail[] = [];
  const allDirect = new Set<string>();
  const allIndirect = new Set<string>();
  const allRoutes = new Set<string>();
  const moduleAreas = new Set<string>();

  for (const f of input.changedFiles) {
    const path = normalizePath(f.path);
    moduleAreas.add(classifyModuleArea(path));

    const deps = collectDependents(graphResult.reverseGraph, path, 3);
    // Exclude files already modified by the PR from unmodified downstream dependent counts
    const directUnmodified = deps.direct.filter((d) => !changedPathSet.has(d));
    const indirectUnmodified = deps.indirect.filter(
      (d) => !changedPathSet.has(d) && !directUnmodified.includes(d),
    );
    const allUnmodified = [...directUnmodified, ...indirectUnmodified];

    for (const d of directUnmodified) allDirect.add(d);
    for (const d of indirectUnmodified) allIndirect.add(d);

    const routes = allUnmodified.filter(isRouteLikePath);
    for (const r of routes) allRoutes.add(r);

    perFile.push({
      path,
      directDependents: directUnmodified,
      indirectDependents: indirectUnmodified,
      dependencyCount: allUnmodified.length,
      affectedRoutes: routes,
    });
  }

  // Indirect should not double-count directs
  for (const d of allDirect) allIndirect.delete(d);

  const directCount = allDirect.size;
  const indirectCount = allIndirect.size;
  const totalDeps = directCount + indirectCount;
  const routeCount = allRoutes.size;

  const { impactClassification, confidence, explanation } = classifyImpact({
    directCount,
    indirectCount,
    totalDeps,
    routeCount,
    changedCodeCount: changedCode.length,
    truncated,
    parsedRatio:
      graphResult.parsedCount > 0
        ? graphResult.parsedCount /
          Math.max(1, graphResult.parsedCount + graphResult.failedCount)
        : fetchedCount > 0
          ? 0.7
          : 0.3,
    fetchErrors,
  });

  const affectedAreas = buildGraphAffectedAreas({
    changedFiles: input.changedFiles,
    perFile,
    allDirect: [...allDirect],
    allIndirect: [...allIndirect],
    allRoutes: [...allRoutes],
    impactClassification,
    confidence,
    explanation,
  });

  const impactGraph = buildImpactGraphData({
    files,
    changedFiles: input.changedFiles,
    importIndex,
    scanTruncated: truncated,
    fetchErrorCount: fetchErrors,
    treeFileCount: treeFileCount > 0 ? treeFileCount : null,
  });

  return {
    impactClassification,
    confidence,
    explanation,
    totalDependencyCount: totalDeps,
    directDependencyCount: directCount,
    indirectDependencyCount: indirectCount,
    affectedModules: [...moduleAreas].sort(),
    affectedRoutes: [...allRoutes].sort(),
    perFile,
    affectedAreas,
    graphMeta: {
      scannedFiles: treeFileCount || graphResult.scannedPaths.length,
      parsedFiles: graphResult.parsedCount,
      truncated,
      fetchErrors,
    },
    impactGraph,
  };
}

function classifyImpact(input: {
  directCount: number;
  indirectCount: number;
  totalDeps: number;
  routeCount: number;
  changedCodeCount: number;
  truncated: boolean;
  parsedRatio: number;
  fetchErrors: number;
}): {
  impactClassification: ImpactClassification;
  confidence: number;
  explanation: string;
} {
  let impactClassification: ImpactClassification = "LOW";

  if (
    input.directCount >= 8 ||
    input.totalDeps >= 15 ||
    input.routeCount >= 4
  ) {
    impactClassification = "HIGH";
  } else if (
    input.directCount >= 3 ||
    input.totalDeps >= 5 ||
    input.routeCount >= 2
  ) {
    impactClassification = "MEDIUM";
  } else if (input.changedCodeCount === 0 && input.totalDeps === 0) {
    // Only non-code files (docs, config, etc.)
    impactClassification = "LOW";
  }

  // Confidence: higher when we parsed a large share and weren't truncated
  let confidence = 0.55 + input.parsedRatio * 0.3;
  if (input.truncated) confidence -= 0.12;
  if (input.fetchErrors > 5) confidence -= 0.08;
  if (input.totalDeps > 0) confidence += 0.08;
  if (input.changedCodeCount === 0) confidence = Math.min(confidence, 0.7);
  confidence = Math.round(Math.max(0.2, Math.min(0.92, confidence)) * 100) / 100;

  const explanation =
    input.totalDeps === 0
      ? input.changedCodeCount === 0
        ? "No TS/JS modules changed; blast radius from import graph is minimal."
        : "No reverse imports detected for changed modules within the scanned graph (file may be a leaf entrypoint or graph was incomplete)."
      : `This change is imported by ${input.directCount} module${input.directCount === 1 ? "" : "s"} directly` +
        (input.indirectCount > 0
          ? ` and ${input.indirectCount} more transitively (depth≤3)`
          : "") +
        (input.routeCount > 0
          ? `; potentially affects ${input.routeCount} route/page file${input.routeCount === 1 ? "" : "s"}`
          : "") +
        `.`;

  return { impactClassification, confidence, explanation };
}

function buildGraphAffectedAreas(input: {
  changedFiles: ChangedFileEvidence[];
  perFile: FileImpactDetail[];
  allDirect: string[];
  allIndirect: string[];
  allRoutes: string[];
  impactClassification: ImpactClassification;
  confidence: number;
  explanation: string;
}): AffectedAreaDraft[] {
  const areas: AffectedAreaDraft[] = [];
  const seen = new Set<string>();

  const push = (row: AffectedAreaDraft) => {
    const key = `${row.filePath}::${row.impactType}`;
    if (seen.has(key)) return;
    seen.add(key);
    areas.push(row);
  };

  // Summary row for the blast radius as a whole
  push({
    filePath: input.changedFiles[0]?.path ?? "(repository)",
    affectedArea: "Blast radius",
    impactType: "blast_radius_summary",
    confidence: input.confidence,
    explanation: `${input.explanation} Impact: ${input.impactClassification} (confidence ${input.confidence}).`,
  });

  for (const f of input.perFile) {
    push({
      filePath: f.path,
      affectedArea: classifyModuleArea(f.path),
      impactType: "changed",
      confidence: input.confidence,
      explanation:
        f.dependencyCount === 0
          ? `Changed module with no detected reverse dependents in the scanned graph.`
          : `Changed module imported by ${f.directDependents.length} direct and ${f.indirectDependents.length} indirect dependent(s).`,
    });

    for (const dep of f.directDependents.slice(0, 25)) {
      push({
        filePath: dep,
        affectedArea: classifyModuleArea(dep),
        impactType: "direct_dependent",
        confidence: Math.min(0.9, input.confidence + 0.05),
        explanation: `Directly imports changed file ${f.path}.`,
      });
    }

    for (const dep of f.indirectDependents.slice(0, 15)) {
      push({
        filePath: dep,
        affectedArea: classifyModuleArea(dep),
        impactType: "indirect_dependent",
        confidence: Math.max(0.35, input.confidence - 0.1),
        explanation: `Transitively depends on ${f.path} (via import graph, depth≤3).`,
      });
    }

    for (const route of f.affectedRoutes.slice(0, 12)) {
      push({
        filePath: route,
        affectedArea: "Route",
        impactType: "affected_route",
        confidence: Math.min(0.88, input.confidence + 0.03),
        explanation: `Route/page module may be affected via imports from ${f.path}.`,
      });
    }
  }

  return areas.slice(0, 120);
}

function emptyImpactResult(
  explanation: string,
  confidence: number,
  changedFiles: ChangedFileEvidence[] = [],
): ImpactAnalysisResult {
  return {
    impactClassification: "UNKNOWN",
    confidence,
    explanation,
    totalDependencyCount: 0,
    directDependencyCount: 0,
    indirectDependencyCount: 0,
    affectedModules: [],
    affectedRoutes: [],
    perFile: [],
    affectedAreas: [
      {
        filePath: "(repository)",
        affectedArea: "Blast radius",
        impactType: "blast_radius_summary",
        confidence,
        explanation,
      },
    ],
    graphMeta: {
      scannedFiles: 0,
      parsedFiles: 0,
      truncated: false,
      fetchErrors: 1,
    },
    impactGraph: buildImpactGraphData({
      files: new Map(),
      changedFiles,
      scanTruncated: false,
      fetchErrorCount: 1,
      treeFileCount: null,
    }),
  };
}

/** @deprecated Use analyzeImpact(input) */
export async function analyzeImpactStub(): Promise<ImpactAnalysisResult> {
  return emptyImpactResult("Impact analysis stub.", 0.2);
}
