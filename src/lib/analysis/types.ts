/**
 * Stage 2 / 2.5 / 2.6 / 3 analysis domain types.
 */

import type { IntentScopeResult } from "@/lib/analysis/scope/types";

export type {
  IntentScopeResult,
  ScopeMatch,
  ScopePrClassification,
  ImplementationCoverage,
  MissingWorkItem,
  TaskSource,
} from "@/lib/analysis/scope/types";

export type AnalysisJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type OverallAnalysisStatus =
  | "no_significant_concerns"
  | "review_recommended"
  | "high_risk_concerns";

/** Human-facing merge recommendation (Stage 2.6). Maps to OverallAnalysisStatus for storage. */
export type MergeDecision =
  | "safe_to_merge"
  | "review_recommended"
  | "block_merge";

export type DecisionTraceTone = "positive" | "warning" | "negative" | "neutral";

export interface DecisionTraceItem {
  id: string;
  tone: DecisionTraceTone;
  label: string;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceReason {
  level: ConfidenceLevel;
  label: string;
}

/** Structured evidence for UI — derived from free-form evidence + paths. */
export interface StructuredEvidence {
  file: string | null;
  lines: string | null;
  observedChange: string;
  supportsFinding: string;
  raw: string | null;
}

export type FileCategory =
  | "frontend"
  | "backend"
  | "database"
  | "authentication"
  | "configuration"
  | "infrastructure"
  | "tests"
  | "documentation"
  | "dependencies"
  | "unknown";

export type ChangeStatus =
  | "added"
  | "modified"
  | "removed"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged";

export type FindingCategory =
  | "SECURITY"
  | "DATA"
  | "AUTHENTICATION"
  | "PERFORMANCE"
  | "RELIABILITY"
  | "DATABASE"
  | "API"
  | "DEPENDENCY"
  | "CONFIGURATION"
  | "MAINTAINABILITY"
  | "SCOPE"
  | "OTHER";

export type FindingSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface ChangedFileEvidence {
  path: string;
  previousPath?: string | null;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  category: FileCategory;
  isBinary: boolean;
  excludedFromAi: boolean;
  excludeReason?: string | null;
  patchExcerpt?: string | null;
}

export interface AnalysisContext {
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
  commit: {
    headSha: string;
  };
  stats: {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
    filesIncludedInAi: number;
    filesExcludedFromAi: number;
    truncatedPatches: boolean;
  };
  changedFiles: ChangedFileEvidence[];
  /** Bounded text payload for the model (no secrets). */
  aiContextText: string;
  sensitiveAreas: string[];
}

export interface StructuredFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  summary: string;
  explanation: string;
  evidence: string;
  affectedFiles: string[];
  confidence: number | null;
  isInference: boolean;
  /** Stage 2.6 — optional; computed during calibration or when loading detail. */
  confidenceReason?: ConfidenceReason | null;
  /** Stage 2.6 — optional structured view of evidence string. */
  structuredEvidence?: StructuredEvidence | null;
}

export interface AiAnalysisResult {
  summary: string;
  overallStatus: OverallAnalysisStatus;
  findings: StructuredFinding[];
  provider: string;
  model: string;
}

export interface DeterministicAnalysisResult {
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  categories: Record<string, number>;
  sensitiveAreas: string[];
  hasTests: boolean;
  changedFiles: ChangedFileEvidence[];
  /** Stage 3 — intent verification & scope analysis (optional for older rows). */
  intentScope?: IntentScopeResult | null;
}

export interface AnalysisRecord {
  id: string;
  pullRequestId: string;
  analysisVersion: number;
  status: AnalysisJobStatus;
  headSha: string | null;
  overallStatus: OverallAnalysisStatus | null;
  summary: string | null;
  errorMessage: string | null;
  filesChanged: number | null;
  linesAdded: number | null;
  linesDeleted: number | null;
  provider: string | null;
  model: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Wall-clock duration in ms for completed analyses. */
  durationMs: number | null;
  createdAt: string;
  isOutdated: boolean;
  /** Stage 2 / 4 persisted scores */
  riskScore?: number | null;
  riskClassification?: string | null;
  scopeScore?: number | null;
  scopeClassification?: string | null;
  impactClassification?: string | null;
  /** Stage 4 final decision: LOW | REVIEW_RECOMMENDED | REVIEW_REQUIRED | BLOCKED */
  finalDecision?: string | null;
}

export interface AnalysisPerformanceMetrics {
  totalCompleted: number;
  averageDurationMs: number | null;
  fastestDurationMs: number | null;
  slowestDurationMs: number | null;
}

export interface AnalysisFindingRecord extends StructuredFinding {
  id: string;
  analysisId: string;
  sortOrder: number;
}

export interface AnalysisDetail extends AnalysisRecord {
  findings: AnalysisFindingRecord[];
  changedFiles: ChangedFileEvidence[];
  deterministicResult: DeterministicAnalysisResult | null;
  severityBreakdown: Record<FindingSeverity, number>;
  /** Stage 2.6 trust UX fields (computed; backward compatible). */
  decision: MergeDecision;
  primaryReason: string;
  decisionTrace: DecisionTraceItem[];
  overallConfidence: number | null;
  overallConfidenceReason: ConfidenceReason | null;
  riskBreakdown: Record<string, number>;
  docsOnly: boolean;
  /** Stage 3 — intent & scope (null when not computed / legacy analyses). */
  intentScope: IntentScopeResult | null;
  /** Stage 4 — final decision engine result (null for legacy analyses without recompute). */
  finalDecisionResult: import("@/lib/analysis/decision-engine").DecisionEngineResult | null;
  /** Stage 4 — affected areas (§21.7). */
  affectedAreas: Array<{
    id?: string;
    filePath: string;
    affectedArea: string;
    impactType: string;
    confidence: number | null;
    explanation: string | null;
  }>;
}
