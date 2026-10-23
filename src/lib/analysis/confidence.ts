import type {
  AnalysisContext,
  ConfidenceReason,
  StructuredFinding,
} from "@/lib/analysis/types";

/**
 * Deterministic confidence calibration (Stage 2.5 / 2.6).
 *
 * Algorithm (applied per finding after AI returns a raw confidence):
 *
 * 1. Start with AI confidence in [0, 1], or 0.55 if missing.
 * 2. Cap hard ceiling at 0.95 (models rarely deserve 100%).
 * 3. Multiplicative adjustments:
 *    - Inference (not observed): × 0.85
 *    - Evidence weak/empty/boilerplate: × 0.70
 *    - Evidence mentions a real analyzed file path: × 1.05 (then re-capped)
 *    - No valid affectedFiles after filtering: × 0.75
 *    - High excluded-file ratio in context (>50% excluded from AI): × 0.90
 *    - Truncated AI context: × 0.92
 *    - Deterministic sensitive-area agreement (finding category maps to a
 *      sensitive area present in deterministic result): × 1.04 (then re-capped)
 * 4. Floor at 0.05 so UI never shows zero for a real finding.
 * 5. Final clamp to [0.05, 0.95].
 * 6. Attach a human-readable confidence reason (Stage 2.6).
 */

const WEAK_EVIDENCE =
  /no concrete evidence|no evidence|n\/a|none|todo|unknown|not provided/i;

function categoryMatchesSensitive(
  category: string,
  sensitiveAreas: string[],
): boolean {
  const map: Record<string, string[]> = {
    SECURITY: ["Configuration", "Authentication", "Infrastructure"],
    AUTHENTICATION: ["Authentication"],
    DATABASE: ["Database"],
    CONFIGURATION: ["Configuration"],
    DEPENDENCY: ["Dependencies"],
    API: ["Authentication"],
  };
  const targets = map[category] ?? [];
  return targets.some((t) => sensitiveAreas.includes(t));
}

export function calibrateFindingConfidence(
  finding: StructuredFinding,
  context: AnalysisContext,
  analyzedFilePaths: Set<string>,
): number {
  let conf =
    finding.confidence == null || Number.isNaN(finding.confidence)
      ? 0.55
      : finding.confidence;

  // Step 2 — hard ceiling
  conf = Math.min(conf, 0.95);

  // Step 3 — adjustments
  if (finding.isInference) {
    conf *= 0.85;
  }

  const evidence = (finding.evidence ?? "").trim();
  if (!evidence || WEAK_EVIDENCE.test(evidence) || evidence.length < 24) {
    conf *= 0.7;
  } else {
    const mentionsFile = [...analyzedFilePaths].some((p) =>
      evidence.includes(p),
    );
    if (mentionsFile) {
      conf = Math.min(0.95, conf * 1.05);
    }
  }

  if (finding.affectedFiles.length === 0) {
    conf *= 0.75;
  }

  const total = context.stats.filesChanged || 1;
  const excludedRatio = context.stats.filesExcludedFromAi / total;
  if (excludedRatio > 0.5) {
    conf *= 0.9;
  }

  if (context.stats.truncatedPatches) {
    conf *= 0.92;
  }

  if (categoryMatchesSensitive(finding.category, context.sensitiveAreas)) {
    conf = Math.min(0.95, conf * 1.04);
  }

  // Steps 4–5
  conf = Math.max(0.05, Math.min(0.95, conf));
  // Round to 3 decimals for stable persistence/display
  return Math.round(conf * 1000) / 1000;
}

export function calibrateFindings(
  findings: StructuredFinding[],
  context: AnalysisContext,
  analyzedFilePaths: Set<string>,
): StructuredFinding[] {
  return findings.map((f) => {
    const confidence = calibrateFindingConfidence(
      f,
      context,
      analyzedFilePaths,
    );
    return {
      ...f,
      confidence,
      confidenceReason: buildConfidenceReason({
        ...f,
        confidence,
      }),
    };
  });
}

/**
 * Map calibrated confidence + observation flags to a short UX reason.
 */
export function buildConfidenceReason(
  finding: Pick<
    StructuredFinding,
    "confidence" | "isInference" | "evidence" | "affectedFiles"
  >,
): ConfidenceReason {
  const conf = finding.confidence ?? 0.55;
  const evidence = (finding.evidence ?? "").trim();
  const weak =
    !evidence || WEAK_EVIDENCE.test(evidence) || evidence.length < 24;
  const hasFiles = finding.affectedFiles.length > 0;
  const observedStrong = !finding.isInference && !weak && hasFiles;

  if (finding.isInference) {
    if (conf < 0.45 || weak) {
      return { level: "low", label: "Limited evidence available." };
    }
    return {
      level: "medium",
      label: "Inference from surrounding implementation.",
    };
  }

  if (observedStrong && conf >= 0.72) {
    return {
      level: "high",
      label: "Directly observed in modified code.",
    };
  }

  if (conf >= 0.45 && (hasFiles || !weak)) {
    return {
      level: "medium",
      label: observedStrong
        ? "Supported by file evidence with moderate certainty."
        : "Inference from surrounding implementation.",
    };
  }

  return { level: "low", label: "Limited evidence available." };
}

/** Overall analysis confidence reason from aggregate score. */
export function buildOverallConfidenceReason(
  confidence: number | null,
  opts?: { docsOnly?: boolean; findingCount?: number },
): ConfidenceReason {
  if (confidence == null) {
    return {
      level: "medium",
      label: "Confidence not available for this analysis.",
    };
  }
  if (opts?.docsOnly) {
    return {
      level: confidence >= 0.7 ? "high" : "medium",
      label: "Documentation-only change with deterministic file classification.",
    };
  }
  if (confidence >= 0.75) {
    return {
      level: "high",
      label: "Directly observed in modified code.",
    };
  }
  if (confidence >= 0.5) {
    return {
      level: "medium",
      label: "Inference from surrounding implementation.",
    };
  }
  return {
    level: "low",
    label: "Limited evidence available.",
  };
}
