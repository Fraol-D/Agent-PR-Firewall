/**
 * Analysis Orchestrator — Stage 2 / 2.5 / 2.6 / 3 / 4
 * collect → intent/scope → AI → calibrate → risk → final decision
 */

import { createDefaultAiProvider } from "@/lib/analysis/ai";
import { buildAnalysisContext } from "@/lib/analysis/build-context";
import { calibrateFindings } from "@/lib/analysis/confidence";
import { collectPullRequestChanges } from "@/lib/analysis/collect-changes";
import { computeMergeDecision } from "@/lib/analysis/decision";
import {
  buildAffectedAreas,
  computeFinalDecision,
  type AffectedAreaDraft,
  type DecisionEngineResult,
} from "@/lib/analysis/decision-engine";
import { analyzeImpact, type ImpactAnalysisResult } from "@/lib/analysis/impact";
import { logAnalysis } from "@/lib/analysis/log";
import { computeRiskFromFindings, type RiskAnalysisResult } from "@/lib/analysis/risk";
import { analyzeIntentAndScope } from "@/lib/analysis/scope";
import type { IntentScopeResult } from "@/lib/analysis/scope/types";
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
  intentScope: IntentScopeResult;
  /** Stage 2 risk engine output (deterministic from findings). */
  risk: RiskAnalysisResult;
  /** Import-graph blast radius (independent of risk/scope tags). */
  impact: ImpactAnalysisResult;
  /** Stage 4 decision engine (no LLM). */
  finalDecision: DecisionEngineResult;
  /** §21.7 affected areas drafts for persistence. */
  affectedAreas: AffectedAreaDraft[];
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

  const { baseSha, headSha: pinnedHead, ...deterministicBase } =
    deterministicFull;

  logAnalysis("github_fetch_completed", {
    analysisId: input.analysisId,
    pullRequestId: input.pullRequestId,
    headSha: pinnedHead,
    filesChanged: deterministicBase.filesChanged,
    linesAdded: deterministicBase.linesAdded,
    linesDeleted: deterministicBase.linesDeleted,
  });

  // Stage 3 — intent extraction & scope verification (deterministic)
  const intentScope = await analyzeIntentAndScope({
    owner: input.owner,
    repo: input.repo,
    pullNumber: input.pullNumber,
    installationId: input.installationId,
    baseSha,
    headSha: pinnedHead,
    title: input.pullRequest.title,
    description: input.pullRequest.description,
    sourceBranch: input.pullRequest.sourceBranch,
    changedFiles: deterministicBase.changedFiles,
    hasTests: deterministicBase.hasTests,
  });

  logAnalysis("scope_analysis_completed", {
    analysisId: input.analysisId,
    pullRequestId: input.pullRequestId,
    headSha: pinnedHead,
    scopeMatch: intentScope.scopeMatch,
    coverage: intentScope.coverage,
    scopeCreep: intentScope.scopeCreepDetected,
    scopeScore: intentScope.scopeScore,
  });

  const deterministic: DeterministicAnalysisResult = {
    ...deterministicBase,
    intentScope,
  };

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

  // Stage 2 risk (deterministic from findings + sensitive areas)
  const risk = computeRiskFromFindings(calibratedFindings, deterministic);

  // Blast radius via reverse import graph (fresh GitHub tree @ headSha)
  const impact = await analyzeImpact({
    owner: input.owner,
    repo: input.repo,
    installationId: input.installationId,
    headSha: pinnedHead,
    changedFiles: deterministic.changedFiles,
  });

  logAnalysis("impact_analysis_completed", {
    analysisId: input.analysisId,
    pullRequestId: input.pullRequestId,
    headSha: pinnedHead,
    impactClassification: impact.impactClassification,
    impactConfidence: impact.confidence,
    directDependents: impact.directDependencyCount,
    totalDependents: impact.totalDependencyCount,
    truncated: impact.graphMeta.truncated,
    ok: true,
  });

  // Prefer graph-backed affected areas; fallback to category-only if empty
  const affectedAreas: AffectedAreaDraft[] =
    impact.affectedAreas.length > 0
      ? impact.affectedAreas
      : buildAffectedAreas({ deterministic, intentScope });

  // Stage 4 — risk × scope, then HIGH-impact one-level escalation (no LLM)
  const finalDecision = computeFinalDecision({
    riskScore: risk.riskScore,
    riskClassification: risk.riskClassification,
    scopeScore: intentScope.scopeScore,
    scopeClassification: intentScope.scopeClassificationDb,
    impactClassification: impact.impactClassification,
    impactConfidence: impact.confidence,
    impactExplanation: impact.explanation,
    riskFactors: risk.factors,
    affectedAreas,
    scopeCreepDetected: intentScope.scopeCreepDetected,
    unrelatedFiles: intentScope.unrelatedFiles,
    coverage: intentScope.coverage,
    sensitiveAreas: deterministic.sensitiveAreas,
  });

  // Stage 2.6 UX decision remains available for legacy UI fields;
  // overall_status is aligned with Stage 4 final decision.
  const legacyDecision = computeMergeDecision({
    findings: calibratedFindings,
    deterministic,
    aiOverallStatus: ai.overallStatus,
    intentScope,
  });

  let summary = ai.summary;
  if (
    legacyDecision.docsOnly &&
    !/documentation only/i.test(summary)
  ) {
    summary = `This pull request modifies documentation only. ${summary}`.slice(
      0,
      4000,
    );
  }

  ai = {
    ...ai,
    summary,
    overallStatus: finalDecisionToOverall(finalDecision.finalDecision),
    findings: calibratedFindings,
  };

  logAnalysis("decision_computed", {
    analysisId: input.analysisId,
    pullRequestId: input.pullRequestId,
    headSha: pinnedHead,
    decision: finalDecision.finalDecision,
    riskClassification: risk.riskClassification,
    scopeClassification: intentScope.scopeClassificationDb,
    riskScore: risk.riskScore,
    scopeScore: intentScope.scopeScore,
    impactClassification: impact.impactClassification,
    ok: true,
  });

  return {
    context,
    deterministic,
    ai,
    intentScope,
    risk,
    impact,
    finalDecision,
    affectedAreas,
    baseSha,
    headSha: pinnedHead,
  };
}

function finalDecisionToOverall(
  d: DecisionEngineResult["finalDecision"],
): AiAnalysisResult["overallStatus"] {
  switch (d) {
    case "LOW":
      return "no_significant_concerns";
    case "BLOCKED":
      return "high_risk_concerns";
    case "REVIEW_RECOMMENDED":
    case "REVIEW_REQUIRED":
      return "review_recommended";
  }
}
