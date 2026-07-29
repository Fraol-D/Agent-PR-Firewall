/**
 * Scope Engine — Stage 3
 * Intent verification: task extraction, classification, scope match, creep, coverage.
 */

import { classifyPullRequest } from "@/lib/analysis/scope/classify-pr";
import { collectIntentSignals } from "@/lib/analysis/scope/collect-intent";
import { extractTask } from "@/lib/analysis/scope/extract-task";
import { verifyScope } from "@/lib/analysis/scope/verify-scope";
import type { IntentScopeResult } from "@/lib/analysis/scope/types";
import type { ChangedFileEvidence } from "@/lib/analysis/types";

export type {
  IntentScopeResult,
  ScopeMatch,
  ScopePrClassification,
  ImplementationCoverage,
  MissingWorkItem,
  TaskSource,
} from "@/lib/analysis/scope/types";

export { classificationLabel } from "@/lib/analysis/scope/classify-pr";
// collectIntentSignals is server-only (GitHub App / Node fs) — import from
// `@/lib/analysis/scope/collect-intent` in server code only, never from client.

export interface AnalyzeIntentScopeInput {
  owner: string;
  repo: string;
  pullNumber: number;
  installationId: number;
  baseSha: string;
  headSha: string;
  title: string;
  description: string | null;
  sourceBranch?: string | null;
  changedFiles: ChangedFileEvidence[];
  hasTests: boolean;
  /**
   * When provided, skip GitHub fetches (tests / offline).
   */
  prefetched?: {
    commitMessages?: string[];
    linkedIssues?: Array<{ number: number; title: string; body: string | null }>;
  };
}

/**
 * Full Stage 3 intent + scope analysis (deterministic; no AI required).
 */
export async function analyzeIntentAndScope(
  input: AnalyzeIntentScopeInput,
): Promise<IntentScopeResult> {
  const signals =
    input.prefetched ??
    (await collectIntentSignals({
      owner: input.owner,
      repo: input.repo,
      pullNumber: input.pullNumber,
      installationId: input.installationId,
      baseSha: input.baseSha,
      headSha: input.headSha,
      prTitle: input.title,
      prDescription: input.description,
    }));

  const extracted = extractTask({
    title: input.title,
    description: input.description,
    sourceBranch: input.sourceBranch,
    commitMessages: signals.commitMessages ?? [],
    linkedIssues: signals.linkedIssues ?? [],
  });

  const { primary, secondary } = classifyPullRequest({
    intentText: extracted.combinedIntentText,
    title: input.title,
    changedFiles: input.changedFiles,
  });

  return verifyScope({
    taskSummary: extracted.taskSummary,
    taskSources: extracted.taskSources,
    intentText: extracted.combinedIntentText,
    classification: primary,
    secondaryClassifications: secondary,
    changedFiles: input.changedFiles,
    hasTests: input.hasTests,
  });
}

/** @deprecated Use analyzeIntentAndScope — kept for stub compatibility. */
export interface ScopeAnalysisInput {
  taskDescription: string;
  changedFiles: string[];
}

/** @deprecated Use IntentScopeResult via analyzeIntentAndScope. */
export interface ScopeAnalysisResult {
  scopeCompliance: "high" | "partial" | "low" | "unknown";
  expectedAreas: string[];
  unexpectedAreas: string[];
  explanation: string;
}

/** @deprecated Legacy stub wrapper. */
export async function analyzeScope(
  input: ScopeAnalysisInput,
): Promise<ScopeAnalysisResult> {
  const fakeFiles: ChangedFileEvidence[] = input.changedFiles.map((path) => ({
    path,
    previousPath: null,
    status: "modified",
    additions: 0,
    deletions: 0,
    category: "unknown",
    isBinary: false,
    excludedFromAi: true,
  }));

  const result = await analyzeIntentAndScope({
    owner: "",
    repo: "",
    pullNumber: 0,
    installationId: 0,
    baseSha: "",
    headSha: "",
    title: input.taskDescription,
    description: input.taskDescription,
    changedFiles: fakeFiles,
    hasTests: false,
    prefetched: { commitMessages: [], linkedIssues: [] },
  });

  const compliance =
    result.scopeMatch === "matches"
      ? "high"
      : result.scopeMatch === "partial"
        ? "partial"
        : result.scopeMatch === "unknown"
          ? "unknown"
          : "low";

  return {
    scopeCompliance: compliance,
    expectedAreas: result.expectedAreas,
    unexpectedAreas: result.unrelatedFiles,
    explanation: result.scopeMatchReason,
  };
}
