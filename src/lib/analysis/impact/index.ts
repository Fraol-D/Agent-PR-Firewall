/**
 * Impact Engine — blast radius and dependency impact.
 * Expanded in Stage 2+.
 */

export interface ImpactAnalysisResult {
  impactClassification: "low" | "medium" | "high" | "unknown";
  affectedModules: string[];
  confidence: number | null;
  explanation: string;
}

export async function analyzeImpact(): Promise<ImpactAnalysisResult> {
  return {
    impactClassification: "unknown",
    affectedModules: [],
    confidence: null,
    explanation: "Impact analysis is not implemented until Stage 2.",
  };
}
