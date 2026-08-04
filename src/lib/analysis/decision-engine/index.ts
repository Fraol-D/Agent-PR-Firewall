/**
 * Stage 4 — Decision Engine public API.
 */

export { computeFinalDecision, finalDecisionLabel } from "@/lib/analysis/decision-engine/engine";
export {
  DEFAULT_DECISION_RULES,
  DEFAULT_RISK_SCORE_BANDS,
  matchDecisionRule,
} from "@/lib/analysis/decision-engine/thresholds";
export { buildAffectedAreas } from "@/lib/analysis/decision-engine/affected-areas";
export type {
  DecisionEngineInput,
  DecisionEngineResult,
  DecisionReason,
  Decision,
  RiskClassification,
  ScopeClassification,
} from "@/lib/analysis/decision-engine/types";
export type { DecisionRule } from "@/lib/analysis/decision-engine/thresholds";
export type { AffectedAreaDraft } from "@/lib/analysis/decision-engine/affected-areas";
