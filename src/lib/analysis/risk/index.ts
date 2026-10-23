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
      return 8;
    case "medium":
      return 18;
    case "high":
      return 38;
    case "critical":
      return 65;
  }
}

/**
 * Paths that often trigger noisy medium findings on intentional product work
 * (install routes, migrations, key-check scripts). Down-weight only for
 * medium/low — high/critical findings on these paths still count fully.
 */
const EXPECTED_INFRA_PATH =
  /(^|\/)(scripts\/|supabase\/migrations\/|src\/app\/api\/github\/|src\/lib\/github\/|\.github\/)/i;

const NOISY_MEDIUM_TITLE =
  /\b(may handle secrets?|new github app|new supabase migration|new api route|github integration)\b/i;

/**
 * Compute risk score (0–100) and classification from calibrated findings.
 * Sensitive-area bonuses reflect deterministic file classification (Stage 2).
 *
 * Tuned to avoid stacking many medium “new API / migration / script” findings
 * into HIGH/CRITICAL while still elevating real critical and high security hits.
 */
export function computeRiskFromFindings(
  findings: StructuredFinding[],
  deterministic?: DeterministicAnalysisResult | null,
): RiskAnalysisResult {
  const factors: RiskFactorDraft[] = findings.map((f) => {
    let contribution = severityToScore(f.severity);
    const path = f.affectedFiles[0] ?? "";
    const discounted = shouldDiscountFinding(f, path);
    if (discounted) {
      // Keep visibility in the UI factors list, but reduce score weight.
      contribution = Math.round(contribution * 0.35);
    }
    return {
      category: f.category.toLowerCase(),
      severity: f.severity,
      scoreContribution: contribution,
      title: f.title,
      description: f.explanation || f.summary,
      sourceFile: path || null,
      metadata: {
        summary: f.summary,
        confidence: f.confidence,
        isInference: f.isInference,
        evidence: f.evidence?.slice(0, 500),
        scoreDiscounted: discounted,
      },
    };
  });

  // Soft saturation so N medium findings don't linear-sum into CRITICAL
  let raw = 0;
  const sorted = [...factors].sort(
    (a, b) => b.scoreContribution - a.scoreContribution,
  );
  sorted.forEach((f, i) => {
    const weight = i === 0 ? 1 : i === 1 ? 0.85 : i === 2 ? 0.65 : 0.4;
    raw += f.scoreContribution * weight;
  });

  // Mild sensitive-area pressure (not enough alone to force HIGH)
  const sensitive = deterministic?.sensitiveAreas ?? [];
  if (sensitive.includes("Authentication")) raw += 6;
  if (sensitive.includes("Database")) raw += 5;
  if (sensitive.includes("Infrastructure")) raw += 4;
  if (sensitive.includes("Configuration")) raw += 3;

  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHighSecurityAuth = findings.some(
    (f) =>
      f.severity === "high" &&
      (f.category === "SECURITY" || f.category === "AUTHENTICATION") &&
      !shouldDiscountFinding(f, f.affectedFiles[0] ?? ""),
  );

  // Real critical/high security still floors into elevated bands
  if (hasCritical) {
    raw = Math.max(raw, 78);
  } else if (hasHighSecurityAuth) {
    raw = Math.max(raw, 52);
  }

  const riskScore = Math.max(0, Math.min(100, Math.round(raw)));
  const riskClassification = classifyRiskScore(riskScore, findings);

  return { riskScore, riskClassification, factors };
}

function shouldDiscountFinding(
  finding: Pick<StructuredFinding, "severity" | "title" | "category">,
  path: string,
): boolean {
  // Never discount high/critical — those must stay visible to blocking policy
  if (finding.severity === "high" || finding.severity === "critical") {
    return false;
  }
  if (EXPECTED_INFRA_PATH.test(path)) return true;
  if (NOISY_MEDIUM_TITLE.test(finding.title)) return true;
  return false;
}

export function classifyRiskScore(
  score: number,
  findings: StructuredFinding[] = [],
): RiskClassification {
  const hasCritical = findings.some((f) => f.severity === "critical");
  // CRITICAL requires an actual critical finding OR a very high score
  if (hasCritical || score >= 80) {
    return "CRITICAL";
  }
  // Slightly higher bar for HIGH so medium stacks stay MEDIUM
  if (score >= 55) return "HIGH";
  if (score >= 28) return "MEDIUM";
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
