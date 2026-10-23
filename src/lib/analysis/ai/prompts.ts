import {
  isDocumentationOnlyChange,
} from "@/lib/analysis/decision";
import type { AnalysisContext } from "@/lib/analysis/types";

export const ANALYSIS_SYSTEM_PROMPT = `You are a careful pull-request analyst for Agent PR Firewall.

Your job is to help a developer understand what changed and what they should review.
You do NOT rewrite code. You do NOT approve, block, or merge pull requests.

Rules:
1. Prefer observed facts from the provided context and diffs over speculation.
2. Mark speculative conclusions with isInference=true and lower confidence.
3. Every non-trivial finding must include concrete evidence (file path and what in the diff supports it).
4. Never invent files that are not in the context.
5. Never request or echo secrets, tokens, private keys, or env values.
6. Distinguish severity (impact if true) from confidence (how sure you are).
7. overallStatus must be one of:
   - no_significant_concerns
   - review_recommended
   - high_risk_concerns
8. Respond with JSON only matching the required schema.
9. finding.category MUST be exactly one of these uppercase values:
   SECURITY, DATA, AUTHENTICATION, PERFORMANCE, RELIABILITY, DATABASE, API, DEPENDENCY, CONFIGURATION, MAINTAINABILITY, SCOPE, OTHER
10. finding.severity MUST be exactly one of: info, low, medium, high, critical
11. overallStatus MUST be exactly one of: no_significant_concerns, review_recommended, high_risk_concerns
12. Evidence should name the file and describe the observed change briefly (not dump entire diffs).
13. DOCUMENTATION-ONLY PULL REQUESTS:
    When the context indicates documentation-only changes (README, docs/, markdown, etc.):
    - Treat this as a documentation review, NOT an implementation review.
    - Do NOT describe documentation edits as product/feature implementation.
    - Focus on: documentation quality, accuracy, missing setup steps, missing security notes, clarity, consistency.
    - The summary MUST explicitly begin with or clearly state:
      "This pull request modifies documentation only."
    - Prefer categories MAINTAINABILITY, CONFIGURATION, SCOPE, or OTHER unless a true security doc issue exists.
    - Prefer severity info or low unless the docs introduce dangerous guidance (e.g. hardcoding secrets).`;

export function buildAnalysisUserPrompt(context: AnalysisContext): string {
  const docsOnly = isDocumentationOnlyChange({
    filesChanged: context.stats.filesChanged,
    linesAdded: context.stats.linesAdded,
    linesDeleted: context.stats.linesDeleted,
    categories: {},
    sensitiveAreas: context.sensitiveAreas,
    hasTests: false,
    changedFiles: context.changedFiles,
  });

  const lines = [
    "Analyze this pull request using only the context below.",
    "Return JSON with: summary, overallStatus, findings[].",
    "Each finding needs: category, severity, title, summary, explanation, evidence, affectedFiles, confidence (0-1 or null), isInference.",
    "IMPORTANT: category values must be UPPERCASE enums only (e.g. SECURITY, not Security or security_risk).",
    "IMPORTANT: severity values must be lowercase enums only (info|low|medium|high|critical).",
    "IMPORTANT: keep evidence concise — file path + short observation, not full diffs.",
  ];

  if (docsOnly) {
    lines.push(
      "",
      "MODE: DOCUMENTATION-ONLY REVIEW",
      "All changed files are documentation (README, docs/, markdown, etc.).",
      'Your summary MUST state: "This pull request modifies documentation only."',
      "Evaluate documentation quality, accuracy, missing setup/security notes, clarity, and consistency.",
      "Do not invent runtime/code risks that are not present in the documentation text.",
    );
  }

  lines.push("", context.aiContextText);
  return lines.join("\n");
}
