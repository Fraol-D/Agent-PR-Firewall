/**
 * Risk Engine — Stage 2 outputs used by Stage 4 decision fusion.
 * Deterministic: derived from structured findings + sensitive areas.
 * No LLM calls.
 */

import type {
  DeterministicAnalysisResult,
  FindingSeverity,
  StructuredFinding,
} from "@/lib/analysis/types";
import type { RiskClassification, RiskSeverity } from "@/types/domain";

export interface RiskFactorDraft {
  category: string;
  severity: RiskSeverity;
  scoreContribution: number;
  title: string;
  description: string;
  sourceFile?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RiskAnalysisResult {
  riskScore: number;
  riskClassification: RiskClassification;
  factors: RiskFactorDraft[];
}

/** Severity → base contribution (Section 21.6 score contribution). */
export function severityToScore(severity: FindingSeverity | RiskSeverity): number {
  switch (severity) {
    case "info":
      return 0;
    case "low":
      return 10;
    case "medium":
      return 25;
    case "high":
      return 40;
    case "critical":
      return 60;
  }
}

/**
 * Compute risk score (0–100) and classification from calibrated findings.
 * Sensitive-area bonuses reflect deterministic file classification (Stage 2).
 */
export function computeRiskFromFindings(
  findings: StructuredFinding[],
  deterministic?: DeterministicAnalysisResult | null,
): RiskAnalysisResult {
  const factors: RiskFactorDraft[] = findings.map((f) => ({
    category: f.category.toLowerCase(),
    severity: f.severity,
    scoreContribution: severityToScore(f.severity),
    title: f.title,
    description: f.explanation || f.summary,
    sourceFile: f.affectedFiles[0] ?? null,
    metadata: {
      summary: f.summary,
      confidence: f.confidence,
      isInference: f.isInference,
      evidence: f.evidence?.slice(0, 500),
    },
  }));

  // Weighted sum of factor scores (diminishing returns via soft cap)
  let raw = factors.reduce((sum, f) => sum + f.scoreContribution, 0);

  // Sensitive-area pressure from deterministic classification
  const sensitive = deterministic?.sensitiveAreas ?? [];
  if (sensitive.includes("Authentication")) raw += 12;
  if (sensitive.includes("Database")) raw += 10;
  if (sensitive.includes("Infrastructure")) raw += 8;
  if (sensitive.includes("Configuration")) raw += 6;

  // Critical/high finding boosts so a single critical lands in CRITICAL band
  if (findings.some((f) => f.severity === "critical")) {
    raw = Math.max(raw, 80);
  } else if (
    findings.some(
      (f) =>
        f.severity === "high" &&
        (f.category === "SECURITY" || f.category === "AUTHENTICATION"),
    )
  ) {
    raw = Math.max(raw, 55);
  }

  const riskScore = Math.max(0, Math.min(100, Math.round(raw)));
  const riskClassification = classifyRiskScore(riskScore, findings);

  return { riskScore, riskClassification, factors };
}

export function classifyRiskScore(
  score: number,
  findings: StructuredFinding[] = [],
): RiskClassification {
  if (
    findings.some((f) => f.severity === "critical") ||
    score >= 75
  ) {
    return "CRITICAL";
  }
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

/** @deprecated Use computeRiskFromFindings — stub kept for call-site compatibility. */
export async function analyzeRisk(): Promise<RiskAnalysisResult> {
  return {
    riskScore: 0,
    riskClassification: "LOW",
    factors: [],
  };
}
