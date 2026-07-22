/**
 * Scope Engine — compares intended task vs actual changes.
 * Implemented in Stage 3.
 */

export interface ScopeAnalysisInput {
  taskDescription: string;
  changedFiles: string[];
}

export interface ScopeAnalysisResult {
  scopeCompliance: "high" | "partial" | "low" | "unknown";
  expectedAreas: string[];
  unexpectedAreas: string[];
  explanation: string;
}

export async function analyzeScope(
  _input: ScopeAnalysisInput,
): Promise<ScopeAnalysisResult> {
  return {
    scopeCompliance: "unknown",
    expectedAreas: [],
    unexpectedAreas: [],
    explanation: "Scope analysis is not implemented until Stage 3.",
  };
}
