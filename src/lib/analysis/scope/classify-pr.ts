/**
 * Deterministic PR scope classification from intent text + changed files.
 */

import type { ChangedFileEvidence, FileCategory } from "@/lib/analysis/types";
import type { ScopePrClassification } from "@/lib/analysis/scope/types";

const RULES: Array<{
  classification: ScopePrClassification;
  patterns: RegExp[];
  categories?: FileCategory[];
  weight: number;
}> = [
  {
    classification: "security",
    patterns: [
      /\b(security|cve|xss|csrf|authz|authn|vulnerab|secret|credential|permission|rbac|oauth)\b/i,
    ],
    categories: ["authentication"],
    weight: 5,
  },
  {
    classification: "bug_fix",
    patterns: [
      /\b(fix|bug|hotfix|regression|crash|broken|issue|patch)\b/i,
      /^fix(\(.+\))?!?:/i,
    ],
    weight: 4,
  },
  {
    classification: "documentation",
    patterns: [/\b(docs?|readme|documentation|changelog|typo)\b/i, /^docs(\(.+\))?!?:/i],
    categories: ["documentation"],
    weight: 4,
  },
  {
    classification: "dependency_update",
    patterns: [
      /\b(dependenc|bump|upgrade packages?|npm|pnpm|yarn|lockfile)\b/i,
      /^chore\(deps\)/i,
    ],
    categories: ["dependencies"],
    weight: 5,
  },
  {
    classification: "performance",
    patterns: [/\b(perf|performance|optimiz|latency|throughput|slow)\b/i, /^perf(\(.+\))?!?:/i],
    weight: 4,
  },
  {
    classification: "refactor",
    patterns: [
      /\b(refactor|cleanup|restructure|reorganiz|simplify|extract)\b/i,
      /^refactor(\(.+\))?!?:/i,
    ],
    weight: 3,
  },
  {
    classification: "configuration",
    patterns: [/\b(config|configuration|env|settings|feature flag)\b/i],
    categories: ["configuration"],
    weight: 3,
  },
  {
    classification: "infrastructure",
    patterns: [
      /\b(infra|ci|cd|docker|k8s|kubernetes|terraform|pipeline|deploy|workflow)\b/i,
      /^ci(\(.+\))?!?:/i,
      /^build(\(.+\))?!?:/i,
    ],
    categories: ["infrastructure"],
    weight: 4,
  },
  {
    classification: "feature",
    patterns: [
      /\b(feature|add|implement|introduce|support|enable|new)\b/i,
      /^feat(\(.+\))?!?:/i,
    ],
    weight: 2,
  },
  {
    classification: "maintenance",
    patterns: [/\b(chore|maintain|housekeeping|misc|bump version)\b/i, /^chore(\(.+\))?!?:/i],
    weight: 2,
  },
];

/**
 * Classify the PR into one primary + optional secondary types.
 */
export function classifyPullRequest(input: {
  intentText: string;
  title: string;
  changedFiles: ChangedFileEvidence[];
}): {
  primary: ScopePrClassification;
  secondary: ScopePrClassification[];
} {
  const text = `${input.title}\n${input.intentText}`;
  const scores = new Map<ScopePrClassification, number>();

  for (const rule of RULES) {
    let score = 0;
    for (const p of rule.patterns) {
      if (p.test(text)) score += rule.weight;
    }
    if (rule.categories) {
      const catHits = input.changedFiles.filter((f) =>
        rule.categories!.includes(f.category),
      ).length;
      if (catHits > 0) {
        score += Math.min(catHits, 4) * (rule.weight - 1);
      }
    }
    if (score > 0) {
      scores.set(rule.classification, (scores.get(rule.classification) ?? 0) + score);
    }
  }

  // Strong file-composition signals when intent text is thin
  const cats = countCategories(input.changedFiles);
  const total = input.changedFiles.length || 1;
  if ((cats.documentation ?? 0) / total >= 0.85) {
    scores.set(
      "documentation",
      (scores.get("documentation") ?? 0) + 8,
    );
  }
  if ((cats.dependencies ?? 0) / total >= 0.6) {
    scores.set(
      "dependency_update",
      (scores.get("dependency_update") ?? 0) + 8,
    );
  }
  if ((cats.infrastructure ?? 0) / total >= 0.5) {
    scores.set(
      "infrastructure",
      (scores.get("infrastructure") ?? 0) + 5,
    );
  }
  if ((cats.authentication ?? 0) > 0 && /auth|security|session/i.test(text)) {
    scores.set("security", (scores.get("security") ?? 0) + 3);
  }

  if (scores.size === 0) {
    // Heuristic fallback from dominant file category
    const dominant = dominantCategory(cats);
    return {
      primary: categoryToClassification(dominant),
      secondary: [],
    };
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const primary = ranked[0][0];
  const secondary = ranked
    .slice(1)
    .filter(([, s]) => s >= ranked[0][1] * 0.55)
    .map(([c]) => c)
    .slice(0, 3);

  return { primary, secondary };
}

export function classificationLabel(c: ScopePrClassification): string {
  switch (c) {
    case "feature":
      return "Feature";
    case "bug_fix":
      return "Bug Fix";
    case "documentation":
      return "Documentation";
    case "refactor":
      return "Refactor";
    case "dependency_update":
      return "Dependency Update";
    case "security":
      return "Security";
    case "performance":
      return "Performance";
    case "configuration":
      return "Configuration";
    case "infrastructure":
      return "Infrastructure";
    case "maintenance":
      return "Maintenance";
  }
}

function countCategories(
  files: ChangedFileEvidence[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of files) {
    out[f.category] = (out[f.category] ?? 0) + 1;
  }
  return out;
}

function dominantCategory(cats: Record<string, number>): FileCategory {
  let best: FileCategory = "unknown";
  let n = 0;
  for (const [k, v] of Object.entries(cats)) {
    if (v > n) {
      n = v;
      best = k as FileCategory;
    }
  }
  return best;
}

function categoryToClassification(
  cat: FileCategory,
): ScopePrClassification {
  switch (cat) {
    case "documentation":
      return "documentation";
    case "dependencies":
      return "dependency_update";
    case "infrastructure":
      return "infrastructure";
    case "configuration":
      return "configuration";
    case "authentication":
      return "security";
    case "tests":
      return "maintenance";
    default:
      return "feature";
  }
}
