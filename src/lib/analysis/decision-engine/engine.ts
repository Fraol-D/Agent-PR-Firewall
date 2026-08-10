/**
 * Stage 4 Decision Engine — pure fusion of Stage 2 risk + Stage 3 scope
 * + Stage impact (import-graph blast radius).
 * No LLM calls.
 */

import {
  DEFAULT_DECISION_RULES,
  matchDecisionRule,
  type DecisionRule,
} from "@/lib/analysis/decision-engine/thresholds";
import type {
  DecisionEngineInput,
  DecisionEngineResult,
  DecisionReason,
} from "@/lib/analysis/decision-engine/types";
import type { Decision, ImpactClassification } from "@/types/domain";

/**
 * Combine risk + scope into a base decision, then apply HIGH-impact escalation.
 */
export function computeFinalDecision(
  input: DecisionEngineInput,
  rules: DecisionRule[] = DEFAULT_DECISION_RULES,
): DecisionEngineResult {
  const impactClassification: ImpactClassification =
    input.impactClassification ?? "UNKNOWN";

  const rule = matchDecisionRule(
    input.riskClassification,
    input.scopeClassification,
    rules,
  );

  let finalDecision = rule.decision;
  let matchedRuleId = rule.id;

  // Scope creep with medium+ risk escalates recommended → required
  if (
    input.scopeCreepDetected &&
    (input.riskClassification === "MEDIUM" ||
      input.riskClassification === "HIGH" ||
      input.riskClassification === "CRITICAL") &&
    finalDecision === "REVIEW_RECOMMENDED"
  ) {
    finalDecision = "REVIEW_REQUIRED";
    matchedRuleId = `${matchedRuleId}+scope-creep-escalation`;
  }

  // Genuine third input: HIGH import-graph impact escalates one level
  // independent of whether risk/scope already saw "sensitive" tags.
  if (impactClassification === "HIGH") {
    const escalated = escalateOneLevel(finalDecision);
    if (escalated !== finalDecision) {
      matchedRuleId = `${matchedRuleId}+high-impact-escalation`;
      finalDecision = escalated;
    }
  }

  const reasons = buildReasons(
    input,
    finalDecision,
    matchedRuleId,
    impactClassification,
  );

  const summary = `Decision ${finalDecision} from risk ${input.riskClassification} (${input.riskScore}), scope ${input.scopeClassification} (${input.scopeScore}), impact ${impactClassification}.`;

  return {
    finalDecision,
    reasons,
    riskScore: input.riskScore,
    riskClassification: input.riskClassification,
    scopeScore: input.scopeScore,
    scopeClassification: input.scopeClassification,
    impactClassification,
    matchedRuleId,
    summary,
  };
}

/** One-level severity increase for HIGH blast radius. */
export function escalateOneLevel(decision: Decision): Decision {
  switch (decision) {
    case "LOW":
      return "REVIEW_RECOMMENDED";
    case "REVIEW_RECOMMENDED":
      return "REVIEW_REQUIRED";
    case "REVIEW_REQUIRED":
      return "BLOCKED";
    case "BLOCKED":
      return "BLOCKED";
  }
}

function buildReasons(
  input: DecisionEngineInput,
  decision: Decision,
  ruleId: string,
  impact: ImpactClassification,
): DecisionReason[] {
  const reasons: DecisionReason[] = [];

  reasons.push({
    id: "policy-matrix",
    message: `Policy rule maps risk ${input.riskClassification} × scope ${input.scopeClassification} (base), then impact ${impact} → ${decision} (rule ${ruleId}).`,
    source: "policy",
    ruleId,
  });

  const sortedFactors = [...input.riskFactors].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );

  for (const factor of sortedFactors.slice(0, 5)) {
    if (
      severityRank(factor.severity) < severityRank("medium") &&
      sortedFactors.length > 3
    ) {
      if (reasons.filter((r) => r.source === "risk_factor").length >= 2) continue;
    }
    const fileNote = factor.sourceFile ? ` in ${factor.sourceFile}` : "";
    reasons.push({
      id: `risk-${slug(factor.title)}`,
      message: formatRiskReason(factor, fileNote),
      source: "risk_factor",
      riskFactorTitle: factor.title,
      riskFactorCategory: factor.category,
      riskFactorSeverity: factor.severity,
      filePath: factor.sourceFile ?? null,
      ruleId,
    });
  }

  if (sortedFactors.length === 0 && input.riskClassification !== "LOW") {
    reasons.push({
      id: "risk-aggregate",
      message: `Aggregate risk classification is ${input.riskClassification} (score ${input.riskScore}/100).`,
      source: "risk_factor",
      ruleId,
    });
  }

  if (input.scopeClassification === "LOW_COMPLIANCE") {
    reasons.push({
      id: "scope-low",
      message: `Significant scope deviation (scope score ${input.scopeScore}/100, ${input.scopeClassification}).`,
      source: "scope",
      ruleId,
    });
  } else if (input.scopeClassification === "PARTIAL") {
    reasons.push({
      id: "scope-partial",
      message: `Partial scope compliance (scope score ${input.scopeScore}/100).`,
      source: "scope",
      ruleId,
    });
  } else if (input.scopeClassification === "HIGH_COMPLIANCE") {
    reasons.push({
      id: "scope-high",
      message: `Scope compliance is high (score ${input.scopeScore}/100).`,
      source: "scope",
      ruleId,
    });
  } else {
    reasons.push({
      id: "scope-unknown",
      message: `Scope compliance could not be fully determined (score ${input.scopeScore}/100).`,
      source: "scope",
      ruleId,
    });
  }

  if (input.scopeCreepDetected) {
    const sample = (input.unrelatedFiles ?? []).slice(0, 3).join(", ");
    reasons.push({
      id: "scope-creep",
      message: sample
        ? `Scope creep detected (e.g. ${sample}).`
        : "Scope creep detected outside expected task areas.",
      source: "scope",
      ruleId,
    });
  }

  // Impact / blast radius (import graph)
  if (input.impactExplanation) {
    reasons.push({
      id: "impact-graph",
      message: `Blast radius ${impact}: ${input.impactExplanation}${
        input.impactConfidence != null
          ? ` Confidence ${input.impactConfidence}.`
          : ""
      }`,
      source: "impact",
      ruleId,
    });
  } else if (impact === "HIGH") {
    reasons.push({
      id: "impact-high",
      message:
        "High potential blast radius from import-graph dependents (decision escalated one level).",
      source: "impact",
      ruleId,
    });
  } else if (impact === "MEDIUM") {
    reasons.push({
      id: "impact-medium",
      message: "Moderate blast radius — multiple reverse dependents detected.",
      source: "impact",
      ruleId,
    });
  }

  // Prefer graph-backed dependent rows over category-only
  const notableAreas = [...input.affectedAreas]
    .filter((a) =>
      /dependent|route|blast/i.test(a.impactType) ||
      /authentication|database|security|route/i.test(a.affectedArea),
    )
    .slice(0, 5);

  for (const area of notableAreas) {
    reasons.push({
      id: `area-${slug(area.filePath)}`,
      message:
        area.explanation ||
        `${titleCase(area.affectedArea)}: ${area.filePath} (${area.impactType.replace(/_/g, " ")}).`,
      source: "affected_area",
      affectedArea: area.affectedArea,
      filePath: area.filePath,
      ruleId,
    });
  }

  if (reasons.length === 1 && decision === "LOW") {
    reasons.push({
      id: "all-clear",
      message:
        "No high-severity risk factors, major scope deviation, or high blast radius detected.",
      source: "policy",
      ruleId,
    });
  }

  return reasons.slice(0, 14);
}

function formatRiskReason(
  factor: DecisionEngineInput["riskFactors"][number],
  fileNote: string,
): string {
  const sev = factor.severity.toLowerCase();
  if (sev === "critical" || sev === "high") {
    if (/auth/i.test(factor.category) || /auth/i.test(factor.title)) {
      return `High-risk authentication change: ${factor.title}${fileNote}.`;
    }
    if (/security/i.test(factor.category)) {
      return `High-risk security finding: ${factor.title}${fileNote}.`;
    }
    return `${titleCase(sev)}-risk ${factor.category} change: ${factor.title}${fileNote}.`;
  }
  return `${titleCase(sev)} ${factor.category} risk: ${factor.title}${fileNote}.`;
}

function severityRank(s: string): number {
  switch (s.toLowerCase()) {
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
    default:
      return 0;
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function finalDecisionLabel(decision: Decision): string {
  switch (decision) {
    case "LOW":
      return "Low risk";
    case "REVIEW_RECOMMENDED":
      return "Review recommended";
    case "REVIEW_REQUIRED":
      return "Review required";
    case "BLOCKED":
      return "Blocked";
  }
}
