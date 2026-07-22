/**
 * Analysis Orchestrator — Stage 0 placeholder.
 * Will coordinate deterministic and optional LLM analysis in later stages.
 */

export interface AnalysisJobInput {
  pullRequestId: string;
  repositoryId: string;
  headSha?: string | null;
}

export interface AnalysisJobResult {
  analysisId: string;
  status: "queued" | "unsupported";
  message: string;
}

export async function enqueueAnalysis(
  _input: AnalysisJobInput,
): Promise<AnalysisJobResult> {
  return {
    analysisId: "",
    status: "unsupported",
    message:
      "Analysis orchestration is not available until Stage 2 (deterministic analysis).",
  };
}
