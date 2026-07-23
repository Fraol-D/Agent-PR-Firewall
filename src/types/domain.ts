/**
 * Core domain types for Agent PR Firewall.
 * Structured to support explainable analysis and historical runs.
 */

export type Decision =
  | "LOW"
  | "REVIEW_RECOMMENDED"
  | "REVIEW_REQUIRED"
  | "BLOCKED";

export type RiskClassification = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ScopeClassification =
  | "HIGH_COMPLIANCE"
  | "PARTIAL"
  | "LOW_COMPLIANCE"
  | "UNKNOWN";

export type ImpactClassification = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type AnalysisStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type PullRequestStatus = "open" | "closed" | "merged" | "draft";

export type RepositoryConnectionStatus =
  | "connected"
  | "pending"
  | "error"
  | "disconnected";

export type InstallationStatus = "active" | "suspended" | "deleted";

export type TaskSourceType =
  | "issue_title"
  | "issue_description"
  | "pr_title"
  | "pr_description"
  | "manual";

export type RiskSeverity = "info" | "low" | "medium" | "high" | "critical";

export type AnalysisEventType =
  | "pr_received"
  | "pr_updated"
  | "pr_closed"
  | "analysis_started"
  | "deterministic_completed"
  | "scope_completed"
  | "llm_started"
  | "llm_completed"
  | "analysis_completed"
  | "analysis_failed"
  | "decision_changed"
  | "feedback_posted"
  | "human_override";

export interface UserProfile {
  id: string;
  githubUserId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubInstallation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  accountId: number;
  status: InstallationStatus;
  suspendedAt: string | null;
  connectedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Repository {
  id: string;
  githubRepositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  installationId: string | null;
  githubInstallationId: number | null;
  connectedByUserId: string;
  isActive: boolean;
  connectionStatus: RepositoryConnectionStatus;
  connectionError: string | null;
  lastSyncedAt: string | null;
  htmlUrl: string | null;
  private: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequest {
  id: string;
  githubPrId: number;
  repositoryId: string;
  number: number;
  title: string;
  description: string | null;
  authorLogin: string;
  authorAvatarUrl: string | null;
  sourceBranch: string;
  targetBranch: string;
  status: PullRequestStatus;
  isDraft: boolean;
  headSha: string | null;
  htmlUrl: string | null;
  mergedAt: string | null;
  closedAt: string | null;
  githubCreatedAt: string | null;
  githubUpdatedAt: string | null;
  lastEventAction: string | null;
  lastIngestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequestListItem extends PullRequest {
  repositoryFullName: string;
  repositoryOwner: string;
  repositoryName: string;
}

export interface Task {
  id: string;
  pullRequestId: string;
  sourceType: TaskSourceType;
  title: string | null;
  description: string | null;
  extractedContent: string;
  createdAt: string;
}

export interface Analysis {
  id: string;
  pullRequestId: string;
  analysisVersion: number;
  status: AnalysisStatus;
  riskScore: number | null;
  riskClassification: RiskClassification | null;
  scopeScore: number | null;
  scopeClassification: ScopeClassification | null;
  impactClassification: ImpactClassification | null;
  finalDecision: Decision | null;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface RiskFactor {
  id: string;
  analysisId: string;
  category: string;
  severity: RiskSeverity;
  scoreContribution: number;
  title: string;
  description: string;
  sourceFile: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AffectedArea {
  id: string;
  analysisId: string;
  filePath: string;
  affectedArea: string;
  impactType: string;
  confidence: number | null;
  explanation: string | null;
}

export interface AnalysisEvent {
  id: string;
  analysisId: string | null;
  pullRequestId: string | null;
  eventType: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface OverviewStats {
  connectedRepositories: number;
  ingestedPullRequests: number;
  openPullRequests: number;
  analyzedPullRequests: number;
  lowRiskCount: number;
  reviewRequiredCount: number;
  blockedCount: number;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
