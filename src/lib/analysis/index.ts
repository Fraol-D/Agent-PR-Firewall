/**
 * Analysis engine public surface — Stage 2 / 2.5 / 2.6 / 3 / 4.
 */

export { runPullRequestAnalysis } from "@/lib/analysis/orchestrator";
export { classifyFilePath } from "@/lib/analysis/classify";
export {
  computeMergeDecision,
  mergeDecisionLabel,
  buildRiskBreakdown,
  isDocumentationOnlyChange,
} from "@/lib/analysis/decision";
export {
  structureFindingEvidence,
} from "@/lib/analysis/evidence";
export {
  buildConfidenceReason,
  buildOverallConfidenceReason,
} from "@/lib/analysis/confidence";
export { analyzeIntentAndScope } from "@/lib/analysis/scope";
export { classificationLabel } from "@/lib/analysis/scope/classify-pr";
export { computeRiskFromFindings } from "@/lib/analysis/risk";
export {
  computeFinalDecision,
  finalDecisionLabel,
  DEFAULT_DECISION_RULES,
  buildAffectedAreas,
} from "@/lib/analysis/decision-engine";
export {
  createDefaultAiProvider,
  isAiProviderConfigured,
  getActiveAiProviderName,
  OpenRouterAnalysisProvider,
  GeminiAnalysisProvider,
} from "@/lib/analysis/ai";
export type * from "@/lib/analysis/types";

