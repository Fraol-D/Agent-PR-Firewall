/**
 * Deterministic merge decision + decision trace (Stage 2.6).
 * No AI prose — derived only from findings and change metadata.
 */

import type {
  DecisionTraceItem,
  DeterministicAnalysisResult,
  FindingCategory,
  FindingSeverity,
  MergeDecision,
  OverallAnalysisStatus,
  StructuredFinding,
} from "@/lib/analysis/types";

const DOC_PATH =
  /(^|\/)(README(\.\w+)?|CHANGELOG(\.\w+)?|LICENSE(\.\w+)?|CONTRIBUTING(\.\w+)?)$/i;
const DOC_EXT = /\.(md|mdx|txt|rst|adoc)$/i;

const SECRET_HINT =
  /\b(secret|api[_-]?key|private[_-]?key|password|token|credential|exfiltrat|leaked)\b/i;

const DESTRUCTIVE_MIGRATION =
  /\b(drop\s+table|drop\s+column|truncate|delete\s+from|destructive)\b/i;

export function isDocumentationOnlyChange(
  deterministic: DeterministicAnalysisResult | null | undefined,
): boolean {
  const files = deterministic?.changedFiles ?? [];
  if (files.length === 0) return false;
  return files.every(
    (f) =>
      f.category === "documentation" ||
      DOC_EXT.test(f.path) ||
      DOC_PATH.test(f.path) ||
      f.path.startsWith("docs/") ||
      f.path.startsWith("doc/"),
  );
}

function severityRank(s: FindingSeverity): number {
  switch (s) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
  }
}

function maxSeverity(findings: StructuredFinding[]): FindingSeverity | null {
  if (findings.length === 0) return null;
  return findings.reduce(
    (max, f) => (severityRank(f.severity) > severityRank(max) ? f.severity : max),
    findings[0].severity,
  );
}

function hasCategoryAtLeast(
  findings: StructuredFinding[],
  categories: FindingCategory[],
  min: FindingSeverity,
): boolean {
  const floor = severityRank(min);
  return findings.some(
    (f) => categories.includes(f.category) && severityRank(f.severity) >= floor,
  );
}

function countBySeverity(
  findings: StructuredFinding[],
  severities: FindingSeverity[],
): number {
  return findings.filter((f) => severities.includes(f.severity)).length;
}

export function averageConfidence(
  findings: StructuredFinding[],
): number | null {
  const values = findings
    .map((f) => f.confidence)
    .filter((c): c is number => c != null && Number.isFinite(c));
  if (values.length === 0) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(avg * 1000) / 1000;
}

export function mergeDecisionToOverall(
  decision: MergeDecision,
): OverallAnalysisStatus {
  switch (decision) {
    case "safe_to_merge":
      return "no_significant_concerns";
    case "review_recommended":
      return "review_recommended";
    case "block_merge":
      return "high_risk_concerns";
  }
}

export function overallToMergeDecision(
  overall: OverallAnalysisStatus | null | undefined,
): MergeDecision {
  switch (overall) {
    case "no_significant_concerns":
      return "safe_to_merge";
    case "high_risk_concerns":
      return "block_merge";
    case "review_recommended":
    default:
      return "review_recommended";
  }
}

export function mergeDecisionLabel(decision: MergeDecision): string {
  switch (decision) {
    case "safe_to_merge":
      return "Safe to merge";
    case "review_recommended":
      return "Review recommended";
    case "block_merge":
      return "Block merge";
  }
}

export interface DecisionInput {
  findings: StructuredFinding[];
  deterministic: DeterministicAnalysisResult | null | undefined;
  /** Optional AI overall — used only as weak signal when findings are empty. */
  aiOverallStatus?: OverallAnalysisStatus | null;
}

export interface DecisionResult {
  decision: MergeDecision;
  overallStatus: OverallAnalysisStatus;
  primaryReason: string;
  overallConfidence: number | null;
  docsOnly: boolean;
  trace: DecisionTraceItem[];
}

/**
 * Compute merge recommendation from observed findings + deterministic change facts.
 */
export function computeMergeDecision(input: DecisionInput): DecisionResult {
  const findings = input.findings ?? [];
  const deterministic = input.deterministic ?? null;
  const docsOnly = isDocumentationOnlyChange(deterministic);
  const sensitive = deterministic?.sensitiveAreas ?? [];
  const overallConfidence = averageConfidence(findings);
  const maxSev = maxSeverity(findings);

  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHighSecurity = findings.some(
    (f) =>
      f.severity === "high" &&
      (f.category === "SECURITY" || f.category === "AUTHENTICATION"),
  );
  const secretSignals = findings.some(
    (f) =>
      SECRET_HINT.test(f.title) ||
      SECRET_HINT.test(f.summary) ||
      SECRET_HINT.test(f.explanation) ||
      SECRET_HINT.test(f.evidence),
  );
  const destructiveMigration = findings.some(
    (f) =>
      f.category === "DATABASE" &&
      severityRank(f.severity) >= severityRank("high") &&
      DESTRUCTIVE_MIGRATION.test(
        `${f.title} ${f.summary} ${f.explanation} ${f.evidence}`,
      ),
  );
  const mediumPlus = countBySeverity(findings, [
    "medium",
    "high",
    "critical",
  ]);
  const sensitiveTouch =
    sensitive.includes("Authentication") ||
    sensitive.includes("Database") ||
    sensitive.includes("Infrastructure") ||
    hasCategoryAtLeast(
      findings,
      ["AUTHENTICATION", "DATABASE", "API", "SECURITY"],
      "medium",
    );
  const lowConfidence =
    overallConfidence != null && overallConfidence < 0.55 && findings.length > 0;

  let decision: MergeDecision = "safe_to_merge";
  let primaryReason = "No material risks detected in analyzed changes.";

  if (
    hasCritical ||
    hasHighSecurity ||
    secretSignals ||
    destructiveMigration
  ) {
    decision = "block_merge";
    if (hasCritical) {
      primaryReason = "Critical findings require resolution before merge.";
    } else if (secretSignals) {
      primaryReason = "Potential secret exposure or credential risk detected.";
    } else if (destructiveMigration) {
      primaryReason = "Destructive database migration risk detected.";
    } else {
      primaryReason = "High-severity security or authentication concerns.";
    }
  } else if (
    mediumPlus > 0 ||
    sensitiveTouch ||
    lowConfidence ||
    maxSev === "high"
  ) {
    decision = "review_recommended";
    if (mediumPlus > 0 || maxSev === "high") {
      primaryReason = "Medium or high severity findings need human review.";
    } else if (sensitiveTouch) {
      primaryReason =
        "Authentication, API, or database areas were modified.";
    } else if (lowConfidence) {
      primaryReason = "Overall confidence is below the review threshold.";
    } else {
      primaryReason = "Changes warrant a focused human review.";
    }
  } else if (docsOnly) {
    decision = "safe_to_merge";
    primaryReason =
      "Documentation-only change with no security or runtime risks.";
  } else if (findings.length === 0) {
    // Prefer AI overall if present when model returned no findings
    if (input.aiOverallStatus === "high_risk_concerns") {
      decision = "review_recommended";
      primaryReason =
        "No structured findings, but the model flagged elevated risk — review carefully.";
    } else {
      decision = "safe_to_merge";
      primaryReason = "No structured findings raised for this change set.";
    }
  } else {
    decision = "safe_to_merge";
    primaryReason =
      "Only informational or low-severity findings; no blocking concerns.";
  }

  const trace = buildDecisionTrace({
    decision,
    findings,
    docsOnly,
    sensitive,
    overallConfidence,
    secretSignals,
    destructiveMigration,
    hasCritical,
    mediumPlus,
    sensitiveTouch,
    lowConfidence,
  });

  return {
    decision,
    overallStatus: mergeDecisionToOverall(decision),
    primaryReason,
    overallConfidence,
    docsOnly,
    trace,
  };
}

function buildDecisionTrace(input: {
  decision: MergeDecision;
  findings: StructuredFinding[];
  docsOnly: boolean;
  sensitive: string[];
  overallConfidence: number | null;
  secretSignals: boolean;
  destructiveMigration: boolean;
  hasCritical: boolean;
  mediumPlus: number;
  sensitiveTouch: boolean;
  lowConfidence: boolean;
}): DecisionTraceItem[] {
  const items: DecisionTraceItem[] = [];
  const infoLow = countBySeverity(input.findings, ["info", "low"]);
  const highCrit = countBySeverity(input.findings, ["high", "critical"]);

  if (input.docsOnly) {
    items.push({
      id: "docs-only",
      tone: "positive",
      label: "Documentation-only change",
    });
    items.push({
      id: "no-exec",
      tone: "positive",
      label: "No executable code modified",
    });
  } else {
    items.push({
      id: "code-change",
      tone: "neutral",
      label: "Code or non-documentation files modified",
    });
  }

  if (input.sensitive.includes("Authentication") || input.sensitiveTouch) {
    const authFinding = input.findings.some(
      (f) => f.category === "AUTHENTICATION",
    );
    items.push({
      id: "auth",
      tone: authFinding || input.decision !== "safe_to_merge" ? "warning" : "neutral",
      label: "Authentication or identity surfaces touched",
    });
  } else {
    items.push({
      id: "no-auth",
      tone: "positive",
      label: "No authentication surface changes detected",
    });
  }

  if (input.secretSignals) {
    items.push({
      id: "secrets",
      tone: "negative",
      label: "Potential secrets or credentials referenced in findings",
    });
  } else {
    items.push({
      id: "no-secrets",
      tone: "positive",
      label: "No secrets detected in analyzed context",
    });
  }

  if (input.destructiveMigration) {
    items.push({
      id: "destructive-migration",
      tone: "negative",
      label: "Destructive migration language present in findings",
    });
  }

  if (input.hasCritical || highCrit > 0) {
    items.push({
      id: "critical",
      tone: "negative",
      label:
        highCrit === 1
          ? "1 high or critical finding"
          : `${highCrit} high or critical findings`,
    });
  } else if (input.mediumPlus > 0) {
    items.push({
      id: "medium",
      tone: "warning",
      label:
        input.mediumPlus === 1
          ? "1 medium-or-higher finding"
          : `${input.mediumPlus} medium-or-higher findings`,
    });
  } else if (infoLow > 0) {
    items.push({
      id: "info-low",
      tone: "positive",
      label:
        infoLow === 1
          ? "1 informational/low finding"
          : `${infoLow} informational/low findings`,
    });
  } else {
    items.push({
      id: "no-findings",
      tone: "positive",
      label: "No structured findings returned",
    });
  }

  if (input.findings.some((f) => f.category === "RELIABILITY" && severityRank(f.severity) >= 3)) {
    items.push({
      id: "reliability",
      tone: "warning",
      label: "Reliability concern requires attention",
    });
  }

  if (input.overallConfidence != null) {
    const pct = Math.round(input.overallConfidence * 100);
    items.push({
      id: "confidence",
      tone: input.lowConfidence ? "warning" : "positive",
      label: `Confidence: ${pct}%`,
    });
  }

  if (input.decision === "review_recommended") {
    items.push({
      id: "manual-review",
      tone: "warning",
      label: "Manual review recommended",
    });
  } else if (input.decision === "block_merge") {
    items.push({
      id: "block",
      tone: "negative",
      label: "Merge should be blocked until resolved",
    });
  } else {
    items.push({
      id: "safe",
      tone: "positive",
      label: "No blocking concerns for merge",
    });
  }

  // Cap for compact UI
  return items.slice(0, 8);
}

/** Category counts for the risk breakdown strip. */
export function buildRiskBreakdown(
  findings: StructuredFinding[],
): Record<string, number> {
  const keys = [
    "SECURITY",
    "RELIABILITY",
    "PERFORMANCE",
    "MAINTAINABILITY",
    "AUTHENTICATION",
    "CONFIGURATION",
    "DATABASE",
    "API",
    "DEPENDENCY",
    "DATA",
    "SCOPE",
    "OTHER",
  ] as const;

  const breakdown: Record<string, number> = {};
  for (const k of keys) breakdown[k] = 0;
  for (const f of findings) {
    const key = breakdown[f.category] !== undefined ? f.category : "OTHER";
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  }
  return breakdown;
}
