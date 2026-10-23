/**
 * Stage 3 — Intent verification & scope analysis domain types.
 */

export type ScopePrClassification =
  | "feature"
  | "bug_fix"
  | "documentation"
  | "refactor"
  | "dependency_update"
  | "security"
  | "performance"
  | "configuration"
  | "infrastructure"
  | "maintenance";

export type ScopeMatch =
  | "matches"
  | "partial"
  | "exceeds"
  | "unrelated"
  | "unknown";

export type ImplementationCoverage = "low" | "medium" | "high";

export type TaskSourceType =
  | "pr_title"
  | "pr_description"
  | "linked_issue"
  | "commit_messages"
  | "branch_name";

export interface TaskSource {
  type: TaskSourceType;
  label: string;
  excerpt: string;
}

export interface MissingWorkItem {
  id: string;
  label: string;
  detail: string;
  severity: "info" | "warning" | "high";
}

export interface IntentScopeResult {
  /** One-line intended task summary. */
  taskSummary: string;
  /** Sources that contributed to the task summary. */
  taskSources: TaskSource[];
  /** Primary PR classification. */
  classification: ScopePrClassification;
  /** Secondary classifications when signals are mixed. */
  secondaryClassifications: ScopePrClassification[];
  /** How well actual changes match the claimed task. */
  scopeMatch: ScopeMatch;
  scopeMatchReason: string;
  /** Estimated implementation coverage of the stated intent. */
  coverage: ImplementationCoverage;
  coverageReason: string;
  /** True when unrelated areas were modified. */
  scopeCreepDetected: boolean;
  scopeCreepSummary: string | null;
  /** Files judged outside the expected task areas. */
  unrelatedFiles: string[];
  /** Areas expected from the task (file categories / themes). */
  expectedAreas: string[];
  /** Areas actually touched. */
  actualAreas: string[];
  /** Completeness / companion-work gaps. */
  missingWork: MissingWorkItem[];
  /** Short overall recommendation for the Intent section. */
  overallRecommendation: string;
  /** Numeric 0–100 for DB scope_score. */
  scopeScore: number;
  /** DB enum: HIGH_COMPLIANCE | PARTIAL | LOW_COMPLIANCE | UNKNOWN */
  scopeClassificationDb:
    | "HIGH_COMPLIANCE"
    | "PARTIAL"
    | "LOW_COMPLIANCE"
    | "UNKNOWN";
}
