/**
 * Impact Graph engine tests — exercise production code in impact-graph.ts,
 * import-graph.ts, parse-imports.ts, and index.ts.
 *
 * Run:
 *   node --no-warnings --import ./scripts/ts-test-loader.mjs --test src/lib/analysis/impact/__tests__/impact-graph.test.ts
 *
 * Scenarios 12 (recordHumanOverride preserves graph) and 13 (legacy
 * context_stats fallback) cover Stage 2 persistence code and are added there.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildImpactGraphData,
  buildImpactImportIndex,
  buildReverseImportGraph,
  classifyModuleArea,
  collectDependents,
  isRouteLikePath,
  reconstructNodePaths,
  stronglyConnectedComponents,
  type BuildImpactGraphInput,
  type ImpactGraphData,
  type ImpactGraphEdge,
  type ImpactGraphNode,
} from "@/lib/analysis/impact/import-graph";
import { analyzeImpact } from "@/lib/analysis/impact";
import { extractImportSpecifiers } from "@/lib/analysis/impact/parse-imports";
import { computeRiskFromFindings } from "@/lib/analysis/risk";
import type {
  ChangedFileEvidence,
  DeterministicAnalysisResult,
  StructuredFinding,
} from "@/lib/analysis/types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Short name → `src/<name>.ts`; anything containing "/" or "." is a full path. */
function p(name: string): string {
  return name.includes("/") || name.includes(".") ? name : `src/${name}.ts`;
}

/** `{ a: ["x"] }` means src/a.ts imports ./x (src/x.ts). */
function repo(
  spec: Record<string, string[]>,
  extra: Record<string, string> = {},
): Map<string, string> {
  const files = new Map<string, string>();
  for (const [name, deps] of Object.entries(spec)) {
    files.set(p(name), deps.map((d, i) => `import m${i} from "./${d}";`).join("\n"));
  }
  for (const [filePath, source] of Object.entries(extra)) files.set(filePath, source);
  return files;
}

function changed(name: string, overrides: Partial<ChangedFileEvidence> = {}): ChangedFileEvidence {
  return {
    path: p(name),
    previousPath: null,
    status: "modified",
    additions: 3,
    deletions: 1,
    category: "backend",
    isBinary: false,
    excludedFromAi: false,
    ...overrides,
  };
}

function build(
  spec: Record<string, string[]>,
  changedNames: string[],
  options: Partial<BuildImpactGraphInput> = {},
): ImpactGraphData {
  return buildImpactGraphData({
    files: repo(spec),
    changedFiles: changedNames.map((n) => changed(n)),
    ...options,
  });
}

function node(graph: ImpactGraphData, name: string): ImpactGraphNode {
  const found = graph.nodes.find((n) => n.id === p(name));
  assert.ok(found, `expected node ${p(name)}`);
  return found;
}

function hasNode(graph: ImpactGraphData, name: string): boolean {
  return graph.nodes.some((n) => n.id === p(name));
}

function findEdge(graph: ImpactGraphData, from: string, to: string): ImpactGraphEdge | undefined {
  return graph.edges.find((e) => e.id === `${p(from)}->${p(to)}`);
}

function edge(graph: ImpactGraphData, from: string, to: string): ImpactGraphEdge {
  const found = findEdge(graph, from, to);
  assert.ok(found, `expected edge ${p(from)}->${p(to)}`);
  return found;
}

const ps = (...names: string[]) => names.map(p);

// ---------------------------------------------------------------------------
// Base scenarios (1–11, 14)
// ---------------------------------------------------------------------------

describe("impact graph — base scenarios", () => {
  test("1. direct 1-hop dependent", () => {
    const g = build({ x: [], a: ["x"] }, ["x"]);
    const a = node(g, "a");
    assert.equal(a.category, "direct_dependent");
    assert.equal(a.depth, 1);
    assert.deepEqual(a.depthByOrigin, { [p("x")]: 1 });
    const e = edge(g, "x", "a");
    assert.equal(e.structuralRole, "primary");
    assert.deepEqual(e.shortestForOrigins, ps("x"));
    assert.equal(e.minOriginHop, 1);
    assert.equal(node(g, "x").category, "changed");
    assert.equal(node(g, "x").depth, 0);
  });

  test("2. 2-hop and 3-hop indirect dependents", () => {
    const g = build({ x: [], a: ["x"], b: ["a"], c: ["b"] }, ["x"]);
    assert.equal(node(g, "b").category, "indirect_dependent");
    assert.equal(node(g, "b").depth, 2);
    assert.equal(node(g, "c").category, "indirect_dependent");
    assert.equal(node(g, "c").depth, 3);
    assert.equal(edge(g, "b", "c").minOriginHop, 3);
  });

  test("3. depth cap excludes hop 4", () => {
    const g = build({ x: [], a: ["x"], b: ["a"], c: ["b"], e: ["c"] }, ["x"]);
    assert.equal(hasNode(g, "e"), false);
    assert.equal(findEdge(g, "c", "e"), undefined);
    assert.equal(g.edges.length, 3);
  });

  test("4. diamond shared dependency keeps the same-tier edge as secondary", () => {
    const g = build({ x: [], a: ["x"], b: ["x", "a"] }, ["x"]);
    assert.equal(node(g, "b").depth, 1);
    const ab = edge(g, "a", "b");
    assert.equal(ab.structuralRole, "secondary");
    assert.equal(ab.isSameTierEdge, true);
    assert.equal(ab.isBackTierEdge, false);
    assert.equal(ab.minOriginHop, null);
    assert.equal(ab.isCycleEdge, false);
  });

  test("5. multi-origin uneven hops", () => {
    const g = build({ x: [], y: [], d: ["y"], m: ["x", "d"] }, ["x", "y"]);
    const m = node(g, "m");
    assert.deepEqual(m.depthByOrigin, { [p("x")]: 1, [p("y")]: 2 });
    assert.deepEqual(m.originChangedFiles, ps("x", "y"));
    assert.equal(m.depth, 1);
    const dm = edge(g, "d", "m");
    assert.equal(dm.structuralRole, "multi_origin");
    assert.deepEqual(dm.shortestForOrigins, ps("y"));
    assert.equal(dm.minOriginHop, 2);
    assert.equal(edge(g, "x", "m").structuralRole, "primary");
  });

  test("6. changed→changed edge keeps changed precedence and is excluded from dependent counts", async () => {
    const g = build({ x: [], y: ["x"], a: ["y"] }, ["x", "y"]);
    assert.equal(edge(g, "x", "y").structuralRole, "changed_to_changed");
    const y = node(g, "y");
    assert.equal(y.category, "changed");
    assert.equal(y.depth, 0);
    assert.deepEqual(y.depthByOrigin, { [p("x")]: 1 });
    const a = node(g, "a");
    assert.deepEqual(a.depthByOrigin, { [p("x")]: 2, [p("y")]: 1 });
    assert.equal(g.metadata.directDependentNodeCount, 1);
    assert.equal(g.metadata.indirectDependentNodeCount, 0);
    assert.equal(edge(g, "y", "a").structuralRole, "primary");

    const impactResult = await analyzeImpact({
      owner: "acme",
      repo: "veris",
      installationId: 1,
      headSha: "abc123456789",
      changedFiles: [changed("x"), changed("y")],
      prefetchedSources: repo({ x: [], y: ["x"], a: ["y"] }),
    });
    assert.equal(impactResult.directDependencyCount, 1);
    assert.equal(impactResult.indirectDependencyCount, 0);
    assert.equal(impactResult.totalDependencyCount, 1);
    assert.equal(
      impactResult.affectedAreas.some(
        (area) =>
          (area.filePath === p("x") || area.filePath === p("y")) &&
          (area.impactType === "direct_dependent" ||
            area.impactType === "indirect_dependent"),
      ),
      false,
    );
    assert.equal(
      edge(impactResult.impactGraph, "x", "y").structuralRole,
      "changed_to_changed",
    );
  });

  test("7. route detection", () => {
    const g = buildImpactGraphData({
      files: new Map([
        ["src/lib/x.ts", "export const x = 1;"],
        ["src/app/dashboard/page.tsx", `import { x } from "@/lib/x";`],
      ]),
      changedFiles: [changed("src/lib/x.ts")],
    });
    const page = node(g, "src/app/dashboard/page.tsx");
    assert.equal(page.isRoute, true);
    assert.equal(page.area, "Route");
    assert.equal(node(g, "src/lib/x.ts").isRoute, false);
  });

  test("8. external specifiers are ignored and not counted as unresolved", () => {
    const g = buildImpactGraphData({
      files: new Map([
        ["src/x.ts", ""],
        [
          "src/a.ts",
          [
            `import React from "react";`,
            `import { createClient } from "@supabase/supabase-js";`,
            `import fs from "node:fs";`,
            `import x from "./x";`,
          ].join("\n"),
        ],
      ]),
      changedFiles: [changed("x")],
    });
    assert.equal(g.nodes.length, 2);
    assert.equal(g.edges.length, 1);
    assert.equal(node(g, "a").unresolvedImportCount, 0);
  });

  test("9. @/ alias and barrel index resolution", () => {
    const g = buildImpactGraphData({
      files: new Map([
        ["src/lib/util.ts", "export const u = 1;"],
        ["src/lib/index.ts", `export * from "./util";`],
        ["src/feature/consumer.ts", `import { u } from "@/lib";`],
      ]),
      changedFiles: [changed("src/lib/util.ts")],
    });
    assert.equal(node(g, "src/lib/index.ts").depth, 1);
    assert.equal(node(g, "src/feature/consumer.ts").depth, 2);
    edge(g, "src/lib/index.ts", "src/feature/consumer.ts");
  });

  test("10. non-source changed files are represented as unmapped changed nodes", () => {
    const g = buildImpactGraphData({
      files: repo({ x: [], a: ["x"] }),
      changedFiles: [
        changed("x"),
        changed("README.md", { category: "documentation" }),
        changed("supabase/migrations/001.sql", { category: "database" }),
      ],
    });
    assert.deepEqual(g.metadata.unmappedChangedFiles, ["README.md", "supabase/migrations/001.sql"]);
    for (const id of ["README.md", "supabase/migrations/001.sql"]) {
      const n = node(g, id);
      assert.equal(n.category, "changed");
      assert.equal(n.analysisStatus, "non_source");
      assert.equal(n.unresolvedImportCount, null);
      assert.deepEqual(n.originChangedFiles, []);
      assert.equal(g.edges.some((e) => e.from === id || e.to === id), false);
    }
    assert.equal(g.metadata.changedFileCount, 3);
    assert.equal(g.metadata.changedSourceNodeCount, 1);
  });

  test("11. zero-dependent PR yields an isolated analyzed changed node", () => {
    const g = build({ x: [], other: [] }, ["x"]);
    assert.equal(g.nodes.length, 1);
    assert.equal(g.edges.length, 0);
    const x = node(g, "x");
    assert.equal(x.analysisStatus, "analyzed");
    assert.equal(x.unresolvedImportCount, 0);
    assert.equal(x.provenanceComplete, true);
  });

  test("14. risk score is invariant to graph shape; builder is pure and deterministic", () => {
    const findings: StructuredFinding[] = [
      {
        category: "RELIABILITY",
        severity: "medium",
        title: "Unchecked error path",
        summary: "s",
        explanation: "e",
        evidence: "src/x.ts: missing catch",
        affectedFiles: ["src/x.ts"],
        confidence: 0.8,
        isInference: false,
      },
    ];
    const deterministic: DeterministicAnalysisResult = {
      filesChanged: 1,
      linesAdded: 3,
      linesDeleted: 1,
      categories: { backend: 1 },
      sensitiveAreas: [],
      hasTests: false,
      changedFiles: [changed("x")],
    };
    const before = computeRiskFromFindings(findings, deterministic);

    const sparseSpec = { x: [], a: ["x"] };
    const denseSpec: Record<string, string[]> = { x: [] };
    for (let i = 0; i < 30; i += 1) denseSpec[`d${i}`] = ["x", ...(i > 0 ? [`d${i - 1}`] : [])];

    const sparseFiles = repo(sparseSpec);
    const changedFiles = [changed("x")];
    const changedSnapshot = JSON.stringify(changedFiles);
    const sparse1 = buildImpactGraphData({ files: sparseFiles, changedFiles });
    const sparse2 = buildImpactGraphData({ files: sparseFiles, changedFiles });
    const dense = build(denseSpec, ["x"]);

    assert.deepEqual(sparse1, sparse2, "builder must be deterministic");
    assert.equal(sparseFiles.size, 2, "files map must not be mutated");
    assert.equal(JSON.stringify(changedFiles), changedSnapshot, "changedFiles must not be mutated");
    assert.ok(dense.nodes.length > sparse1.nodes.length);
    assert.deepEqual(computeRiskFromFindings(findings, deterministic), before);
    assert.equal(JSON.stringify(dense).toLowerCase().includes("risk"), false);
  });
});

// ---------------------------------------------------------------------------
// Cycle semantics (15–17, 24, 30)
// ---------------------------------------------------------------------------

describe("impact graph — cycles", () => {
  test("15. backwards-tier edge in a DAG is not a cycle edge", () => {
    const g = build({ x: [], y: [], a: ["y"], b: ["a"], m: ["x", "b"] }, ["x", "y"]);
    const bm = edge(g, "b", "m");
    assert.equal(node(g, "b").depth, 2);
    assert.equal(node(g, "m").depth, 1);
    assert.equal(bm.isBackTierEdge, true);
    assert.equal(bm.structuralRole, "multi_origin");
    assert.deepEqual(bm.shortestForOrigins, ps("y"));
    assert.equal(bm.minOriginHop, 3);
    assert.equal(bm.isCycleEdge, false);
    assert.equal(bm.cycleGroupId, null);
    assert.equal(g.metadata.cycleGroupCount, 0);
    assert.ok(g.nodes.every((n) => n.cycleGroupId === null && n.cycleComplete === null));
  });

  test("16a. two-node mutual cycle across tiers", () => {
    const g = build({ x: [], a: ["x", "b"], b: ["a"] }, ["x"]);
    for (const n of ["a", "b"]) {
      assert.equal(node(g, n).cycleGroupId, "cycle-1");
      assert.equal(node(g, n).cycleComplete, true);
    }
    const ab = edge(g, "a", "b");
    const ba = edge(g, "b", "a");
    assert.equal(ab.structuralRole, "primary");
    assert.equal(ab.minOriginHop, 2);
    assert.equal(ba.structuralRole, "secondary");
    assert.equal(ba.minOriginHop, null);
    assert.equal(ba.isBackTierEdge, true);
    assert.equal(ab.isCycleEdge && ba.isCycleEdge, true);
    assert.equal(node(g, "x").cycleGroupId, null);
  });

  test("16b. same-tier mutual cycle", () => {
    const g = build({ x: [], a1: ["x", "a2"], a2: ["x", "a1"] }, ["x"]);
    for (const [from, to] of [["a1", "a2"], ["a2", "a1"]] as const) {
      const e = edge(g, from, to);
      assert.equal(e.isSameTierEdge, true);
      assert.equal(e.isBackTierEdge, false);
      assert.equal(e.isCycleEdge, true);
      assert.equal(e.structuralRole, "secondary");
      assert.equal(e.minOriginHop, null);
    }
  });

  test("17. depth-3 boundary edges are included and close cycles", () => {
    const g = build(
      { x: [], a: ["x", "c"], b: ["a"], c: ["b"], c2: ["b", "c"] },
      ["x"],
    );
    assert.equal(node(g, "c").depth, 3);
    assert.equal(node(g, "c2").depth, 3);
    const ca = edge(g, "c", "a"); // originates at depth 3
    const cc2 = edge(g, "c", "c2"); // depth 3 → depth 3
    assert.equal(ca.isCycleEdge, true);
    assert.equal(ca.isBackTierEdge, true);
    assert.equal(cc2.isSameTierEdge, true);
    assert.equal(cc2.isCycleEdge, false);
    assert.equal(cc2.structuralRole, "secondary");
    assert.equal(cc2.minOriginHop, null);
    for (const n of ["a", "b", "c"]) assert.equal(node(g, n).cycleGroupId, "cycle-1");
    assert.equal(node(g, "c2").cycleGroupId, null);
    for (const [f, t] of [["a", "b"], ["b", "c"], ["c", "a"]] as const) {
      assert.equal(edge(g, f, t).isCycleEdge, true);
    }
    assert.equal(g.metadata.cycleGroupCount, 1);
  });

  test("24. partially retained cycle is reported as incomplete and no longer strongly connected", () => {
    const spec = { x: [], a: ["x", "c"], b: ["a"], c: ["b"] };
    const full = build(spec, ["x"]);
    const cut = build(spec, ["x"], { maxEdges: 3 });

    // Original eligible graph: the cycle is complete and strongly connected.
    assert.deepEqual(full.metadata.cycleGroups[0], {
      id: "cycle-1",
      nodeIds: ps("a", "b", "c"),
      totalEdgeCount: 3,
      retainedEdgeCount: 3,
      omittedEdgeCount: 0,
      isComplete: true,
      remainsStronglyConnected: true,
    });

    // Truncated: X→A, A→B, B→C kept; C→A omitted.
    assert.deepEqual(cut.edges.map((e) => e.id).sort(), [
      `${p("a")}->${p("b")}`,
      `${p("b")}->${p("c")}`,
      `${p("x")}->${p("a")}`,
    ]);
    assert.equal(findEdge(cut, "c", "a"), undefined);
    const group = cut.metadata.cycleGroups[0];
    assert.equal(group.totalEdgeCount, 3);
    assert.equal(group.retainedEdgeCount, 2);
    assert.equal(group.omittedEdgeCount, 1);
    assert.equal(group.isComplete, false);
    assert.equal(cut.metadata.cycleGroups[0].remainsStronglyConnected, false);
    assert.equal(cut.metadata.cyclesTruncated, true);
    assert.equal(cut.metadata.cycleGroupCount, 1);
    for (const n of ["a", "b", "c"]) {
      assert.equal(node(cut, n).cycleGroupId, "cycle-1");
      assert.equal(node(cut, n).cycleComplete, false);
    }

    // Independent verification with the SCC routine.
    const members = ps("a", "b", "c");
    const adjacencyOf = (edges: ImpactGraphEdge[]) => {
      const adj = new Map<string, string[]>();
      for (const e of edges) {
        if (!members.includes(e.from) || !members.includes(e.to)) continue;
        adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
      }
      return adj;
    };
    const fullSccs = stronglyConnectedComponents(members, adjacencyOf(full.edges));
    const cutSccs = stronglyConnectedComponents(members, adjacencyOf(cut.edges));
    assert.deepEqual(fullSccs, [members]);
    assert.equal(cutSccs.length, 3);
  });

  test("30. Phase 3 retains cycle edges ahead of non-cycle secondary edges under truncation", () => {
    // 7 eligible edges:
    // - 4 primary: x->a, x->d1, x->d2, a->b
    // - 1 cycle secondary: b->a (id "src/b.ts->src/a.ts")
    // - 2 non-cycle secondary: a->d1 (id "src/a.ts->src/d1.ts" < "src/b.ts->src/a.ts"), d1->d2
    // Under maxEdges: 5, Phase 1 takes the 4 primary edges, Phase 2 takes 0,
    // and Phase 3 must use the 5th slot for b->a rather than a->d1.
    const spec = {
      x: [],
      a: ["x", "b"],
      b: ["a"],
      d1: ["x", "a"],
      d2: ["x", "d1"],
    };
    const g = build(spec, ["x"], { maxEdges: 5 });

    assert.equal(g.metadata.eligibleEdgeCount, 7);
    assert.equal(g.edges.length, 5);
    assert.equal(g.metadata.edgesTruncated, true);
    assert.equal(g.metadata.omittedEdgesTotal, 2);

    const ba = edge(g, "b", "a");
    assert.equal(ba.isCycleEdge, true);
    assert.equal(ba.structuralRole, "secondary");
    assert.equal(findEdge(g, "a", "d1"), undefined);
    assert.equal(findEdge(g, "d1", "d2"), undefined);

    assert.equal(g.metadata.cycleGroupCount, 1);
    assert.equal(g.metadata.cyclesTruncated, false);
    assert.deepEqual(g.metadata.cycleGroups[0], {
      id: "cycle-1",
      nodeIds: ps("a", "b"),
      totalEdgeCount: 2,
      retainedEdgeCount: 2,
      omittedEdgeCount: 0,
      isComplete: true,
      remainsStronglyConnected: true,
    });
    assert.equal(node(g, "a").cycleComplete, true);
    assert.equal(node(g, "b").cycleComplete, true);

    // Multi-SCC competition: two 3-node SCCs (cycle-1: a1,a2,a3 with 4 intra-edges;
    // cycle-2: b1,b2,b3 with 3 intra-edges) compete when Phase 3 has only 1 slot left.
    // Primary edges (6): x->a1, a1->a2, a2->a3, x->b1, b1->b2, b2->b3.
    // Cycle secondary edges (3): a2->a1, a3->a1 (cycle-1), b3->b1 (cycle-2).
    // Under maxEdges: 7, Phase 1 takes 6 primary edges; Phase 3 keeps only a2->a1.
    const multiScc = build(
      {
        x: [],
        a1: ["x", "a3", "a2"],
        a2: ["a1"],
        a3: ["a2"],
        b1: ["x", "b3"],
        b2: ["b1"],
        b3: ["b2"],
      },
      ["x"],
      { maxEdges: 7 },
    );
    assert.equal(multiScc.metadata.eligibleEdgeCount, 9);
    assert.equal(multiScc.edges.length, 7);
    assert.equal(multiScc.metadata.cycleGroupCount, 2);
    assert.equal(multiScc.metadata.cyclesTruncated, true);
    assert.deepEqual(multiScc.metadata.cycleGroups, [
      {
        id: "cycle-1",
        nodeIds: ps("a1", "a2", "a3"),
        totalEdgeCount: 4,
        retainedEdgeCount: 3,
        omittedEdgeCount: 1,
        isComplete: false,
        remainsStronglyConnected: false,
      },
      {
        id: "cycle-2",
        nodeIds: ps("b1", "b2", "b3"),
        totalEdgeCount: 3,
        retainedEdgeCount: 2,
        omittedEdgeCount: 1,
        isComplete: false,
        remainsStronglyConnected: false,
      },
    ]);
    for (const n of ["a1", "a2", "a3", "b1", "b2", "b3"]) {
      assert.equal(node(multiScc, n).cycleComplete, false);
    }

    // Chorded 3-node SCC: ring a1->a2->a3->a1 plus chord a3->a2 (4 intra-edges).
    // Under maxEdges: 4, Phase 1 keeps x->a1, a1->a2, a2->a3; Phase 3 keeps a3->a1
    // and omits chord a3->a2. The retained subgraph remains strongly connected
    // even though the cycle group is not complete.
    const chordedScc = build(
      {
        x: [],
        a1: ["x", "a3"],
        a2: ["a1", "a3"],
        a3: ["a2"],
      },
      ["x"],
      { maxEdges: 4 },
    );
    assert.deepEqual(chordedScc.metadata.cycleGroups, [
      {
        id: "cycle-1",
        nodeIds: ps("a1", "a2", "a3"),
        totalEdgeCount: 4,
        retainedEdgeCount: 3,
        omittedEdgeCount: 1,
        isComplete: false,
        remainsStronglyConnected: true,
      },
    ]);
    assert.equal(chordedScc.metadata.cyclesTruncated, true);
  });
});

// ---------------------------------------------------------------------------
// Classification and provenance (18, 19, 25)
// ---------------------------------------------------------------------------

describe("impact graph — classification and provenance", () => {
  test("18. consecutive global depths do not imply a same-origin shortest path", () => {
    const g = build({ x: [], y: [], a: ["x", "d"], d: ["y"], b: ["y"], c: ["b", "a"] }, ["x", "y"]);
    assert.equal(node(g, "a").depth, 1);
    assert.equal(node(g, "c").depth, 2);
    const ac = edge(g, "a", "c");
    assert.deepEqual(ac.shortestForOrigins, ps("x"));
    assert.equal(ac.structuralRole, "primary");
    assert.equal(ac.minOriginHop, 2);

    const result = reconstructNodePaths(g, p("c"));
    const shortest = result.paths.filter((r) => r.isOriginShortest).map((r) => r.nodes);
    assert.deepEqual(shortest, [ps("x", "a", "c"), ps("y", "b", "c")]);
    const detour = result.paths.find((r) => r.nodes.join() === ps("y", "d", "a", "c").join());
    assert.ok(detour, "bounded alternative path should be listed");
    assert.equal(detour.isOriginShortest, false);
    assert.equal(detour.hopCount, 3);
    assert.equal(result.isExhaustive, true);
  });

  test("19. edge cap with distinct required witnesses; missing provenance propagates downstream", () => {
    const spec: Record<string, string[]> = { x1: [], x2: [], x3: [], x4: [], i1: ["d5"], i2: ["i1"] };
    for (let i = 1; i <= 5; i += 1) spec[`d${i}`] = ["x1", "x2", "x3", "x4"];
    const origins = ["x1", "x2", "x3", "x4"];

    // Proof that 12 edges cannot preserve all shortest paths: in the full
    // graph every D_i has exactly one witness per origin (Xj→D_i), so the 20
    // one-hop witnesses are pairwise distinct and all required.
    const full = build(spec, origins);
    assert.equal(full.metadata.eligibleEdgeCount, 22);
    for (let i = 1; i <= 5; i += 1) {
      const incoming = full.edges.filter((e) => e.to === p(`d${i}`));
      assert.equal(incoming.length, 4);
      assert.ok(incoming.every((e) => e.shortestForOrigins.length === 1));
      assert.equal(new Set(incoming.map((e) => e.shortestForOrigins[0])).size, 4);
    }
    assert.equal(full.metadata.provenanceTruncated, false);

    const g = build(spec, origins, { maxEdges: 12 });
    assert.equal(g.edges.length, 12);
    assert.equal(g.metadata.edgesTruncated, true);
    assert.equal(g.metadata.omittedEdgesTotal, 10);
    assert.equal(g.metadata.provenanceTruncated, true);

    // Phase 1 keeps every dependent connected to at least one origin.
    for (const n of ["d1", "d2", "d3", "d4", "d5", "i1", "i2"]) {
      assert.ok(node(g, n).missingOrigins.length < 4, `${n} must keep one origin`);
    }
    assert.equal(node(g, "d1").provenanceComplete, true);
    assert.deepEqual(node(g, "d2").missingOrigins, ps("x4"));
    assert.deepEqual(node(g, "d5").missingOrigins, ps("x2", "x3", "x4"));

    // Downstream propagation: I1/I2 lost no incoming edges, yet inherit D5's gaps.
    for (const n of ["i1", "i2"]) {
      const dep = node(g, n);
      assert.equal(dep.omittedIncomingEdgeCount, 0);
      assert.equal(dep.provenanceComplete, false);
      assert.deepEqual(dep.missingOrigins, ps("x2", "x3", "x4"));
    }

    // isExhaustive is conservative: D1 is complete, but the graph was truncated.
    const d1Paths = reconstructNodePaths(g, p("d1"));
    assert.equal(d1Paths.provenanceComplete, true);
    assert.equal(d1Paths.isExhaustive, false);
    const i2Paths = reconstructNodePaths(g, p("i2"));
    assert.deepEqual(i2Paths.paths.map((r) => r.nodes), [ps("x1", "d5", "i1", "i2")]);
    assert.equal(i2Paths.provenanceComplete, false);
    assert.deepEqual(i2Paths.missingOrigins, ps("x2", "x3", "x4"));
    assert.equal(i2Paths.isExhaustive, false);
  });

  test("25. shared witness edge propagates completeness only for origins complete upstream", () => {
    const spec = { x1: [], x2: [], d1: ["x1"], d2: ["x1"], u: ["x1", "x2"], v: ["u"] };
    const g = build(spec, ["x1", "x2"], { maxEdges: 4 });
    assert.deepEqual(g.edges.map((e) => e.id).sort(), [
      `${p("u")}->${p("v")}`,
      `${p("x1")}->${p("d1")}`,
      `${p("x1")}->${p("d2")}`,
      `${p("x1")}->${p("u")}`,
    ]);
    assert.deepEqual(edge(g, "u", "v").shortestForOrigins, ps("x1", "x2"));

    const u = node(g, "u");
    assert.deepEqual(u.missingOrigins, ps("x2"));
    const v = node(g, "v");
    assert.deepEqual(v.originChangedFiles, ps("x1", "x2"));
    assert.deepEqual(v.missingOrigins, ps("x2"));
    assert.equal(v.provenanceComplete, false);
    assert.equal(v.omittedIncomingEdgeCount, 0);

    const result = reconstructNodePaths(g, p("v"));
    assert.deepEqual(result.paths.map((r) => r.nodes), [ps("x1", "u", "v")]);
    assert.deepEqual(result.missingOrigins, ps("x2"));
    assert.equal(result.provenanceComplete, false);
    assert.equal(result.isExhaustive, false);
  });
});

// ---------------------------------------------------------------------------
// Path reconstruction (20, 26, 28)
// ---------------------------------------------------------------------------

describe("impact graph — path reconstruction", () => {
  test("20. cycles, multiple origins, and unknown target IDs return valid results", () => {
    const g = build({ x: [], y: [], a: ["x", "d"], d: ["y", "a"] }, ["x", "y"]);
    const result = reconstructNodePaths(g, p("a"));
    assert.equal(result.nodeId, p("a"));
    assert.equal(result.provenanceComplete, true);
    assert.deepEqual(result.missingOrigins, []);
    assert.equal(result.omittedIncomingEdgeCount, 0);
    assert.equal(result.pathsTruncatedByLimit, false);
    assert.equal(result.isExhaustive, true);

    const byNodes = new Map(result.paths.map((r) => [r.nodes.join(), r]));
    const xa = byNodes.get(ps("x", "a").join());
    const yda = byNodes.get(ps("y", "d", "a").join());
    assert.ok(xa && yda);
    assert.equal(xa.hopCount, 1);
    assert.equal(xa.isOriginShortest, true);
    assert.equal(xa.containsCycleEdge, false);
    assert.equal(yda.hopCount, 2);
    assert.equal(yda.isOriginShortest, true);
    assert.equal(yda.containsCycleEdge, true);
    for (const r of result.paths) {
      assert.equal(new Set(r.nodes).size, r.nodes.length, "paths must be simple");
      assert.equal(r.edgeIds.length, r.hopCount);
    }

    const missing = reconstructNodePaths(g, "src/missing.ts");
    assert.deepEqual(missing, {
      nodeId: "src/missing.ts",
      paths: [],
      provenanceComplete: true,
      missingOrigins: [],
      omittedIncomingEdgeCount: 0,
      pathsTruncatedByLimit: false,
      isExhaustive: true,
    });
  });

  test("26. maxTotalPaths is enforced across origins; per-origin limit reports truncation", () => {
    const g = build({ x1: [], x2: [], x3: [], t: ["x1", "x2", "x3"] }, ["x1", "x2", "x3"]);
    const capped = reconstructNodePaths(g, p("t"), { maxTotalPaths: 2 });
    assert.equal(capped.paths.length, 2);
    assert.deepEqual(
      capped.paths.map((r) => r.nodes),
      [ps("x1", "t"), ps("x2", "t")],
    );
    assert.equal(capped.provenanceComplete, true);
    assert.deepEqual(capped.missingOrigins, []);
    assert.equal(capped.omittedIncomingEdgeCount, 0);
    assert.equal(capped.pathsTruncatedByLimit, true);
    assert.equal(capped.isExhaustive, false);

    const all = reconstructNodePaths(g, p("t"), { maxTotalPaths: 3 });
    assert.equal(all.paths.length, 3);
    assert.equal(all.provenanceComplete, true);
    assert.deepEqual(all.missingOrigins, []);
    assert.equal(all.omittedIncomingEdgeCount, 0);
    assert.equal(all.pathsTruncatedByLimit, false);
    assert.equal(all.isExhaustive, true);

    // Per-origin state budgets are independent across origins while maxTotalPaths is global.
    const multiOriginChains = build(
      {
        x1: [],
        x2: [],
        a1: ["x1"],
        a2: ["x2"],
        t: ["a1", "a2"],
      },
      ["x1", "x2"],
    );
    const independentBudget = reconstructNodePaths(multiOriginChains, p("t"), {
      maxExpandedStatesPerOrigin: 2,
      maxTotalPaths: 2,
    });
    assert.deepEqual(
      independentBudget.paths.map((r) => r.nodes),
      [ps("x1", "a1", "t"), ps("x2", "a2", "t")],
    );
    assert.equal(independentBudget.provenanceComplete, true);
    assert.deepEqual(independentBudget.missingOrigins, []);
    assert.equal(independentBudget.omittedIncomingEdgeCount, 0);
    assert.equal(independentBudget.pathsTruncatedByLimit, false);
    assert.equal(independentBudget.isExhaustive, true);

    const fan = build({ x: [], a1: ["x"], a2: ["x"], a3: ["x"], t: ["a1", "a2", "a3"] }, ["x"]);
    const perOrigin = reconstructNodePaths(fan, p("t"), { maxPathsPerOrigin: 2 });
    assert.equal(perOrigin.paths.length, 2);
    assert.ok(perOrigin.paths.every((r) => r.isOriginShortest));
    assert.equal(perOrigin.provenanceComplete, true);
    assert.deepEqual(perOrigin.missingOrigins, []);
    assert.equal(perOrigin.omittedIncomingEdgeCount, 0);
    assert.equal(perOrigin.pathsTruncatedByLimit, true);
    assert.equal(perOrigin.isExhaustive, false);
  });

  test("28. maxExpandedStatesPerOrigin: exact state-budget semantics across 1-hop, 2-hop, 3-hop, cycles, detours, and missing origins", () => {
    // 1. Minimal 1-edge graph X -> A with maxExpandedStatesPerOrigin: 1
    const oneEdge = build({ x: [], a: ["x"] }, ["x"]);
    const oneResult = reconstructNodePaths(oneEdge, p("a"), {
      maxExpandedStatesPerOrigin: 1,
    });
    assert.deepEqual(oneResult, {
      nodeId: p("a"),
      paths: [
        {
          origin: p("x"),
          nodes: ps("x", "a"),
          edgeIds: [`${p("x")}->${p("a")}`],
          hopCount: 1,
          isOriginShortest: true,
          containsCycleEdge: false,
        },
      ],
      provenanceComplete: true,
      missingOrigins: [],
      omittedIncomingEdgeCount: 0,
      pathsTruncatedByLimit: false,
      isExhaustive: true,
    });

    // 2. Two-hop chain X -> A -> B with maxExpandedStatesPerOrigin: 2 (Pass B has no longer path)
    const twoHopChain = build({ x: [], a: ["x"], b: ["a"] }, ["x"]);
    const twoHopResult = reconstructNodePaths(twoHopChain, p("b"), {
      maxExpandedStatesPerOrigin: 2,
    });
    assert.deepEqual(twoHopResult, {
      nodeId: p("b"),
      paths: [
        {
          origin: p("x"),
          nodes: ps("x", "a", "b"),
          edgeIds: [`${p("x")}->${p("a")}`, `${p("a")}->${p("b")}`],
          hopCount: 2,
          isOriginShortest: true,
          containsCycleEdge: false,
        },
      ],
      provenanceComplete: true,
      missingOrigins: [],
      omittedIncomingEdgeCount: 0,
      pathsTruncatedByLimit: false,
      isExhaustive: true,
    });

    // 3. Two-hop diamond X -> A1 -> T, X -> A2 -> T with maxExpandedStatesPerOrigin: 3 (all shortest paths)
    // and maxExpandedStatesPerOrigin: 2 (genuine truncation when A2 remains unexplored).
    const twoHopDiamond = build(
      { x: [], a1: ["x"], a2: ["x"], t: ["a1", "a2"] },
      ["x"],
    );
    const diamondExact = reconstructNodePaths(twoHopDiamond, p("t"), {
      maxExpandedStatesPerOrigin: 3,
    });
    assert.deepEqual(diamondExact, {
      nodeId: p("t"),
      paths: [
        {
          origin: p("x"),
          nodes: ps("x", "a1", "t"),
          edgeIds: [`${p("x")}->${p("a1")}`, `${p("a1")}->${p("t")}`],
          hopCount: 2,
          isOriginShortest: true,
          containsCycleEdge: false,
        },
        {
          origin: p("x"),
          nodes: ps("x", "a2", "t"),
          edgeIds: [`${p("x")}->${p("a2")}`, `${p("a2")}->${p("t")}`],
          hopCount: 2,
          isOriginShortest: true,
          containsCycleEdge: false,
        },
      ],
      provenanceComplete: true,
      missingOrigins: [],
      omittedIncomingEdgeCount: 0,
      pathsTruncatedByLimit: false,
      isExhaustive: true,
    });

    const diamondTrunc = reconstructNodePaths(twoHopDiamond, p("t"), {
      maxExpandedStatesPerOrigin: 2,
    });
    assert.deepEqual(
      diamondTrunc.paths.map((r) => r.nodes),
      [ps("x", "a1", "t")],
    );
    assert.equal(diamondTrunc.provenanceComplete, true);
    assert.deepEqual(diamondTrunc.missingOrigins, []);
    assert.equal(diamondTrunc.omittedIncomingEdgeCount, 0);
    assert.equal(diamondTrunc.pathsTruncatedByLimit, true);
    assert.equal(diamondTrunc.isExhaustive, false);

    // 4. Two-hop target with a genuine valid 3-hop detour: X -> B -> T (2 hops) and X -> A -> B -> T (3 hops)
    const twoHopWithDetour = build(
      { x: [], a: ["x"], b: ["x", "a"], t: ["b"] },
      ["x"],
    );
    // Pass A takes 2 states (T, B) and Pass B takes 3 states (T, B, A) -> 5 states total.
    const detourComplete = reconstructNodePaths(twoHopWithDetour, p("t"), {
      maxExpandedStatesPerOrigin: 5,
    });
    assert.deepEqual(
      detourComplete.paths.map((r) => ({
        nodes: r.nodes,
        hopCount: r.hopCount,
        isOriginShortest: r.isOriginShortest,
      })),
      [
        { nodes: ps("x", "b", "t"), hopCount: 2, isOriginShortest: true },
        { nodes: ps("x", "a", "b", "t"), hopCount: 3, isOriginShortest: false },
      ],
    );
    assert.equal(detourComplete.provenanceComplete, true);
    assert.deepEqual(detourComplete.missingOrigins, []);
    assert.equal(detourComplete.omittedIncomingEdgeCount, 0);
    assert.equal(detourComplete.pathsTruncatedByLimit, false);
    assert.equal(detourComplete.isExhaustive, true);

    // With maxExpandedStatesPerOrigin: 2, Pass A completes [X, B, T], and Pass B genuinely truncates because [X, A, B, T] remains.
    const detourTruncated = reconstructNodePaths(twoHopWithDetour, p("t"), {
      maxExpandedStatesPerOrigin: 2,
    });
    assert.deepEqual(
      detourTruncated.paths.map((r) => r.nodes),
      [ps("x", "b", "t")],
    );
    assert.equal(detourTruncated.provenanceComplete, true);
    assert.deepEqual(detourTruncated.missingOrigins, []);
    assert.equal(detourTruncated.omittedIncomingEdgeCount, 0);
    assert.equal(detourTruncated.pathsTruncatedByLimit, true);
    assert.equal(detourTruncated.isExhaustive, false);

    // 5. One-hop target with a dead-end two-node cycle: X -> A, A -> U, U -> A
    const cycleDeadEnd = build({ x: [], a: ["x", "u"], u: ["a"] }, ["x"]);
    const cycleDeadEndResult = reconstructNodePaths(cycleDeadEnd, p("a"), {
      maxExpandedStatesPerOrigin: 1,
    });
    assert.deepEqual(cycleDeadEndResult, {
      nodeId: p("a"),
      paths: [
        {
          origin: p("x"),
          nodes: ps("x", "a"),
          edgeIds: [`${p("x")}->${p("a")}`],
          hopCount: 1,
          isOriginShortest: true,
          containsCycleEdge: false,
        },
      ],
      provenanceComplete: true,
      missingOrigins: [],
      omittedIncomingEdgeCount: 0,
      pathsTruncatedByLimit: false,
      isExhaustive: true,
    });

    // 6a. Missing-origin dead-end from Test 25 fixture: X2 -> U omitted by maxEdges, U -> V retained.
    const missingDeadEndGraph = build(
      { x1: [], x2: [], d1: ["x1"], d2: ["x1"], u: ["x1", "x2"], v: ["u"] },
      ["x1", "x2"],
      { maxEdges: 4 },
    );
    const missingDeadEndResult = reconstructNodePaths(missingDeadEndGraph, p("v"), {
      maxExpandedStatesPerOrigin: 2,
    });
    assert.deepEqual(missingDeadEndResult, {
      nodeId: p("v"),
      paths: [
        {
          origin: p("x1"),
          nodes: ps("x1", "u", "v"),
          edgeIds: [`${p("x1")}->${p("u")}`, `${p("u")}->${p("v")}`],
          hopCount: 2,
          isOriginShortest: true,
          containsCycleEdge: false,
        },
      ],
      provenanceComplete: false,
      missingOrigins: ps("x2"),
      omittedIncomingEdgeCount: 0,
      pathsTruncatedByLimit: false,
      isExhaustive: false,
    });

    // 6b. Missing-origin where shortest 2-hop path (X2 -> U -> T) is omitted by maxEdges,
    // but a valid 3-hop alternative path (X2 -> A -> B -> T) is still retained and reconstructed!
    const missingWithAltGraph = build(
      {
        x1: [],
        x2: [],
        a: ["x2"],
        b: ["x1", "a"],
        u: ["x2"],
        t: ["b", "u"],
      },
      ["x1", "x2"],
      { maxEdges: 5 },
    );
    const missingWithAltResult = reconstructNodePaths(missingWithAltGraph, p("t"), {
      maxExpandedStatesPerOrigin: 3,
    });
    assert.deepEqual(missingWithAltResult, {
      nodeId: p("t"),
      paths: [
        {
          origin: p("x1"),
          nodes: ps("x1", "b", "t"),
          edgeIds: [`${p("x1")}->${p("b")}`, `${p("b")}->${p("t")}`],
          hopCount: 2,
          isOriginShortest: true,
          containsCycleEdge: false,
        },
        {
          origin: p("x2"),
          nodes: ps("x2", "a", "b", "t"),
          edgeIds: [
            `${p("x2")}->${p("a")}`,
            `${p("a")}->${p("b")}`,
            `${p("b")}->${p("t")}`,
          ],
          hopCount: 3,
          isOriginShortest: false,
          containsCycleEdge: false,
        },
      ],
      provenanceComplete: false,
      missingOrigins: ps("x2"),
      omittedIncomingEdgeCount: 1,
      pathsTruncatedByLimit: false,
      isExhaustive: false,
    });

    // 7. Two 3-hop shortest chains: X -> A1 -> B1 -> T and X -> A2 -> B2 -> T.
    const twoChains = build(
      {
        x: [],
        a1: ["x"],
        b1: ["a1"],
        a2: ["x"],
        b2: ["a2"],
        t: ["b1", "b2"],
      },
      ["x"],
    );
    const truncatedByState = reconstructNodePaths(twoChains, p("t"), {
      maxExpandedStatesPerOrigin: 3,
    });
    assert.deepEqual(truncatedByState.paths.map((r) => r.nodes), [
      ps("x", "a1", "b1", "t"),
    ]);
    assert.equal(truncatedByState.provenanceComplete, true);
    assert.deepEqual(truncatedByState.missingOrigins, []);
    assert.equal(truncatedByState.omittedIncomingEdgeCount, 0);
    assert.equal(truncatedByState.pathsTruncatedByLimit, true);
    assert.equal(truncatedByState.isExhaustive, false);

    const sufficientState = reconstructNodePaths(twoChains, p("t"), {
      maxExpandedStatesPerOrigin: 5,
    });
    assert.deepEqual(sufficientState.paths.map((r) => r.nodes), [
      ps("x", "a1", "b1", "t"),
      ps("x", "a2", "b2", "t"),
    ]);
    assert.equal(sufficientState.provenanceComplete, true);
    assert.deepEqual(sufficientState.missingOrigins, []);
    assert.equal(sufficientState.omittedIncomingEdgeCount, 0);
    assert.equal(sufficientState.pathsTruncatedByLimit, false);
    assert.equal(sufficientState.isExhaustive, true);
  });
});

// ---------------------------------------------------------------------------
// Changed-file representation and resolution (21–23, 31)
// ---------------------------------------------------------------------------

describe("impact graph — changed files and resolution", () => {
  test("21. every changed file is represented with explicit analysis status", () => {
    const files = new Map<string, string>([
      ["src/a.ts", "export const a = 1;"],
      ["src/consumer.ts", `import d from "./deleted";`],
      ["src/caller.ts", `import h from "./huge";`],
      // Non-string content forces the production parse-failure path.
      ["src/broken.ts", null as unknown as string],
    ]);
    const g = buildImpactGraphData({
      files,
      changedFiles: [
        changed("a"),
        changed("deleted", { status: "removed", additions: 0, deletions: 10 }),
        changed("README.md", { category: "documentation" }),
        changed("huge"),
        changed("broken"),
      ],
      scanTruncated: true,
      fetchErrorCount: 2,
    });

    const expected: Record<string, string> = {
      "src/a.ts": "analyzed",
      "src/deleted.ts": "deleted_source",
      "README.md": "non_source",
      "src/huge.ts": "unscanned_source",
      "src/broken.ts": "parse_failed",
    };
    for (const [id, status] of Object.entries(expected)) {
      const n = node(g, id);
      assert.equal(n.category, "changed");
      assert.equal(n.depth, 0);
      assert.equal(n.analysisStatus, status);
      assert.equal(n.unresolvedImportCount, status === "analyzed" ? 0 : null);
    }
    assert.equal(node(g, "deleted").changeType, "removed");
    assert.equal(node(g, "consumer").category, "direct_dependent");
    assert.equal(edge(g, "deleted", "consumer").resolutionKind, "direct_path");
    assert.equal(node(g, "caller").category, "direct_dependent");
    edge(g, "huge", "caller");
    assert.equal(g.edges.some((e) => e.from === p("a") || e.to === p("a")), false);

    assert.deepEqual(g.metadata.unmappedChangedFiles, [
      "README.md",
      "src/broken.ts",
      "src/deleted.ts",
      "src/huge.ts",
    ]);
    assert.equal(g.metadata.truncatedFileScan, true);
    assert.ok(g.metadata.scannedFileCount < 220);
    assert.equal(g.metadata.fetchErrorCount, 2);

    const untruncated = buildImpactGraphData({ files, changedFiles: [changed("a")] });
    assert.equal(untruncated.metadata.truncatedFileScan, false);
  });

  test("22. renamed file resolves imports of both its new and previous path", () => {
    const g = buildImpactGraphData({
      files: new Map([
        ["src/new-name.ts", "export const n = 1;"],
        ["src/updated.ts", `import { n } from "@/new-name";`],
        ["src/stale.ts", `import { n } from "@/old-name";`],
      ]),
      changedFiles: [
        changed("src/new-name.ts", { status: "renamed", previousPath: "src/old-name.ts" }),
      ],
    });
    const renamed = node(g, "src/new-name.ts");
    assert.equal(renamed.previousPath, "src/old-name.ts");
    assert.equal(renamed.changeType, "renamed");
    assert.equal(hasNode(g, "src/old-name.ts"), false);
    assert.equal(node(g, "src/updated.ts").depth, 1);
    assert.equal(node(g, "src/stale.ts").depth, 1);
    assert.equal(edge(g, "src/new-name.ts", "src/updated.ts").resolutionKind, "direct_path");
    assert.equal(
      edge(g, "src/new-name.ts", "src/stale.ts").resolutionKind,
      "renamed_previous_path",
    );
  });

  test("23. unresolved local/alias imports are counted only for analyzed files", () => {
    const g = buildImpactGraphData({
      files: new Map([
        [
          "src/changed.ts",
          [
            `import a from "./missing-local";`,
            `import b from "@/missing-alias";`,
            `import React from "react";`,
          ].join("\n"),
        ],
        ["src/clean.ts", `import c from "./changed";`],
      ]),
      changedFiles: [changed("src/changed.ts")],
    });
    const c = node(g, "src/changed.ts");
    assert.equal(c.analysisStatus, "analyzed");
    assert.equal(c.unresolvedImportCount, 2);
    const clean = node(g, "src/clean.ts");
    assert.equal(clean.analysisStatus, "analyzed");
    assert.equal(clean.unresolvedImportCount, 0);
  });

  test("31. rename resolution precedence on same importer and previous-path collision guard", () => {
    // Part A: A single importer imports both the old and new path of a renamed file
    // (tested in both specifier orders). Direct path must win without duplicate edges.
    const precedenceGraph = buildImpactGraphData({
      files: new Map([
        ["src/new-name.ts", "export const n = 1;"],
        [
          "src/old-then-new.ts",
          `import { a } from "@/old-name";\nimport { b } from "@/new-name";`,
        ],
        [
          "src/new-then-old.ts",
          `import { b } from "@/new-name";\nimport { a } from "@/old-name";`,
        ],
      ]),
      changedFiles: [
        changed("src/new-name.ts", { status: "renamed", previousPath: "src/old-name.ts" }),
      ],
    });
    assert.equal(precedenceGraph.edges.length, 2);
    assert.equal(
      edge(precedenceGraph, "src/new-name.ts", "src/old-then-new.ts").resolutionKind,
      "direct_path",
    );
    assert.equal(
      edge(precedenceGraph, "src/new-name.ts", "src/new-then-old.ts").resolutionKind,
      "direct_path",
    );

    // Part B: Previous-path collision — another active file now occupies src/old-name.ts.
    // Imports of "@/old-name" must resolve to the active src/old-name.ts, NOT src/new-name.ts.
    const collisionGraph = buildImpactGraphData({
      files: new Map([
        ["src/old-name.ts", "export const replacement = 1;"],
        ["src/new-name.ts", "export const moved = 1;"],
        ["src/consumer.ts", `import { replacement } from "@/old-name";`],
      ]),
      changedFiles: [
        changed("src/new-name.ts", { status: "renamed", previousPath: "src/old-name.ts" }),
      ],
    });
    assert.equal(hasNode(collisionGraph, "src/consumer.ts"), false);
    assert.equal(findEdge(collisionGraph, "src/new-name.ts", "src/consumer.ts"), undefined);
  });
});

// ---------------------------------------------------------------------------
// Architecture & efficiency regressions (27, 29)
// ---------------------------------------------------------------------------

describe("impact graph — architecture and efficiency regressions", () => {
  test("27. impact module dependency graph is strictly acyclic and preserves public exports", () => {
    assert.equal(typeof classifyModuleArea, "function");
    assert.equal(typeof isRouteLikePath, "function");
    assert.equal(typeof buildReverseImportGraph, "function");
    assert.equal(typeof collectDependents, "function");
    assert.equal(typeof buildImpactGraphData, "function");
    assert.equal(typeof reconstructNodePaths, "function");

    const impactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const moduleFiles = [
      "parse-imports.ts",
      "impact-graph.ts",
      "import-graph.ts",
      "index.ts",
      "fetch-sources.ts",
    ];
    const adjacency = new Map<string, string[]>();
    for (const file of moduleFiles) {
      const content = readFileSync(path.join(impactDir, file), "utf8");
      const specs = extractImportSpecifiers(content);
      const targets: string[] = [];
      for (const spec of specs) {
        if (spec.startsWith("@/lib/analysis/impact/")) {
          const name = `${spec.slice("@/lib/analysis/impact/".length)}.ts`;
          if (moduleFiles.includes(name)) targets.push(name);
        } else if (spec.startsWith("./")) {
          const name = `${spec.slice(2)}.ts`;
          if (moduleFiles.includes(name)) targets.push(name);
        }
      }
      adjacency.set(file, targets);
    }

    const cycles = stronglyConnectedComponents(moduleFiles, adjacency).filter(
      (c) => c.length >= 2,
    );
    assert.deepEqual(cycles, [], "impact modules must not have circular imports");
    assert.deepEqual(adjacency.get("parse-imports.ts"), []);
    assert.deepEqual(adjacency.get("impact-graph.ts"), ["parse-imports.ts"]);
  });

  test("29. analyzeImpact and buildImpactImportIndex deduplicate normalized paths and parse each source once", async () => {
    const srcX = "export const x = 1;";
    const srcAFirst = `import { x } from "./x";\nimport "./missing-from-first";`;
    const srcASecond = `import { x } from "./x";`;
    const srcB = `import { a } from "./a";`;

    const parseCounts = new Map<string, number>();
    const origReplace = String.prototype.replace;
    String.prototype.replace = function (
      pattern: string | RegExp,
      replacement: string | ((substring: string, ...args: unknown[]) => string),
    ): string {
      if (pattern instanceof RegExp && pattern.source === "\\/\\*[\\s\\S]*?\\*\\/") {
        const text = String(this);
        parseCounts.set(text, (parseCounts.get(text) ?? 0) + 1);
      }
      return origReplace.call(this, pattern as never, replacement as never);
    };

    try {
      let iteratorCalls = 0;
      const trackedFiles = new Map<string, string>([
        ["src/x.ts", srcX],
        ["src/a.ts", srcAFirst],
        ["./src/a.ts", srcASecond], // normalizes to "src/a.ts" and overwrites srcAFirst
        ["src/b.ts", srcB],
      ]);
      const origIterator = trackedFiles[Symbol.iterator].bind(trackedFiles);
      trackedFiles[Symbol.iterator] = function* () {
        iteratorCalls += 1;
        yield* origIterator();
      };

      const result = await analyzeImpact({
        owner: "acme",
        repo: "veris",
        installationId: 1,
        headSha: "abc123456789",
        changedFiles: [changed("x")],
        prefetchedSources: trackedFiles,
      });

      assert.equal(iteratorCalls, 1, "prefetchedSources must be iterated only once");
      assert.equal(parseCounts.get(srcX), 1, "src/x.ts must be parsed once");
      assert.equal(parseCounts.get(srcAFirst), undefined, "overwritten duplicate key must not be parsed");
      assert.equal(parseCounts.get(srcASecond), 1, "normalized src/a.ts must be parsed once");
      assert.equal(parseCounts.get(srcB), 1, "src/b.ts must be parsed once");
      assert.equal(result.impactGraph.metadata.scannedFileCount, 3);
      assert.equal(node(result.impactGraph, "a").unresolvedImportCount, 0);
      assert.equal(result.directDependencyCount, 1);
      assert.equal(result.indirectDependencyCount, 1);
      assert.equal(result.impactGraph.nodes.length, 3);
      assert.equal(result.impactGraph.edges.length, 2);

      // Verify both consumers reuse a prebuilt importIndex without reading `files`.
      parseCounts.clear();
      const prebuiltIndex = buildImpactImportIndex(
        new Map([
          ["src/x.ts", srcX],
          ["src/a.ts", srcASecond],
          ["./src/a.ts", srcASecond],
          ["src/b.ts", srcB],
        ]),
        [changed("x")],
      );
      assert.equal(prebuiltIndex.scannedSourcePaths.size, 3);
      assert.equal(prebuiltIndex.unresolvedByImporter.size, 3);
      assert.equal(parseCounts.get(srcASecond), 1);

      parseCounts.clear();
      const poisonedFiles = new Map<string, string>();
      poisonedFiles[Symbol.iterator] = function* () {
        throw new Error("files must not be iterated when importIndex is provided");
      };

      const revResult = buildReverseImportGraph(poisonedFiles, {
        changedFiles: [changed("x")],
        importIndex: prebuiltIndex,
      });
      const graphData = buildImpactGraphData({
        files: poisonedFiles,
        changedFiles: [changed("x")],
        importIndex: prebuiltIndex,
      });

      assert.equal(parseCounts.size, 0, "no parsing may occur when reusing importIndex");
      assert.equal(revResult.reverseGraph, prebuiltIndex.reverse);
      assert.equal(graphData.edges.length, 2);
    } finally {
      String.prototype.replace = origReplace;
    }
  });
});
