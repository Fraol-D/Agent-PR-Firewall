/**
 * Stage 2 — impact graph persistence, hydration, and human-override retention.
 *
 * Run:
 *   node --no-warnings --import ./scripts/ts-test-loader.mjs --test src/services/__tests__/impact-graph-persistence.test.ts
 *
 * Service tests call getAnalysisDetail and recordHumanOverride. Supabase,
 * the orchestrator, and check-run reporting are replaced with in-memory
 * stubs so the real read and update paths run without node_modules.
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { analyzeImpact } from "@/lib/analysis/impact";
import { buildPersistedContextStats } from "@/lib/analysis/persisted-context-stats";
import { parsePersistedImpactGraph } from "@/lib/analysis/impact/validate-persisted-graph";
import { computeRiskFromFindings } from "@/lib/analysis/risk";
import type { DecisionEngineResult } from "@/lib/analysis/decision-engine";
import type { ImpactGraphData } from "@/lib/analysis/impact/impact-graph";
import type { IntentScopeResult } from "@/lib/analysis/scope/types";
import type { ChangedFileEvidence } from "@/lib/analysis/types";
import {
  createFakeClient,
  failAnalysesPointRead,
  failAnalysesUpdate,
  failDeletes,
  getMutations,
  getRpcCalls,
  getStore,
  resetStore,
  setRpcError,
  setZeroRowAnalysesUpdate,
} from "./helpers/fake-supabase.mjs";

const helpersDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "helpers");
const mocks: Record<string, string> = {
  "@/lib/supabase/server": "mock-supabase-server.mjs",
  "@/lib/supabase/admin": "mock-supabase-admin.mjs",
  "@/lib/analysis/orchestrator": "mock-orchestrator.mjs",
  "@/services/checks": "mock-checks.mjs",
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const file = mocks[specifier];
    if (file) {
      return {
        url: pathToFileURL(path.join(helpersDir, file)).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const USER_ID = "user-1";
const ANALYSIS_ID = "analysis-1";

type GetAnalysisDetail = typeof import("@/services/analyses").getAnalysisDetail;
type RecordHumanOverride = typeof import("@/services/overrides").recordHumanOverride;
type PersistCompletedAnalysis = typeof import("@/services/analyses").persistCompletedAnalysis;

let getAnalysisDetail: GetAnalysisDetail;
let recordHumanOverride: RecordHumanOverride;
let persistCompletedAnalysis: PersistCompletedAnalysis;
let servicesPromise: Promise<void> | null = null;

function loadServices(): Promise<void> {
  servicesPromise ??= Promise.all([
    import("@/services/analyses"),
    import("@/services/overrides"),
  ]).then(([analyses, overrides]) => {
    getAnalysisDetail = analyses.getAnalysisDetail;
    persistCompletedAnalysis = analyses.persistCompletedAnalysis;
    recordHumanOverride = overrides.recordHumanOverride;
  });
  return servicesPromise;
}

const changedFile: ChangedFileEvidence = {
  path: "src/a.ts",
  previousPath: null,
  status: "modified",
  additions: 2,
  deletions: 1,
  category: "frontend",
  isBinary: false,
  excludedFromAi: false,
  excludeReason: null,
  patchExcerpt: "export const a = 1;",
};

function sampleImpact() {
  return analyzeImpact({
    owner: "acme",
    repo: "veris",
    installationId: 1,
    headSha: "abc123def456",
    changedFiles: [changedFile],
    prefetchedSources: new Map([
      ["src/a.ts", "import { b } from './b';\nexport const a = 1;\n"],
      ["src/b.ts", "import { a } from './a';\nexport const b = a;\n"],
    ]),
  });
}

function persistedStats(impact: Awaited<ReturnType<typeof sampleImpact>>) {
  return buildPersistedContextStats({
    contextStats: {
      filesChanged: 1,
      linesAdded: 2,
      linesDeleted: 1,
      filesIncludedInAi: 1,
      filesExcludedFromAi: 0,
      truncatedPatches: false,
    },
    baseSha: "base-sha",
    headSha: "abc123def456",
    intentScope: { taskSummary: "keep-intent" } as IntentScopeResult,
    decisionEngine: {
      finalDecision: "LOW",
      summary: "keep-decision",
    } as DecisionEngineResult,
    impact,
  });
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function storedContextStats(): unknown {
  const store = getStore() as { analyses: Array<{ context_stats: unknown }> };
  return store.analyses[0]?.context_stats;
}

function analysesUpdates(): Array<{ op: string; table: string }> {
  return getMutations().filter(
    (entry) => entry.op === "update" && entry.table === "analyses",
  );
}

function analysisEvents(): Array<{ event_type?: string }> {
  return (getStore() as { analysis_events: Array<{ event_type?: string }> })
    .analysis_events;
}

function markAnalysisRunning() {
  const row = (getStore() as { analyses: Array<Record<string, unknown>> }).analyses[0];
  row.status = "running";
}

const completionJob = {
  analysisId: ANALYSIS_ID,
  pullRequestId: "pr-1",
  headSha: "abc123def456",
};

function completionResult(impact: Awaited<ReturnType<typeof sampleImpact>>) {
  return {
    context: {
      stats: {
        filesChanged: 1,
        linesAdded: 2,
        linesDeleted: 1,
        filesIncludedInAi: 1,
        filesExcludedFromAi: 0,
        truncatedPatches: false,
      },
    },
    deterministic: {
      changedFiles: [] as ChangedFileEvidence[],
      filesChanged: 1,
      linesAdded: 2,
      linesDeleted: 1,
    },
    ai: {
      summary: "completed",
      overallStatus: "review_recommended" as const,
      provider: "openrouter",
      model: "test-model",
      findings: [],
    },
    intentScope: {
      scopeMatch: "matches",
      scopeScore: 90,
      scopeClassificationDb: "HIGH_COMPLIANCE",
      taskSummary: "keep-intent",
      scopeMatchReason: "reason",
      classification: "feature",
      coverage: "high",
      taskSources: [],
    },
    risk: {
      riskClassification: "LOW" as const,
      riskScore: 12,
      factors: [],
    },
    impact,
    finalDecision: {
      finalDecision: "LOW" as const,
      impactClassification: impact.impactClassification,
    },
    affectedAreas: [],
    baseSha: "base-sha",
    headSha: "abc123def456",
  };
}

function seedAnalysis(input: {
  contextStats: unknown;
  affectedAreas?: Array<Record<string, unknown>>;
}) {
  resetStore();
  const store = getStore() as Record<string, Array<Record<string, unknown>>>;
  store.pull_requests.push({
    id: "pr-1",
    head_sha: "abc123def456",
    repositories: {
      owner: "acme",
      name: "veris",
      github_installation_id: null,
      connected_by_user_id: USER_ID,
    },
  });
  store.analyses.push({
    id: ANALYSIS_ID,
    pull_request_id: "pr-1",
    analysis_version: 1,
    status: "completed",
    head_sha: "abc123def456",
    overall_status: "review_recommended",
    error_message: null,
    files_changed: 1,
    lines_added: 4,
    lines_deleted: 1,
    provider: "openrouter",
    model: "test-model",
    deterministic_result: null,
    context_stats: input.contextStats,
    duration_ms: 20,
    risk_score: 12,
    risk_classification: "LOW",
    scope_score: 90,
    scope_classification: "HIGH_COMPLIANCE",
    impact_classification: null,
    final_decision: "LOW",
    summary: "summary",
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:00:01.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  for (const area of input.affectedAreas ?? []) {
    store.affected_areas.push(area);
  }
}

async function loadDetail() {
  const result = await getAnalysisDetail(USER_ID, ANALYSIS_ID, "abc123def456");
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  assert.ok(result.ok && result.data);
  return result.ok ? result.data : null;
}

describe("impact graph persistence payload", () => {
  test("stores the graph under impact.graph and keeps the summary and other stats", async () => {
    const impact = await sampleImpact();
    const stats = persistedStats(impact);
    const impactSummary = stats.impact as Record<string, unknown>;

    assert.equal(impactSummary.classification, impact.impactClassification);
    assert.equal(impactSummary.confidence, impact.confidence);
    assert.equal(impactSummary.explanation, impact.explanation);
    assert.equal(impactSummary.directDependents, impact.directDependencyCount);
    assert.equal(impactSummary.totalDependents, impact.totalDependencyCount);
    assert.deepEqual(impactSummary.routes, impact.affectedRoutes);
    assert.deepEqual(impactSummary.graphMeta, impact.graphMeta);
    assert.notEqual(impactSummary, impactSummary.graph);
    assert.equal((impactSummary.graph as ImpactGraphData).version, 1);
    assert.ok((impactSummary.graph as ImpactGraphData).nodes.length >= 2);
    assert.ok((impactSummary.graph as ImpactGraphData).edges.length >= 1);

    assert.equal(stats.filesChanged, 1);
    assert.equal(stats.linesAdded, 2);
    assert.equal(stats.baseSha, "base-sha");
    assert.equal(stats.headSha, "abc123def456");
    assert.equal(
      (stats.intentScope as { taskSummary: string }).taskSummary,
      "keep-intent",
    );
    assert.equal(
      (stats.decisionEngine as { summary: string }).summary,
      "keep-decision",
    );

    const roundTrip = jsonClone(impactSummary.graph);
    const parsed = parsePersistedImpactGraph(roundTrip);
    assert.deepEqual(parsed, roundTrip);
    assert.ok(parsed);
    assert.deepEqual(parsed.metadata.cycleGroups, roundTrip.metadata.cycleGroups);
    const dependent = parsed.nodes.find((node) => node.id === "src/b.ts");
    assert.ok(dependent);
    assert.deepEqual(dependent.depthByOrigin, { "src/a.ts": 1 });
    assert.equal(parsed.edges[0].id, `${parsed.edges[0].from}->${parsed.edges[0].to}`);
  });
});

describe("persistCompletedAnalysis writers", () => {
  test("atomic RPC receives the graph at p_context_stats.impact.graph", async () => {
    await loadServices();
    const impact = await sampleImpact();
    seedAnalysis({ contextStats: { sentinel: true } });

    await persistCompletedAnalysis(
      createFakeClient() as never,
      {
        analysisId: ANALYSIS_ID,
        pullRequestId: "pr-1",
        headSha: "abc123def456",
      },
      completionResult(impact) as never,
      15,
    );

    const calls = getRpcCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fn, "complete_analysis_atomic");
    const stats = calls[0].args.p_context_stats as {
      filesChanged: number;
      baseSha: string;
      impact: {
        classification: string;
        confidence: number;
        explanation: string;
        directDependents: number;
        totalDependents: number;
        routes: string[];
        graphMeta: unknown;
        graph: ImpactGraphData;
      };
    };
    assert.equal(stats.filesChanged, 1);
    assert.equal(stats.baseSha, "base-sha");
    assert.equal(stats.impact.classification, impact.impactClassification);
    assert.equal(stats.impact.confidence, impact.confidence);
    assert.equal(stats.impact.explanation, impact.explanation);
    assert.equal(stats.impact.directDependents, impact.directDependencyCount);
    assert.equal(stats.impact.totalDependents, impact.totalDependencyCount);
    assert.deepEqual(stats.impact.routes, impact.affectedRoutes);
    assert.deepEqual(stats.impact.graphMeta, impact.graphMeta);
    assert.deepEqual(stats.impact.graph, jsonClone(impact.impactGraph));
    assert.deepEqual(storedContextStats(), { sentinel: true });
    assert.equal(analysesUpdates().length, 0);
  });

  test("sequential fallback stores the same graph on context_stats.impact.graph", async () => {
    await loadServices();
    const impact = await sampleImpact();
    seedAnalysis({ contextStats: { sentinel: true } });
    setRpcError(
      "Could not find the function public.complete_analysis_atomic in the schema cache",
    );

    await persistCompletedAnalysis(
      createFakeClient() as never,
      {
        analysisId: ANALYSIS_ID,
        pullRequestId: "pr-1",
        headSha: "abc123def456",
      },
      completionResult(impact) as never,
      15,
    );

    const stats = storedContextStats() as {
      filesChanged: number;
      baseSha: string;
      sentinel?: boolean;
      impact: {
        classification: string;
        confidence: number;
        explanation: string;
        directDependents: number;
        totalDependents: number;
        routes: string[];
        graphMeta: unknown;
        graph: ImpactGraphData;
      };
    };
    assert.equal(stats.sentinel, undefined);
    assert.equal(stats.filesChanged, 1);
    assert.equal(stats.baseSha, "base-sha");
    assert.equal(stats.impact.classification, impact.impactClassification);
    assert.equal(stats.impact.confidence, impact.confidence);
    assert.equal(stats.impact.explanation, impact.explanation);
    assert.equal(stats.impact.directDependents, impact.directDependencyCount);
    assert.equal(stats.impact.totalDependents, impact.totalDependencyCount);
    assert.deepEqual(stats.impact.routes, impact.affectedRoutes);
    assert.deepEqual(stats.impact.graphMeta, impact.graphMeta);
    assert.deepEqual(stats.impact.graph, jsonClone(impact.impactGraph));
    assert.equal(analysesUpdates().length, 1);
    assert.equal(
      (getStore() as { risk_factors: unknown[] }).risk_factors.length,
      0,
    );
    assert.equal(
      analysisEvents().some((event) => event.event_type === "analysis_completed"),
      true,
    );
  });

  test("a zero-row final update does not complete the analysis", async () => {
    await loadServices();
    const impact = await sampleImpact();
    seedAnalysis({ contextStats: { sentinel: true } });
    markAnalysisRunning();
    setRpcError(
      "Could not find the function public.complete_analysis_atomic in the schema cache",
    );
    setZeroRowAnalysesUpdate(true);

    await assert.rejects(
      () =>
        persistCompletedAnalysis(
          createFakeClient() as never,
          completionJob,
          completionResult(impact) as never,
          15,
        ),
      /no analysis row matched the id and head SHA/,
    );

    const row = (getStore() as { analyses: Array<Record<string, unknown>> }).analyses[0];
    assert.equal(row.status, "running");
    assert.deepEqual(row.context_stats, { sentinel: true });
    assert.equal(
      analysisEvents().some((event) => event.event_type === "analysis_completed"),
      false,
    );
  });

  test("a head SHA mismatch does not complete the analysis", async () => {
    await loadServices();
    const impact = await sampleImpact();
    seedAnalysis({ contextStats: { sentinel: true } });
    markAnalysisRunning();
    (getStore() as { analyses: Array<Record<string, unknown>> }).analyses[0].head_sha =
      "stale-sha";
    setRpcError(
      "Could not find the function public.complete_analysis_atomic in the schema cache",
    );

    await assert.rejects(
      () =>
        persistCompletedAnalysis(
          createFakeClient() as never,
          completionJob,
          completionResult(impact) as never,
          15,
        ),
      /no analysis row matched the id and head SHA/,
    );

    const row = (getStore() as { analyses: Array<Record<string, unknown>> }).analyses[0];
    assert.equal(row.status, "running");
    assert.equal(row.head_sha, "stale-sha");
    assert.deepEqual(row.context_stats, { sentinel: true });
    assert.equal(analysisEvents().length, 0);
  });

  test("an unrelated RPC error does not use the sequential fallback", async () => {
    await loadServices();
    const impact = await sampleImpact();
    seedAnalysis({ contextStats: { sentinel: true } });
    markAnalysisRunning();
    setRpcError("could not find the analysis row");

    await assert.rejects(
      () =>
        persistCompletedAnalysis(
          createFakeClient() as never,
          completionJob,
          completionResult(impact) as never,
          15,
        ),
      /Atomic persistence failed: could not find the analysis row/,
    );

    const row = (getStore() as { analyses: Array<Record<string, unknown>> }).analyses[0];
    assert.equal(row.status, "running");
    assert.deepEqual(row.context_stats, { sentinel: true });
    assert.equal(analysesUpdates().length, 0);
    assert.equal(analysisEvents().length, 0);
  });

  test("a cleanup failure does not replace the persistence error", async () => {
    await loadServices();
    const impact = await sampleImpact();
    seedAnalysis({ contextStats: { sentinel: true } });
    markAnalysisRunning();
    (getStore() as { risk_factors: Array<Record<string, unknown>> }).risk_factors.push({
      id: "factor-1",
      analysis_id: ANALYSIS_ID,
    });
    setRpcError("permission denied for table analyses");
    failDeletes("delete exploded");

    await assert.rejects(
      () =>
        persistCompletedAnalysis(
          createFakeClient() as never,
          completionJob,
          completionResult(impact) as never,
          15,
        ),
      (error: Error) => {
        assert.match(error.message, /Atomic persistence failed: permission denied/);
        assert.equal(error.message.includes("delete exploded"), false);
        return true;
      },
    );

    const row = (getStore() as { analyses: Array<Record<string, unknown>> }).analyses[0];
    assert.equal(row.status, "running");
    assert.deepEqual(row.context_stats, { sentinel: true });
    assert.equal(
      (getStore() as { risk_factors: unknown[] }).risk_factors.length,
      1,
    );
    assert.equal(analysisEvents().length, 0);
  });
});

describe("parsePersistedImpactGraph", () => {
  test("rejects unsupported versions and values that are not a graph", async () => {
    const impact = await sampleImpact();
    const graph = jsonClone(impact.impactGraph);
    assert.equal(parsePersistedImpactGraph(undefined), null);
    assert.equal(parsePersistedImpactGraph(null), null);
    assert.equal(parsePersistedImpactGraph("graph"), null);
    assert.equal(parsePersistedImpactGraph([]), null);
    assert.equal(parsePersistedImpactGraph({ ...graph, version: 2 }), null);
    assert.equal(parsePersistedImpactGraph({ ...graph, version: "1" }), null);
    assert.equal(parsePersistedImpactGraph({ ...graph, nodes: undefined }), null);
  });
});

describe("getAnalysisDetail impact graph hydration", () => {
  test("returns a version-1 graph with nodes, edges, and nested metadata", async () => {
    await loadServices();
    const impact = await sampleImpact();
    const stats = jsonClone(persistedStats(impact));
    seedAnalysis({ contextStats: stats });

    const detail = await loadDetail();
    assert.ok(detail);
    assert.deepEqual(detail.impactGraph, (stats.impact as { graph: unknown }).graph);
    assert.equal(detail.impactGraph?.version, 1);
    assert.ok((detail.impactGraph?.nodes.length ?? 0) >= 2);
    assert.ok((detail.impactGraph?.edges.length ?? 0) >= 1);
    assert.ok(Array.isArray(detail.impactGraph?.metadata.cycleGroups));
    const dependent = detail.impactGraph?.nodes.find((node) => node.id === "src/b.ts");
    assert.equal(dependent?.category, "direct_dependent");
    assert.deepEqual(dependent?.depthByOrigin, { "src/a.ts": 1 });
    assert.equal(
      detail.finalDecisionResult.reasons.some((reason) =>
        reason.message.includes(impact.explanation),
      ),
      true,
    );
  });

  test("historical rows without a graph hydrate the summary and no graph", async () => {
    await loadServices();
    seedAnalysis({
      contextStats: {
        filesChanged: 1,
        linesAdded: 1,
        linesDeleted: 0,
        filesIncludedInAi: 1,
        filesExcludedFromAi: 0,
        truncatedPatches: false,
        baseSha: "legacy-base",
        impact: {
          classification: "MEDIUM",
          confidence: 0.64,
          explanation: "FLAT_SUMMARY_ONLY",
          directDependents: 4,
          totalDependents: 9,
          routes: ["src/app/page.tsx"],
          graphMeta: {
            scannedFiles: 10,
            parsedFiles: 8,
            truncated: false,
            fetchErrors: 0,
          },
        },
      },
      affectedAreas: [
        {
          id: "area-1",
          analysis_id: ANALYSIS_ID,
          file_path: "src/app/page.tsx",
          affected_area: "UI",
          impact_type: "direct_dependency",
          confidence: 0.5,
          explanation: "imports the changed file",
        },
      ],
    });

    const detail = await loadDetail();
    assert.ok(detail);
    assert.equal(detail.impactGraph, null);
    assert.equal(detail.impactClassification, "MEDIUM");
    assert.equal(detail.affectedAreas.length, 1);
    assert.equal(detail.affectedAreas[0].filePath, "src/app/page.tsx");
    assert.equal(
      detail.finalDecisionResult.reasons.some((reason) =>
        reason.message.includes("FLAT_SUMMARY_ONLY"),
      ),
      true,
    );
    assert.equal(
      detail.impactGraph === null && detail.affectedAreas.length === 1,
      true,
    );
  });

  test("a null context_stats row still loads", async () => {
    await loadServices();
    seedAnalysis({ contextStats: null });
    const detail = await loadDetail();
    assert.ok(detail);
    assert.equal(detail.impactGraph, null);
    assert.equal(detail.findings.length, 0);
  });

  test("invalid graphs do not crash retrieval", async () => {
    await loadServices();
    const impact = await sampleImpact();
    const base = jsonClone(persistedStats(impact));
    const validGraph = jsonClone(
      (base.impact as { graph: ImpactGraphData }).graph,
    );

    const cases: Array<{ name: string; graph: unknown }> = [
      {
        name: "missing required fields",
        graph: { version: 1, edges: validGraph.edges, metadata: validGraph.metadata },
      },
      {
        name: "invalid node",
        graph: {
          ...validGraph,
          nodes: validGraph.nodes.map((node, index) =>
            index === 0 ? { ...node, category: "broken" } : node,
          ),
        },
      },
      {
        name: "invalid edge",
        graph: {
          ...validGraph,
          edges: validGraph.edges.map((edge, index) =>
            index === 0 ? { ...edge, structuralRole: "causes" } : edge,
          ),
        },
      },
      {
        name: "edge endpoint missing from nodes",
        graph: {
          ...validGraph,
          edges: validGraph.edges.map((edge, index) =>
            index === 0
              ? { ...edge, id: "missing.ts->src/b.ts", from: "missing.ts" }
              : edge,
          ),
        },
      },
      {
        name: "malformed metadata",
        graph: { ...validGraph, metadata: { ...validGraph.metadata, cycleGroups: "none" } },
      },
      {
        name: "metadata missing a required flag",
        graph: {
          ...validGraph,
          metadata: { ...validGraph.metadata, provenanceTruncated: undefined },
        },
      },
      {
        name: "unsupported version",
        graph: { ...validGraph, version: 2 },
      },
    ];

    for (const item of cases) {
      const stats = jsonClone(base);
      (stats.impact as { graph: unknown }).graph = item.graph;
      seedAnalysis({ contextStats: stats });
      const detail = await loadDetail();
      assert.ok(detail, item.name);
      assert.equal(detail.impactGraph, null, item.name);
      assert.equal(detail.impactClassification, impact.impactClassification, item.name);
      assert.equal(
        detail.finalDecisionResult.reasons.some((reason) =>
          reason.message.includes(impact.explanation),
        ),
        true,
        item.name,
      );
    }
  });
});

describe("recordHumanOverride failure paths", () => {
  test("a context_stats select error does not write", async () => {
    await loadServices();
    const impact = await sampleImpact();
    const stats = jsonClone(persistedStats(impact));
    seedAnalysis({ contextStats: stats });
    const before = jsonClone(storedContextStats());
    failAnalysesPointRead(2, "connection reset");

    const recorded = await recordHumanOverride({
      userId: USER_ID,
      analysisId: ANALYSIS_ID,
      action: "approve",
      note: "Ship it",
    });

    assert.equal(recorded.ok, false);
    assert.equal(recorded.ok ? "" : recorded.code, "db_error");
    assert.match(recorded.ok ? "" : recorded.error, /connection reset/);
    assert.equal(analysesUpdates().length, 0);
    assert.deepEqual(storedContextStats(), before);
    assert.equal(
      (getStore() as { analysis_events: unknown[] }).analysis_events.length,
      0,
    );
  });

  test("a missing analysis row does not write", async () => {
    await loadServices();
    const impact = await sampleImpact();
    seedAnalysis({ contextStats: jsonClone(persistedStats(impact)) });
    const before = jsonClone(storedContextStats());
    failAnalysesPointRead(2, null);

    const recorded = await recordHumanOverride({
      userId: USER_ID,
      analysisId: ANALYSIS_ID,
      action: "approve",
      note: "Ship it",
    });

    assert.equal(recorded.ok, false);
    assert.equal(recorded.ok ? "" : recorded.code, "not_found");
    assert.equal(analysesUpdates().length, 0);
    assert.deepEqual(storedContextStats(), before);
  });

  test("malformed context_stats is not replaced", async () => {
    await loadServices();
    seedAnalysis({ contextStats: ["not-an-object"] });

    const recorded = await recordHumanOverride({
      userId: USER_ID,
      analysisId: ANALYSIS_ID,
      action: "keep_blocked",
      note: "No",
    });

    assert.equal(recorded.ok, false);
    assert.equal(recorded.ok ? "" : recorded.code, "db_error");
    assert.match(recorded.ok ? "" : recorded.error, /malformed/);
    assert.equal(analysesUpdates().length, 0);
    assert.deepEqual(storedContextStats(), ["not-an-object"]);
  });

  test("an update error is not reported as success", async () => {
    await loadServices();
    const impact = await sampleImpact();
    const stats = jsonClone(persistedStats(impact));
    seedAnalysis({ contextStats: stats });
    const before = jsonClone(storedContextStats());
    failAnalysesUpdate("write failed");

    const recorded = await recordHumanOverride({
      userId: USER_ID,
      analysisId: ANALYSIS_ID,
      action: "approve",
      note: "Ship it",
    });

    assert.equal(recorded.ok, false);
    assert.equal(recorded.ok ? "" : recorded.code, "db_error");
    assert.match(recorded.ok ? "" : recorded.error, /write failed/);
    assert.equal("data" in recorded, false);
    assert.deepEqual(storedContextStats(), before);
    assert.equal(
      (getStore() as { analysis_events: unknown[] }).analysis_events.length,
      0,
    );
  });

  test("an update that matches zero rows returns not_found", async () => {
    await loadServices();
    const impact = await sampleImpact();
    const stats = jsonClone(persistedStats(impact));
    seedAnalysis({ contextStats: stats });
    const before = jsonClone(storedContextStats());
    setZeroRowAnalysesUpdate(true);

    const recorded = await recordHumanOverride({
      userId: USER_ID,
      analysisId: ANALYSIS_ID,
      action: "approve",
      note: "Ship it",
    });

    assert.equal(recorded.ok, false);
    assert.equal(recorded.ok ? "" : recorded.code, "not_found");
    assert.equal("data" in recorded, false);
    assert.deepEqual(storedContextStats(), before);
    assert.equal(analysisEvents().length, 0);
  });
});

describe("risk factor persistence invariant", () => {
  test("sensitive areas do not create risk factors without findings", () => {
    const empty = computeRiskFromFindings([], {
      sensitiveAreas: [
        "Authentication",
        "Database",
        "Infrastructure",
        "Configuration",
      ],
    } as never);
    assert.equal(empty.factors.length, 0);
    assert.ok(empty.riskScore > 0);

    const one = computeRiskFromFindings(
      [
        {
          category: "SECURITY",
          severity: "low",
          title: "Token logged",
          summary: "A token is logged",
          explanation: "The log includes a token",
          evidence: "console.log(token)",
          affectedFiles: ["src/a.ts"],
          confidence: 0.4,
          isInference: false,
        },
      ],
      null,
    );
    assert.equal(one.factors.length, 1);
    assert.equal(one.factors[0].title, "Token logged");
  });

  test("sequential fallback writes factors only alongside findings", async () => {
    await loadServices();
    const impact = await sampleImpact();
    seedAnalysis({ contextStats: { sentinel: true } });
    setRpcError(
      "Could not find the function public.complete_analysis_atomic in the schema cache",
    );
    const result = completionResult(impact);
    result.ai.findings = [
      {
        category: "SECURITY",
        severity: "low",
        title: "Token logged",
        summary: "A token is logged",
        explanation: "The log includes a token",
        evidence: "console.log(token)",
        affectedFiles: ["src/a.ts"],
        confidence: 0.4,
        isInference: false,
      },
    ] as never;
    result.risk.factors = [
      {
        category: "security",
        severity: "low",
        scoreContribution: 8,
        title: "Token logged",
        description: "The log includes a token",
        sourceFile: "src/a.ts",
        metadata: {},
      },
    ] as never;

    await persistCompletedAnalysis(
      createFakeClient() as never,
      completionJob,
      result as never,
      15,
    );

    assert.equal(
      (getStore() as { analysis_findings: unknown[] }).analysis_findings.length,
      1,
    );
    assert.equal(
      (getStore() as { risk_factors: Array<{ title: string }> }).risk_factors[0].title,
      "Token logged",
    );
  });
});

describe("recordHumanOverride preserves the impact graph", () => {
  test("keeps the graph and summary after the real update path", async () => {
    await loadServices();
    const impact = await sampleImpact();
    const stats = jsonClone(persistedStats(impact));
    seedAnalysis({ contextStats: stats });

    const before = await loadDetail();
    assert.ok(before?.impactGraph);
    const graphBefore = jsonClone(before.impactGraph);
    const summaryBefore = jsonClone(
      (getStore() as { analyses: Array<{ context_stats: { impact: unknown } }> })
        .analyses[0].context_stats.impact,
    );

    const recorded = await recordHumanOverride({
      userId: USER_ID,
      analysisId: ANALYSIS_ID,
      action: "approve",
      note: "Ship it",
    });
    assert.equal(recorded.ok, true, recorded.ok ? "" : recorded.error);
    assert.equal(recorded.ok && recorded.data.override.action, "approve");
    assert.equal(recorded.ok && recorded.data.override.note, "Ship it");
    assert.equal(recorded.ok && recorded.data.override.actorUserId, USER_ID);
    assert.equal(
      recorded.ok && recorded.data.override.originalDecision,
      before.finalDecisionResult.finalDecision,
    );

    const stored = (
      getStore() as {
        analyses: Array<{
          context_stats: {
            filesChanged: number;
            baseSha: string;
            impact: Record<string, unknown>;
            humanOverride: { action: string; note: string; originalDecision: string };
            intentScope: { taskSummary: string };
          };
        }>;
      }
    ).analyses[0].context_stats;

    assert.equal(stored.filesChanged, 1);
    assert.equal(stored.baseSha, "base-sha");
    assert.equal(stored.intentScope.taskSummary, "keep-intent");
    assert.equal(stored.humanOverride.action, "approve");
    assert.equal(stored.humanOverride.note, "Ship it");
    assert.equal(
      stored.humanOverride.originalDecision,
      before.finalDecisionResult.finalDecision,
    );
    assert.deepEqual(stored.impact.classification, (summaryBefore as { classification: unknown }).classification);
    assert.deepEqual(stored.impact.confidence, (summaryBefore as { confidence: unknown }).confidence);
    assert.deepEqual(stored.impact.explanation, (summaryBefore as { explanation: unknown }).explanation);
    assert.deepEqual(
      stored.impact.directDependents,
      (summaryBefore as { directDependents: unknown }).directDependents,
    );
    assert.deepEqual(
      stored.impact.totalDependents,
      (summaryBefore as { totalDependents: unknown }).totalDependents,
    );
    assert.deepEqual(stored.impact.routes, (summaryBefore as { routes: unknown }).routes);
    assert.deepEqual(stored.impact.graphMeta, (summaryBefore as { graphMeta: unknown }).graphMeta);
    assert.deepEqual(stored.impact.graph, graphBefore);

    const after = await loadDetail();
    assert.ok(after);
    assert.deepEqual(after.impactGraph, graphBefore);
    assert.equal(after.humanOverride?.action, "approve");
    assert.equal(after.humanOverride?.note, "Ship it");
    assert.equal(after.humanOverride?.actorUserId, USER_ID);
    assert.equal(
      after.humanOverride?.originalDecision,
      before.finalDecisionResult.finalDecision,
    );
    assert.equal(after.finalDecision, before.finalDecision);
    assert.equal(after.impactClassification, before.impactClassification);
    assert.equal(
      after.finalDecisionResult.reasons.some((reason) =>
        reason.message.includes(impact.explanation),
      ),
      true,
    );
  });
});
