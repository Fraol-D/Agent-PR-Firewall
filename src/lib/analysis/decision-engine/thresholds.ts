/**
 * Configurable decision thresholds (Stage 4).
 * Explicit rule table — not a full policy DSL/UI.
 *
 * REQUIREMENTS §18 examples:
 *   Scope HIGH_COMPLIANCE + Risk LOW  → LOW
 *   Scope LOW_COMPLIANCE  + Risk HIGH → BLOCKED
 */

import type {
  Decision,
  RiskClassification,
  ScopeClassification,
} from "@/types/domain";

export type RiskMatch = RiskClassification | "*";
export type ScopeMatch = ScopeClassification | "*";

export interface DecisionRule {
  id: string;
  /** Human label for docs/debug. */
  description: string;
  risk: RiskMatch;
  scope: ScopeMatch;
  decision: Decision;
  /**
   * Lower = evaluated first (higher priority).
   * Blocking rules should sort before softer ones.
   */
  priority: number;
}

/**
 * Default policy matrix. First matching rule by ascending priority wins.
 * Adjust this object to tune product behavior without a rules editor UI.
 */
export const DEFAULT_DECISION_RULES: DecisionRule[] = [
  // BLOCK is reserved for CRITICAL risk classification (real critical findings
  // or very high scores). High risk + bad scope → REVIEW_REQUIRED, not BLOCK.
  {
    id: "critical-risk-any-scope",
    description: "Critical risk always blocks",
    risk: "CRITICAL",
    scope: "*",
    decision: "BLOCKED",
    priority: 10,
  },
  {
    id: "high-risk-low-scope",
    description: "High risk with low scope compliance requires human review",
    risk: "HIGH",
    scope: "LOW_COMPLIANCE",
    decision: "REVIEW_REQUIRED",
    priority: 20,
  },
  {
    id: "high-risk-unknown-scope",
    description: "High risk with unknown scope requires review",
    risk: "HIGH",
    scope: "UNKNOWN",
    decision: "REVIEW_REQUIRED",
    priority: 25,
  },
  {
    id: "high-risk-partial-scope",
    description: "High risk with partial scope requires review",
    risk: "HIGH",
    scope: "PARTIAL",
    decision: "REVIEW_REQUIRED",
    priority: 30,
  },
  {
    id: "high-risk-high-scope",
    description: "High risk even with good scope still requires review",
    risk: "HIGH",
    scope: "HIGH_COMPLIANCE",
    decision: "REVIEW_REQUIRED",
    priority: 35,
  },
  {
    id: "medium-risk-low-scope",
    description: "Medium risk + low scope → review recommended (not required)",
    risk: "MEDIUM",
    scope: "LOW_COMPLIANCE",
    decision: "REVIEW_RECOMMENDED",
    priority: 40,
  },
  {
    id: "low-risk-low-scope",
    description: "Low risk but significant scope deviation → review recommended",
    risk: "LOW",
    scope: "LOW_COMPLIANCE",
    decision: "REVIEW_RECOMMENDED",
    priority: 45,
  },
  {
    id: "medium-risk-partial-scope",
    description: "Medium risk + partial scope → review recommended",
    risk: "MEDIUM",
    scope: "PARTIAL",
    decision: "REVIEW_RECOMMENDED",
    priority: 50,
  },
  {
    id: "medium-risk-high-scope",
    description: "Medium risk with high scope compliance → review recommended",
    risk: "MEDIUM",
    scope: "HIGH_COMPLIANCE",
    decision: "REVIEW_RECOMMENDED",
    priority: 55,
  },
  {
    id: "medium-risk-unknown-scope",
    description: "Medium risk + unknown scope → review recommended",
    risk: "MEDIUM",
    scope: "UNKNOWN",
    decision: "REVIEW_RECOMMENDED",
    priority: 56,
  },
  {
    id: "low-risk-partial-scope",
    description: "Low risk + partial scope → review recommended",
    risk: "LOW",
    scope: "PARTIAL",
    decision: "REVIEW_RECOMMENDED",
    priority: 60,
  },
  {
    id: "low-risk-unknown-scope",
    description: "Low risk + unknown scope → review recommended",
    risk: "LOW",
    scope: "UNKNOWN",
    decision: "REVIEW_RECOMMENDED",
    priority: 65,
  },
  {
    id: "low-risk-high-scope",
    description: "Low risk + high scope compliance → LOW",
    risk: "LOW",
    scope: "HIGH_COMPLIANCE",
    decision: "LOW",
    priority: 100,
  },
  {
    id: "critical-wildcard-fallback",
    description: "Fallback: treat unmatched as review recommended",
    risk: "*",
    scope: "*",
    decision: "REVIEW_RECOMMENDED",
    priority: 1000,
  },
];

/** Numeric bands used when only a score is available (optional override points). */
export const DEFAULT_RISK_SCORE_BANDS = {
  mediumMin: 28,
  highMin: 55,
  criticalMin: 80,
} as const;

export function matchDecisionRule(
  risk: RiskClassification,
  scope: ScopeClassification,
  rules: DecisionRule[] = DEFAULT_DECISION_RULES,
): DecisionRule {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    const riskOk = rule.risk === "*" || rule.risk === risk;
    const scopeOk = rule.scope === "*" || rule.scope === scope;
    if (riskOk && scopeOk) return rule;
  }
  return {
    id: "hardcoded-fallback",
    description: "No rule matched",
    risk: "*",
    scope: "*",
    decision: "REVIEW_RECOMMENDED",
    priority: 9999,
  };
}
