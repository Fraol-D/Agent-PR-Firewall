import type { AnalysisContext, AiAnalysisResult } from "@/lib/analysis/types";

export interface AiAnalysisProvider {
  readonly name: string;
  isConfigured(): boolean;
  analyzePullRequest(context: AnalysisContext): Promise<AiAnalysisResult>;
}
