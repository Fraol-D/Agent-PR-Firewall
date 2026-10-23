/**
 * Stage 4 — Final decision types (REQUIREMENTS §8.8, §18, §21.5).
 */

import type {
  Decision,
  ImpactClassification,
  RiskClassification,
  ScopeClassification,
} from "@/types/domain";

export type { Decision, RiskClassification, ScopeClassification };

export type DecisionReasonSource =
  | "risk_factor"
  | "affected_area"
  | "scope"
  | "impact"
  | "policy";

export interface DecisionReason {
  id: string;
  /** Plain-language explanation shown in the UI. */
  message: string;
  source: DecisionReasonSource;
  /** Optional link to a risk factor title/category. */
  riskFactorTitle?: string | null;
  riskFactorCategory?: string | null;
  riskFactorSeverity?: string | null;
  /** Optional link to an affected area / file. */
  affectedArea?: string | null;
  filePath?: string | null;
  /** Rule id from the threshold table that contributed. */
  ruleId?: string | null;
}

export interface DecisionEngineInput {
  riskScore: number;
  riskClassification: RiskClassification;
  scopeScore: number;
  scopeClassification: ScopeClassification;
  /** Import-graph blast radius (genuine third input). */
  impactClassification?: ImpactClassification | null;
  impactConfidence?: number | null;
  impactExplanation?: string | null;
  riskFactors: Array<{
    category: string;
    severity: string;
    title: string;
    description: string;
    sourceFile?: string | null;
    scoreContribution?: number;
  }>;
  affectedAreas: Array<{
    filePath: string;
    affectedArea: string;
    impactType: string;
    explanation?: string | null;
  }>;
  /** Stage 3 extras for richer reasons */
  scopeCreepDetected?: boolean;
  unrelatedFiles?: string[];
  coverage?: string | null;
  sensitiveAreas?: string[];
}

export interface DecisionEngineResult {
  finalDecision: Decision;
  reasons: DecisionReason[];
  riskScore: number;
  riskClassification: RiskClassification;
  scopeScore: number;
  scopeClassification: ScopeClassification;
  impactClassification: ImpactClassification;
  /** Which matrix rule fired. */
  matchedRuleId: string;
  /** Human summary line. */
  summary: string;
}
