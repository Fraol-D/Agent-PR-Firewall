/**
 * Scope match, creep detection, missing work, and coverage estimation.
 */

import type { ChangedFileEvidence, FileCategory } from "@/lib/analysis/types";
import type {
  ImplementationCoverage,
  IntentScopeResult,
  MissingWorkItem,
  ScopeMatch,
  ScopePrClassification,
  TaskSource,
} from "@/lib/analysis/scope/types";
import { classificationLabel } from "@/lib/analysis/scope/classify-pr";

/** Map PR classification → expected file categories. */
const CLASS_EXPECTED: Record<ScopePrClassification, FileCategory[]> = {
  feature: ["frontend", "backend", "tests"],
  bug_fix: ["frontend", "backend", "tests", "authentication", "database"],
  documentation: ["documentation"],
  refactor: ["frontend", "backend", "tests"],
  dependency_update: ["dependencies"],
  security: ["authentication", "backend", "configuration", "tests"],
  performance: ["frontend", "backend", "tests"],
  configuration: ["configuration"],
  infrastructure: ["infrastructure", "configuration"],
  maintenance: [
    "backend",
    "frontend",
    "tests",
    "documentation",
    "dependencies",
  ],
};

/** Keywords in intent that imply expected areas. */
const INTENT_AREA_KEYWORDS: Array<{ pattern: RegExp; area: FileCategory }> = [
  { pattern: /\b(auth|session|login|oauth|jwt)\b/i, area: "authentication" },
  { pattern: /\b(database|migration|sql|schema|supabase|prisma)\b/i, area: "database" },
  { pattern: /\b(api|route|endpoint|handler)\b/i, area: "backend" },
  { pattern: /\b(ui|component|page|frontend|dashboard)\b/i, area: "frontend" },
  { pattern: /\b(test|spec|e2e|jest|vitest|playwright)\b/i, area: "tests" },
  { pattern: /\b(docs?|readme|documentation)\b/i, area: "documentation" },
  { pattern: /\b(config|env|settings)\b/i, area: "configuration" },
  { pattern: /\b(docker|ci|cd|workflow|infra|deploy)\b/i, area: "infrastructure" },
  { pattern: /\b(dependenc|package\.json|lockfile)\b/i, area: "dependencies" },
];

export function verifyScope(input: {
  taskSummary: string;
  taskSources: TaskSource[];
  intentText: string;
  classification: ScopePrClassification;
  secondaryClassifications: ScopePrClassification[];
  changedFiles: ChangedFileEvidence[];
  hasTests: boolean;
}): IntentScopeResult {
  const files = input.changedFiles;
  const actualAreas = unique(
    files.map((f) => f.category).filter((c) => c !== "unknown"),
  );

  const expectedAreas = buildExpectedAreas(
    input.classification,
    input.secondaryClassifications,
    input.intentText,
    input.taskSummary,
  );

  const { unrelatedFiles, creepAreas } = detectScopeCreep({
    files,
    expectedAreas,
    classification: input.classification,
    intentText: `${input.taskSummary}\n${input.intentText}`,
  });

  const scopeCreepDetected = unrelatedFiles.length > 0;
  const inScopeCount = files.filter(
    (f) => !unrelatedFiles.includes(f.path),
  ).length;
  const total = files.length || 1;
  const inScopeRatio = inScopeCount / total;

  const scopeMatch = computeScopeMatch({
    files,
    expectedAreas,
    actualAreas,
    unrelatedFiles,
    inScopeRatio,
    classification: input.classification,
  });

  const missingWork = detectMissingWork({
    files,
    classification: input.classification,
    intentText: `${input.taskSummary}\n${input.intentText}`,
    hasTests: input.hasTests,
    scopeMatch,
  });

  const { coverage, coverageReason } = estimateCoverage({
    scopeMatch,
    inScopeRatio,
    expectedAreas,
    actualAreas,
    missingWork,
    files,
  });

  const scopeMatchReason = buildMatchReason({
    scopeMatch,
    expectedAreas,
    actualAreas,
    unrelatedFiles,
    classification: input.classification,
  });

  const scopeCreepSummary = scopeCreepDetected
    ? `Scope creep detected: ${unrelatedFiles.length} file(s) outside expected areas (${creepAreas.join(", ") || "mixed"}).`
    : null;

  const overallRecommendation = buildRecommendation({
    scopeMatch,
    coverage,
    scopeCreepDetected,
    missingWork,
    classification: input.classification,
  });

  const scopeScore = computeScopeScore({
    scopeMatch,
    coverage,
    scopeCreepDetected,
    unrelatedRatio: unrelatedFiles.length / total,
    missingHigh: missingWork.some((m) => m.severity === "high"),
  });

  return {
    taskSummary: input.taskSummary,
    taskSources: input.taskSources,
    classification: input.classification,
    secondaryClassifications: input.secondaryClassifications,
    scopeMatch,
    scopeMatchReason,
    coverage,
    coverageReason,
    scopeCreepDetected,
    scopeCreepSummary,
    unrelatedFiles: unrelatedFiles.slice(0, 40),
    expectedAreas: expectedAreas.map(areaLabel),
    actualAreas: actualAreas.map(areaLabel),
    missingWork,
    overallRecommendation,
    scopeScore,
    scopeClassificationDb: matchToDb(scopeMatch),
  };
}

function buildExpectedAreas(
  primary: ScopePrClassification,
  secondary: ScopePrClassification[],
  intentText: string,
  taskSummary: string,
): FileCategory[] {
  const set = new Set<FileCategory>(CLASS_EXPECTED[primary] ?? []);
  for (const s of secondary) {
    for (const c of CLASS_EXPECTED[s] ?? []) set.add(c);
  }
  const text = `${taskSummary}\n${intentText}`;
  for (const { pattern, area } of INTENT_AREA_KEYWORDS) {
    if (pattern.test(text)) set.add(area);
  }
  // Documentation-only intent: only docs expected
  if (
    primary === "documentation" &&
    !/\b(code|implement|api|auth|database)\b/i.test(text)
  ) {
    return ["documentation"];
  }
  if (primary === "dependency_update") {
    return ["dependencies"];
  }
  return Array.from(set);
}

function detectScopeCreep(input: {
  files: ChangedFileEvidence[];
  expectedAreas: FileCategory[];
  classification: ScopePrClassification;
  intentText: string;
}): { unrelatedFiles: string[]; creepAreas: string[] } {
  const expected = new Set(input.expectedAreas);
  const unrelated: string[] = [];
  const creepCats = new Set<FileCategory>();

  // Narrow classifications: stricter creep
  const narrow =
    input.classification === "documentation" ||
    input.classification === "dependency_update" ||
    input.classification === "configuration";

  for (const file of input.files) {
    const cat = file.category;
    if (cat === "unknown") {
      // unknown alone is not creep unless narrow + many files
      continue;
    }
    if (expected.has(cat)) continue;

    // Tests often accompany features/fixes — not creep when other in-scope code exists
    if (
      cat === "tests" &&
      (expected.has("backend") ||
        expected.has("frontend") ||
        expected.has("authentication"))
    ) {
      continue;
    }

    // Allow mild related neighbors for non-narrow types
    if (!narrow && isSoftRelated(cat, expected)) {
      continue;
    }

    // Path keyword overlap with intent → treat as related
    if (pathMentionsIntent(file.path, input.intentText)) {
      continue;
    }

    unrelated.push(file.path);
    creepCats.add(cat);
  }

  // If almost everything is "unrelated" under broad classification, reclassify soft
  if (
    !narrow &&
    unrelated.length > 0 &&
    unrelated.length === input.files.length
  ) {
    return { unrelatedFiles: [], creepAreas: [] };
  }

  return {
    unrelatedFiles: unrelated,
    creepAreas: Array.from(creepCats).map(areaLabel),
  };
}

function isSoftRelated(
  cat: FileCategory,
  expected: Set<FileCategory>,
): boolean {
  if (expected.has("backend") && (cat === "frontend" || cat === "database")) {
    return true;
  }
  if (expected.has("frontend") && cat === "backend") return true;
  if (expected.has("authentication") && cat === "backend") return true;
  if (expected.has("database") && cat === "backend") return true;
  return false;
}

function pathMentionsIntent(path: string, intent: string): boolean {
  const tokens = intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  const p = path.toLowerCase();
  let hits = 0;
  for (const t of tokens.slice(0, 40)) {
    if (p.includes(t)) hits += 1;
  }
  return hits >= 2;
}

function computeScopeMatch(input: {
  files: ChangedFileEvidence[];
  expectedAreas: FileCategory[];
  actualAreas: FileCategory[];
  unrelatedFiles: string[];
  inScopeRatio: number;
  classification: ScopePrClassification;
}): ScopeMatch {
  if (input.files.length === 0) return "unknown";

  const expectedSet = new Set(input.expectedAreas);
  const overlap = input.actualAreas.filter((a) => expectedSet.has(a));
  const unrelatedRatio =
    input.unrelatedFiles.length / (input.files.length || 1);

  if (unrelatedRatio >= 0.55 && overlap.length === 0) {
    return "unrelated";
  }
  if (unrelatedRatio >= 0.35 && overlap.length > 0) {
    return "exceeds";
  }
  if (
    input.classification === "documentation" &&
    unrelatedRatio > 0
  ) {
    return unrelatedRatio >= 0.25 ? "exceeds" : "partial";
  }
  if (overlap.length === 0 && unrelatedRatio > 0.2) {
    return "unrelated";
  }
  if (input.inScopeRatio >= 0.85 && overlap.length > 0) {
    return "matches";
  }
  if (input.inScopeRatio >= 0.55) {
    return "partial";
  }
  if (overlap.length > 0) {
    return "partial";
  }
  return "unrelated";
}

function detectMissingWork(input: {
  files: ChangedFileEvidence[];
  classification: ScopePrClassification;
  intentText: string;
  hasTests: boolean;
  scopeMatch: ScopeMatch;
}): MissingWorkItem[] {
  const items: MissingWorkItem[] = [];
  const cats = new Set(input.files.map((f) => f.category));
  const text = input.intentText.toLowerCase();
  const paths = input.files.map((f) => f.path.toLowerCase()).join("\n");

  const hasValidation =
    /\bvalidat|zod|schema|sanitize|assert\b/i.test(paths + text) ||
    input.files.some((f) => /validat|schema|zod/i.test(f.path));
  const hasMigration = cats.has("database") || /\.sql$/i.test(paths);
  const hasApi =
    cats.has("backend") ||
    /(^|\/)api\//i.test(paths) ||
    /route\.ts/i.test(paths);
  const hasAuth = cats.has("authentication");
  const hasDocs = cats.has("documentation");
  const hasTests = input.hasTests || cats.has("tests");
  const hasConfig = cats.has("configuration");

  // Tests missing when substantive code changed
  if (
    !hasTests &&
    (cats.has("backend") ||
      cats.has("frontend") ||
      cats.has("authentication") ||
      cats.has("database")) &&
    input.classification !== "documentation" &&
    input.classification !== "dependency_update"
  ) {
    items.push({
      id: "missing-tests",
      label: "Tests missing",
      detail: "Code areas changed without accompanying test files.",
      severity: "warning",
    });
  }

  if (hasValidation && !hasTests) {
    items.push({
      id: "validation-without-tests",
      label: "Validation added without tests",
      detail: "Validation logic appears present but no tests were found.",
      severity: "warning",
    });
  }

  if (hasMigration) {
    const mentionsRollback =
      /\brollback|down migration|revert\b/i.test(text) ||
      /down\.sql|_down/i.test(paths);
    if (!mentionsRollback && input.files.some((f) => /\.sql$/i.test(f.path))) {
      items.push({
        id: "migration-rollback",
        label: "Rollback guidance missing",
        detail:
          "Database migration changes detected without clear rollback/down migration signals.",
        severity: "info",
      });
    }
  }

  if (
    hasApi &&
    !hasDocs &&
    input.classification === "feature" &&
    /\bapi\b/i.test(text)
  ) {
    items.push({
      id: "api-docs",
      label: "Documentation missing",
      detail: "API-related changes without documentation updates.",
      severity: "info",
    });
  }

  if (hasAuth && !hasTests) {
    items.push({
      id: "auth-tests",
      label: "Security change lacks tests",
      detail: "Authentication-related files changed without tests.",
      severity: "high",
    });
  }

  if (
    hasAuth &&
    !/\b(threat|security review|risk)\b/i.test(text) &&
    input.classification === "security"
  ) {
    items.push({
      id: "threat-model",
      label: "Threat model missing",
      detail:
        "Security-oriented PR does not mention threat model or security review notes.",
      severity: "info",
    });
  }

  if (
    hasConfig &&
    /\.env/i.test(paths) &&
    !hasDocs
  ) {
    items.push({
      id: "env-docs",
      label: "Configuration docs missing",
      detail: "Environment/config files changed without documentation updates.",
      severity: "info",
    });
  }

  if (input.scopeMatch === "partial" || input.scopeMatch === "unrelated") {
    items.push({
      id: "intent-gap",
      label: "Implementation may be incomplete relative to stated task",
      detail: "Scope match indicates the changes may not fully cover the claimed intent.",
      severity: "warning",
    });
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

function estimateCoverage(input: {
  scopeMatch: ScopeMatch;
  inScopeRatio: number;
  expectedAreas: FileCategory[];
  actualAreas: FileCategory[];
  missingWork: MissingWorkItem[];
  files: ChangedFileEvidence[];
}): { coverage: ImplementationCoverage; coverageReason: string } {
  const expectedHit = input.expectedAreas.filter((a) =>
    input.actualAreas.includes(a),
  ).length;
  const expectedTotal = input.expectedAreas.length || 1;
  const areaRatio = expectedHit / expectedTotal;
  const highMissing = input.missingWork.filter((m) => m.severity === "high").length;
  const warnMissing = input.missingWork.filter((m) => m.severity === "warning").length;

  let score =
    areaRatio * 0.45 +
    input.inScopeRatio * 0.4 +
    (input.scopeMatch === "matches"
      ? 0.15
      : input.scopeMatch === "partial"
        ? 0.08
        : 0);

  score -= highMissing * 0.12;
  score -= warnMissing * 0.05;
  if (input.files.length === 0) score = 0;

  if (input.scopeMatch === "unrelated") {
    return {
      coverage: "low",
      coverageReason:
        "Changed files appear largely unrelated to the stated task.",
    };
  }

  if (score >= 0.72 && highMissing === 0) {
    return {
      coverage: "high",
      coverageReason: `Most expected areas are touched (${expectedHit}/${expectedTotal}) with strong in-scope file ratio.`,
    };
  }
  if (score >= 0.42) {
    return {
      coverage: "medium",
      coverageReason: `Partial area coverage (${expectedHit}/${expectedTotal} expected areas) with some gaps or companion work missing.`,
    };
  }
  return {
    coverage: "low",
    coverageReason:
      "Few expected areas are covered, or scope match is weak relative to the stated task.",
  };
}

function buildMatchReason(input: {
  scopeMatch: ScopeMatch;
  expectedAreas: FileCategory[];
  actualAreas: FileCategory[];
  unrelatedFiles: string[];
  classification: ScopePrClassification;
}): string {
  const expected = input.expectedAreas.map(areaLabel).join(", ") || "none";
  const actual = input.actualAreas.map(areaLabel).join(", ") || "none";
  switch (input.scopeMatch) {
    case "matches":
      return `Implementation aligns with ${classificationLabel(input.classification)} intent. Expected areas (${expected}) largely match actual (${actual}).`;
    case "partial":
      return `Implementation partially matches the task. Expected: ${expected}. Actual: ${actual}.`;
    case "exceeds":
      return `Implementation exceeds stated scope. ${input.unrelatedFiles.length} unrelated file(s) outside expected areas (${expected}).`;
    case "unrelated":
      return `Implementation appears unrelated to the claimed task. Actual areas: ${actual}.`;
    default:
      return "Insufficient signals to judge scope match.";
  }
}

function buildRecommendation(input: {
  scopeMatch: ScopeMatch;
  coverage: ImplementationCoverage;
  scopeCreepDetected: boolean;
  missingWork: MissingWorkItem[];
  classification: ScopePrClassification;
}): string {
  if (input.scopeMatch === "unrelated") {
    return "Do not treat this PR as fulfilling the stated task until scope is clarified or reduced.";
  }
  if (input.scopeMatch === "exceeds" || input.scopeCreepDetected) {
    return "Split or justify out-of-scope changes before merge; review unrelated files carefully.";
  }
  if (input.missingWork.some((m) => m.severity === "high")) {
    return "Address high-priority missing work (especially tests/security companions) before merge.";
  }
  if (input.coverage === "low" || input.scopeMatch === "partial") {
    return "Confirm remaining work with the author; coverage of the stated intent looks incomplete.";
  }
  return `Scope looks consistent with a ${classificationLabel(input.classification).toLowerCase()} change; proceed with normal review.`;
}

function computeScopeScore(input: {
  scopeMatch: ScopeMatch;
  coverage: ImplementationCoverage;
  scopeCreepDetected: boolean;
  unrelatedRatio: number;
  missingHigh: boolean;
}): number {
  let score =
    input.scopeMatch === "matches"
      ? 88
      : input.scopeMatch === "partial"
        ? 62
        : input.scopeMatch === "exceeds"
          ? 48
          : input.scopeMatch === "unrelated"
            ? 22
            : 50;

  if (input.coverage === "high") score += 8;
  if (input.coverage === "low") score -= 12;
  if (input.scopeCreepDetected) score -= Math.round(input.unrelatedRatio * 20);
  if (input.missingHigh) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function matchToDb(
  match: ScopeMatch,
): IntentScopeResult["scopeClassificationDb"] {
  switch (match) {
    case "matches":
      return "HIGH_COMPLIANCE";
    case "partial":
      return "PARTIAL";
    case "exceeds":
    case "unrelated":
      return "LOW_COMPLIANCE";
    default:
      return "UNKNOWN";
  }
}

function areaLabel(cat: FileCategory | string): string {
  return String(cat)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
