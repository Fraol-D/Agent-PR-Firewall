/**
 * Analysis engine entrypoint.
 * Stage 0: module boundaries only.
 * Deterministic and LLM-based analysis evolve independently in later stages.
 */

export type AnalysisEngineModule =
  | "orchestrator"
  | "scope"
  | "impact"
  | "risk"
  | "tests"
  | "change"
  | "dependency"
  | "sensitive"
  | "decision";

export const ANALYSIS_ENGINE_MODULES: AnalysisEngineModule[] = [
  "orchestrator",
  "scope",
  "impact",
  "risk",
  "tests",
  "change",
  "dependency",
  "sensitive",
  "decision",
];
