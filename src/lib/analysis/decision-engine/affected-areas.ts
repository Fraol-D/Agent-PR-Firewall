/**
 * Build affected-area records from Stage 2/3 outputs for §21.7 persistence
 * and decision reasons. Deterministic — no LLM.
 */

import type { DeterministicAnalysisResult } from "@/lib/analysis/types";
import type { IntentScopeResult } from "@/lib/analysis/scope/types";

export interface AffectedAreaDraft {
  filePath: string;
  affectedArea: string;
  impactType: string;
  confidence: number | null;
  explanation: string;
}

export function buildAffectedAreas(input: {
  deterministic: DeterministicAnalysisResult;
  intentScope?: IntentScopeResult | null;
}): AffectedAreaDraft[] {
  const unrelated = new Set(input.intentScope?.unrelatedFiles ?? []);
  const areas: AffectedAreaDraft[] = [];

  for (const file of input.deterministic.changedFiles) {
    const isCreep = unrelated.has(file.path);
    const areaLabel = categoryToArea(file.category);
    areas.push({
      filePath: file.path,
      affectedArea: areaLabel,
      impactType: isCreep ? "scope_creep" : mapStatus(file.status),
      confidence: isCreep ? 0.85 : 0.7,
      explanation: isCreep
        ? `${file.path} is outside the expected task areas (${areaLabel}).`
        : `${titleCase(file.status)} ${areaLabel.toLowerCase()} file (${file.category}).`,
    });
  }

  // Cap for storage/UI
  return areas.slice(0, 80);
}

function categoryToArea(category: string): string {
  switch (category) {
    case "authentication":
      return "Authentication";
    case "database":
      return "Database";
    case "frontend":
      return "Frontend";
    case "backend":
      return "Backend";
    case "configuration":
      return "Configuration";
    case "infrastructure":
      return "Infrastructure";
    case "tests":
      return "Tests";
    case "documentation":
      return "Documentation";
    case "dependencies":
      return "Dependencies";
    default:
      return "General";
  }
}

function mapStatus(status: string): string {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
