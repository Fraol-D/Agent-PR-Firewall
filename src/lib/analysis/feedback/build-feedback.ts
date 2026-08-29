/**
 * Stage 5 — Deterministic agent/human feedback payload (no LLM).
 * Builds a GitHub PR comment body from final decision + reasons + scope + findings.
 */

import { finalDecisionLabel } from "@/lib/analysis/decision-engine";
import type { DecisionReason } from "@/lib/analysis/decision-engine";
import type { Decision } from "@/types/domain";

/** Hidden marker so we can find/update comments for the same analysis. */
export const FEEDBACK_MARKER_PREFIX = "<!-- veris-analysis-feedback:";

export function feedbackMarker(analysisId: string): string {
  return `${FEEDBACK_MARKER_PREFIX}${analysisId} -->`;
}

export interface FeedbackFindingInput {
  severity: string;
  category: string;
  title: string;
  summary?: string;
  affectedFiles?: string[];
}

export interface FeedbackBuildInput {
  analysisId: string;
  finalDecision: Decision;
  reasons: DecisionReason[];
  summary?: string | null;
  taskSummary?: string | null;
  scopeCreepDetected?: boolean;
  unrelatedFiles?: string[];
  coverage?: string | null;
  impactClassification?: string | null;
  impactExplanation?: string | null;
  riskClassification?: string | null;
  riskScore?: number | null;
  scopeClassification?: string | null;
  findings?: FeedbackFindingInput[];
  repositoryFullName?: string | null;
  pullRequestNumber?: number | null;
  headSha?: string | null;
  analysisVersion?: number | null;
  /** Absolute or relative link to the PR detail page. */
  dashboardUrl?: string | null;
  /** Product line in the comment header. */
  productName?: string;
}

export interface FeedbackPayload {
  /** Full markdown body for GitHub issues.createComment. */
  bodyMarkdown: string;
  /** Short subject for events / UI. */
  title: string;
  decision: Decision;
  decisionLabel: string;
  marker: string;
  /** First N chars for UI preview. */
  preview: string;
}

const MAX_REASONS = 8;
const MAX_FINDINGS = 5;
const MAX_UNRELATED = 12;
const PREVIEW_LEN = 280;

function severityRank(s: string): number {
  switch (s.toLowerCase()) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
    default:
      return 4;
  }
}

function decisionHeadline(decision: Decision): string {
  switch (decision) {
    case "LOW":
      return "This pull request looks low risk relative to the stated task.";
    case "REVIEW_RECOMMENDED":
      return "Human review is recommended before merge.";
    case "REVIEW_REQUIRED":
      return "Human review is required before merge.";
    case "BLOCKED":
      return "This pull request was **not approved** for merge based on analysis.";
  }
}

function actionItems(decision: Decision, input: FeedbackBuildInput): string[] {
  const items: string[] = [];
  const hasUnrelated =
    Boolean(input.scopeCreepDetected) ||
    (input.unrelatedFiles && input.unrelatedFiles.length > 0);
  const hasCriticalFindings = (input.findings ?? []).some(
    (f) =>
      f.severity === "critical" ||
      f.severity === "high",
  );

  if (decision === "LOW") {
    items.push("No blocking actions required from this analysis.");
    items.push("Re-run analysis after further commits if the head SHA moves.");
    return items;
  }

  if (hasUnrelated) {
    items.push("Revert unrelated changes, or explain why they are required for the task.");
  }
  if (hasCriticalFindings || decision === "BLOCKED") {
    items.push("Address high/critical findings listed below (or justify with evidence).");
  }
  if (
    input.coverage === "low" ||
    input.scopeClassification === "LOW_COMPLIANCE"
  ) {
    items.push("Complete missing implementation work for the stated task.");
  }
  if (input.impactClassification === "HIGH") {
    items.push(
      "Review blast radius: widely imported modules or routes may be affected.",
    );
  }
  items.push("Request human review if the changes are intentional and justified.");
  if (items.length === 1) {
    items.unshift("Address the decision reasons above.");
  }
  return items;
}

function bulletList(lines: string[], empty: string): string {
  if (lines.length === 0) return empty;
  return lines.map((l) => `- ${l}`).join("\n");
}

/**
 * Build structured, deterministic feedback for agents and humans.
 * Pure function — no I/O, no LLM.
 */
export function buildFeedbackPayload(input: FeedbackBuildInput): FeedbackPayload {
  const product = input.productName ?? "Agent PR Firewall";
  const decision = input.finalDecision;
  const decisionLabel = finalDecisionLabel(decision);
  const marker = feedbackMarker(input.analysisId);

  const title = `${product}: ${decision} — ${decisionLabel}`;

  const task =
    (input.taskSummary && input.taskSummary.trim()) ||
    "Task could not be extracted from PR title/description.";

  const reasonLines = input.reasons
    .slice(0, MAX_REASONS)
    .map((r) => {
      const src = r.source.replace(/_/g, " ");
      const path = r.filePath ? ` (\`${r.filePath}\`)` : "";
      return `**${src}:** ${r.message}${path}`;
    });

  const unrelated = (input.unrelatedFiles ?? []).slice(0, MAX_UNRELATED);

  const findings = [...(input.findings ?? [])]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, MAX_FINDINGS)
    .map((f) => {
      const files =
        f.affectedFiles && f.affectedFiles.length > 0
          ? ` — \`${f.affectedFiles.slice(0, 3).join("`, `")}\``
          : "";
      return `**${f.severity.toUpperCase()}** (${f.category}): ${f.title}${files}`;
    });

  const metaParts: string[] = [];
  if (input.riskClassification) {
    metaParts.push(
      `Risk **${input.riskClassification}**${
        input.riskScore != null ? ` (${input.riskScore})` : ""
      }`,
    );
  }
  if (input.scopeClassification) {
    metaParts.push(`Scope **${input.scopeClassification}**`);
  }
  if (input.impactClassification) {
    metaParts.push(`Impact **${input.impactClassification}**`);
  }

  const prRef =
    input.repositoryFullName && input.pullRequestNumber != null
      ? `${input.repositoryFullName}#${input.pullRequestNumber}`
      : null;

  const shaShort = input.headSha ? input.headSha.slice(0, 7) : null;
  const version =
    input.analysisVersion != null ? `v${input.analysisVersion}` : null;

  const footerBits = [
    version ? `Analysis ${version}` : null,
    shaShort ? `SHA \`${shaShort}\`` : null,
    prRef,
    input.dashboardUrl ? `[Open in dashboard](${input.dashboardUrl})` : null,
  ].filter(Boolean);

  const actions = actionItems(decision, input);

  const sections: string[] = [
    marker,
    `## ${product} — PR analysis feedback`,
    "",
    `**Decision:** \`${decision}\` — ${decisionLabel}`,
    "",
    decisionHeadline(decision),
    "",
  ];

  if (metaParts.length > 0) {
    sections.push(metaParts.join(" · "), "");
  }

  sections.push(
    "### Requested task",
    "",
    `> ${task.replace(/\n+/g, " ").trim()}`,
    "",
  );

  sections.push(
    "### Why",
    "",
    bulletList(reasonLines, "_No structured reasons recorded._"),
    "",
  );

  if (unrelated.length > 0 || input.scopeCreepDetected) {
    sections.push(
      "### Unexpected / out-of-scope changes",
      "",
      input.scopeCreepDetected
        ? "Scope creep was detected."
        : "Files outside the expected task areas:",
      "",
      bulletList(
        unrelated.map((p) => `\`${p}\``),
        "_No specific unrelated file paths listed._",
      ),
      "",
    );
  }

  if (input.impactClassification === "HIGH" && input.impactExplanation) {
    sections.push(
      "### Blast radius",
      "",
      input.impactExplanation,
      "",
    );
  }

  if (findings.length > 0) {
    sections.push(
      "### Top findings",
      "",
      bulletList(findings, ""),
      "",
    );
  }

  if (input.summary && input.summary.trim()) {
    sections.push(
      "### Summary",
      "",
      input.summary.trim().slice(0, 600),
      "",
    );
  }

  sections.push(
    "### Please either",
    "",
    actions.map((a, i) => `${i + 1}. ${a}`).join("\n"),
    "",
    "---",
    "",
    `_${footerBits.join(" · ")}_`,
    "",
    "_This feedback is advisory and was generated deterministically from analysis results (no extra model call)._",
  );

  const bodyMarkdown = sections.join("\n");
  const preview =
    bodyMarkdown
      .replace(marker, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, PREVIEW_LEN) + (bodyMarkdown.length > PREVIEW_LEN ? "…" : "");

  return {
    bodyMarkdown,
    title,
    decision,
    decisionLabel,
    marker,
    preview,
  };
}
