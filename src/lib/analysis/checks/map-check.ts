/**
 * Stage 5 — Map final decisions to GitHub Check Run conclusions.
 * Report-only: does not enforce branch protection unless the repo owner
 * separately requires this check.
 */

import { finalDecisionLabel } from "@/lib/analysis/decision-engine";
import type { Decision } from "@/types/domain";

export const CHECK_RUN_NAME = "Veris";

export type CheckConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "action_required";

export function decisionToCheckConclusion(
  decision: Decision,
): CheckConclusion {
  switch (decision) {
    case "LOW":
      return "success";
    case "REVIEW_RECOMMENDED":
      return "neutral";
    case "REVIEW_REQUIRED":
      return "action_required";
    case "BLOCKED":
      return "failure";
  }
}

export function overrideToCheckConclusion(
  action: "approve" | "keep_blocked",
): CheckConclusion {
  return action === "approve" ? "success" : "failure";
}

export function buildCheckOutput(input: {
  decision: Decision;
  summary?: string | null;
  reasons?: Array<{ message: string }>;
  dashboardUrl?: string | null;
  advisoryNote?: string | null;
}): { title: string; summary: string; text: string } {
  const label = finalDecisionLabel(input.decision);
  const title = `${CHECK_RUN_NAME}: ${input.decision} — ${label}`;
  const reasonLines = (input.reasons ?? [])
    .slice(0, 6)
    .map((r) => `- ${r.message}`)
    .join("\n");

  const summary = [
    `Decision \`${input.decision}\` (${label}).`,
    input.advisoryNote ??
      "Advisory only — this check does not block merge unless branch protection is configured to require it.",
  ].join(" ");

  const text = [
    input.summary?.trim() ?? "",
    reasonLines ? `### Reasons\n\n${reasonLines}` : "",
    input.dashboardUrl ? `Dashboard: ${input.dashboardUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 65000);

  return { title, summary: summary.slice(0, 65535), text };
}
