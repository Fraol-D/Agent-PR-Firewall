/**
 * Stage 4 Decision Engine — pure fusion of Stage 2 risk + Stage 3 scope.
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
import type { ImpactClassification } from "@/types/domain";

/**
 * Combine risk + scope (+ light impact signals) into a final decision + reasons.
 */
export function computeFinalDecision(
  input: DecisionEngineInput,
  rules: DecisionRule[] = DEFAULT_DECISION_RULES,
): DecisionEngineResult {
  const impactClassification =
    input.impactClassification ??
    deriveImpactClassification(input);

  const rule = matchDecisionRule(
    input.riskClassification,
    input.scopeClassification,
    rules,
  );

  // Escalation: high blast radius + already elevated risk → at least REVIEW_REQUIRED
  let finalDecision = rule.decision;
  let matchedRuleId = rule.id;

  if (
    impactClassification === "HIGH" &&
    (input.riskClassification === "HIGH" ||
      input.riskClassification === "MEDIUM") &&
    finalDecision !== "BLOCKED"
  ) {
    if (
      finalDecision === "LOW" ||
      finalDecision === "REVIEW_RECOMMENDED"
    ) {
      finalDecision = "REVIEW_REQUIRED";
      matchedRuleId = `${rule.id}+impact-escalation`;
    }
  }

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

  const reasons = buildReasons(input, finalDecision, matchedRuleId, impactClassification);

  const summary = `Decision ${finalDecision} from risk ${input.riskClassification} (${input.riskScore}) and scope ${input.scopeClassification} (${input.scopeScore}).`;

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

function deriveImpactClassification(
  input: DecisionEngineInput,
): ImpactClassification {
  const areaCount = input.affectedAreas.length;
  const sensitiveHits = (input.sensitiveAreas ?? []).length;
  const highImpactTypes = input.affectedAreas.filter((a) =>
    /authentication|database|security|infrastructure/i.test(a.affectedArea),
  ).length;

  if (highImpactTypes >= 3 || (sensitiveHits >= 2 && areaCount >= 8)) {
    return "HIGH";
  }
  if (highImpactTypes >= 1 || areaCount >= 5 || sensitiveHits >= 1) {
    return "MEDIUM";
  }
  if (areaCount === 0) return "UNKNOWN";
  return "LOW";
}

function buildReasons(
  input: DecisionEngineInput,
  decision: DecisionEngineResult["finalDecision"],
  ruleId: string,
  impact: ImpactClassification,
): DecisionReason[] {
  const reasons: DecisionReason[] = [];

  // Policy / matrix
  reasons.push({
    id: "policy-matrix",
    message: `Policy rule "${ruleId}" maps risk ${input.riskClassification} × scope ${input.scopeClassification} → ${decision}.`,
    source: "policy",
    ruleId,
  });

  // Risk factors (highest severity first)
  const sortedFactors = [...input.riskFactors].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );

  for (const factor of sortedFactors.slice(0, 5)) {
    if (severityRank(factor.severity) < severityRank("medium") && sortedFactors.length > 3) {
      // Skip low/info when we already have enough stronger factors
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

  if (
    sortedFactors.length === 0 &&
    input.riskClassification !== "LOW"
  ) {
    reasons.push({
      id: "risk-aggregate",
      message: `Aggregate risk classification is ${input.riskClassification} (score ${input.riskScore}/100).`,
      source: "risk_factor",
      ruleId,
    });
  }

  // Scope
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
      message: `Partial scope compliance (scope score ${input.scopeScore}/100). Implementation only partially matches the stated task.`,
      source: "scope",
      ruleId,
    });
  } else if (input.scopeClassification === "HIGH_COMPLIANCE") {
    reasons.push({
      id: "scope-high",
      message: `Scope compliance is high (score ${input.scopeScore}/100) — changes largely match the stated task.`,
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
        ? `Scope creep detected in files outside the expected task areas (e.g. ${sample}).`
        : "Scope creep detected: files outside the expected task areas were modified.",
      source: "scope",
      ruleId,
    });
  }

  // Affected areas — prefer sensitive / creep
  const notableAreas = [...input.affectedAreas]
    .filter(
      (a) =>
        a.impactType === "scope_creep" ||
        /authentication|database|security|infrastructure|configuration/i.test(
          a.affectedArea,
        ),
    )
    .slice(0, 4);

  for (const area of notableAreas) {
    reasons.push({
      id: `area-${slug(area.filePath)}`,
      message:
        area.explanation ||
        `${titleCase(area.affectedArea)} area touched via ${area.filePath} (${area.impactType.replace(/_/g, " ")}).`,
      source: "affected_area",
      affectedArea: area.affectedArea,
      filePath: area.filePath,
      ruleId,
    });
  }

  if (impact === "HIGH") {
    reasons.push({
      id: "impact-high",
      message: "High potential blast radius across sensitive or many repository areas.",
      source: "impact",
      ruleId,
    });
  } else if (impact === "MEDIUM" && decision !== "LOW") {
    reasons.push({
      id: "impact-medium",
      message: "Moderate blast radius — multiple modules or sensitive surfaces are involved.",
      source: "impact",
      ruleId,
    });
  }

  // Ensure at least one plain reason beyond pure policy for empty inputs
  if (reasons.length === 1 && decision === "LOW") {
    reasons.push({
      id: "all-clear",
      message: "No high-severity risk factors or significant scope deviations were detected.",
      source: "policy",
      ruleId,
    });
  }

  return reasons.slice(0, 12);
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

/** Labels for UI display. */
export function finalDecisionLabel(decision: DecisionEngineResult["finalDecision"]): string {
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
