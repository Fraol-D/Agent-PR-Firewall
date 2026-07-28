/**
 * Stage 2 analysis domain types.
 */

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
  /** Optional free-text notes for evaluation / human review. */
  evaluationNotes: string | null;
  createdAt: string;
  isOutdated: boolean;
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
}
