/**
 * Analysis Orchestrator — Stage 2 / 2.5
 * Deterministic collection (pinned SHA) → context → AI → calibrate → structured result
 */

import { createDefaultAiProvider } from "@/lib/analysis/ai";
import { buildAnalysisContext } from "@/lib/analysis/build-context";
import { calibrateFindings } from "@/lib/analysis/confidence";
import { collectPullRequestChanges } from "@/lib/analysis/collect-changes";
import { logAnalysis } from "@/lib/analysis/log";
import {
  buildAnalyzedPathSet,
  filterFindingsAffectedFiles,
} from "@/lib/analysis/validate-files";
import type {
  AiAnalysisResult,
  AnalysisContext,
  DeterministicAnalysisResult,
} from "@/lib/analysis/types";

export interface RunAnalysisInput {
  analysisId?: string;
  pullRequestId?: string;
  owner: string;
  repo: string;
  pullNumber: number;
  installationId: number;
  /** Immutable SHA captured at analysis start — all GitHub reads use this. */
  headSha: string;
  repository: {
    fullName: string;
    owner: string;
    name: string;
    defaultBranch: string;
  };
  pullRequest: {
    number: number;
    title: string;
    description: string | null;
    authorLogin: string;
    sourceBranch: string;
    targetBranch: string;
    htmlUrl: string | null;
  };
}

export interface RunAnalysisOutput {
  context: AnalysisContext;
  deterministic: DeterministicAnalysisResult;
  ai: AiAnalysisResult;
  baseSha: string;
  headSha: string;
}

export async function runPullRequestAnalysis(
  input: RunAnalysisInput,
): Promise<RunAnalysisOutput> {
  const headSha = input.headSha;
  if (!headSha) {
    throw new Error("headSha is required for analysis integrity");
  }

  const deterministicFull = await collectPullRequestChanges({
    owner: input.owner,
    repo: input.repo,
    pullNumber: input.pullNumber,
    installationId: input.installationId,
    headSha,
  });

  // Enforce collected head matches requested analysis head
  if (deterministicFull.headSha !== headSha) {
    throw new Error(
      `SHA integrity violation: requested ${headSha.slice(0, 12)} but fetched ${deterministicFull.headSha.slice(0, 12)}`,
    );
  }

  const { baseSha, headSha: pinnedHead, ...deterministic } = deterministicFull;

  logAnalysis("github_fetch_completed", {
    analysisId: input.analysisId,
    pullRequestId: input.pullRequestId,
    headSha: pinnedHead,
    filesChanged: deterministic.filesChanged,
    linesAdded: deterministic.linesAdded,
    linesDeleted: deterministic.linesDeleted,
  });

  const context = buildAnalysisContext({
    repository: input.repository,
    pullRequest: input.pullRequest,
    headSha: pinnedHead,
    deterministic,
  });

  const provider = createDefaultAiProvider();
  if (!provider.isConfigured()) {
    throw new Error(
      "AI provider is not configured. Set OPENROUTER_API_KEY on the server (free model: cohere/north-mini-code:free). Optional: AI_PROVIDER=gemini with GEMINI_API_KEY.",
    );
  }

  logAnalysis("ai_request_started", {
    analysisId: input.analysisId,
    pullRequestId: input.pullRequestId,
    headSha: pinnedHead,
    provider: provider.name,
  });

  const aiStarted = Date.now();
  let ai = await provider.analyzePullRequest(context);

  logAnalysis("ai_request_completed", {
    analysisId: input.analysisId,
    pullRequestId: input.pullRequestId,
    headSha: pinnedHead,
    provider: ai.provider,
    model: ai.model,
    durationMs: Date.now() - aiStarted,
    findingsCount: ai.findings.length,
    ok: true,
  });

  logAnalysis("zod_validation", {
    analysisId: input.analysisId,
    pullRequestId: input.pullRequestId,
    headSha: pinnedHead,
    ok: true,
    findingsCount: ai.findings.length,
  });

  const analyzedPaths = buildAnalyzedPathSet(deterministic.changedFiles);
  const filteredFindings = filterFindingsAffectedFiles(
    ai.findings,
    analyzedPaths,
  );
  const calibratedFindings = calibrateFindings(
    filteredFindings,
    context,
    analyzedPaths,
  );

  ai = {
    ...ai,
    findings: calibratedFindings,
  };

  return {
    context,
    deterministic,
    ai,
    baseSha,
    headSha: pinnedHead,
  };
}
