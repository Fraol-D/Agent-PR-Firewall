/**
 * Demo: deterministic Stage 5 feedback markdown (no network, no LLM).
 * Run: node scripts/feedback-sample.mjs
 *
 * Mirrors src/lib/analysis/feedback/build-feedback.ts structure for smoke review.
 */

function buildSampleMarkdown() {
  const analysisId = "00000000-0000-4000-8000-000000000001";
  const marker = `<!-- veris-analysis-feedback:${analysisId} -->`;

  return [
    marker,
    "## Agent PR Firewall — PR analysis feedback",
    "",
    "**Decision:** `REVIEW_REQUIRED` — Review required",
    "",
    "Human review is required before merge.",
    "",
    "Risk **MEDIUM** (42) · Scope **PARTIAL** · Impact **HIGH**",
    "",
    "### Requested task",
    "",
    "> Add dark mode to the dashboard.",
    "",
    "### Why",
    "",
    "- **scope:** Scope creep detected outside the stated task.",
    "- **risk factor:** Medium security finding in auth middleware.",
    "- **impact:** High blast radius — widely imported module changed.",
    "",
    "### Unexpected / out-of-scope changes",
    "",
    "Scope creep was detected.",
    "",
    "- `src/auth/middleware.ts`",
    "- `src/billing/service.ts`",
    "",
    "### Blast radius",
    "",
    "Changed file is imported by many dependents (HIGH impact).",
    "",
    "### Top findings",
    "",
    "- **MEDIUM** (SECURITY): Auth middleware may broaden access — `src/auth/middleware.ts`",
    "",
    "### Please either",
    "",
    "1. Revert unrelated changes, or explain why they are required for the task.",
    "2. Address high/critical findings listed below (or justify with evidence).",
    "3. Review blast radius: widely imported modules or routes may be affected.",
    "4. Request human review if the changes are intentional and justified.",
    "",
    "---",
    "",
    "_Analysis v2 · SHA `abc1234` · acme/app#42_",
    "",
    "_This feedback is advisory and was generated deterministically from analysis results (no extra model call)._",
  ].join("\n");
}

const body = buildSampleMarkdown();
console.log(body);
console.log("\n---");
console.log(`chars=${body.length} lines=${body.split("\n").length}`);
console.log("OK: sample feedback body rendered (mirrors Stage 5 shape).");
