/**
 * JSON object written to analyses.context_stats when an analysis completes.
 * The impact summary stays intact and the graph is nested at impact.graph.
 */

import type { DecisionEngineResult } from "@/lib/analysis/decision-engine";
import type { ImpactAnalysisResult } from "@/lib/analysis/impact";
import type { AnalysisContext } from "@/lib/analysis/types";
import type { IntentScopeResult } from "@/lib/analysis/scope/types";

export interface PersistedContextStatsInput {
  contextStats: AnalysisContext["stats"];
  baseSha: string;
  headSha: string;
  intentScope: IntentScopeResult;
  decisionEngine: DecisionEngineResult;
  impact: ImpactAnalysisResult;
}

export function buildPersistedContextStats(
  input: PersistedContextStatsInput,
): Record<string, unknown> {
  return {
    ...input.contextStats,
    baseSha: input.baseSha,
    headSha: input.headSha,
    intentScope: input.intentScope,
    decisionEngine: input.decisionEngine,
    impact: {
      classification: input.impact.impactClassification,
      confidence: input.impact.confidence,
      explanation: input.impact.explanation,
      directDependents: input.impact.directDependencyCount,
      totalDependents: input.impact.totalDependencyCount,
      routes: input.impact.affectedRoutes,
      graphMeta: input.impact.graphMeta,
      graph: input.impact.impactGraph,
    },
  };
}
