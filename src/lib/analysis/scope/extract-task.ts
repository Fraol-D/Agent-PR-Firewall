/**
 * Deterministic task extraction from PR metadata, issues, and commits.
 */

import type { TaskSource } from "@/lib/analysis/scope/types";

const ISSUE_REF =
  /(?:(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+)?#(\d+)|(?:^|\s)(?:issues?\/)(\d+)/gi;

const CONVENTIONAL =
  /^(feat|fix|docs|refactor|perf|test|build|ci|chore|security|style|revert)(\(.+\))?!?:\s*/i;

export interface ExtractTaskInput {
  title: string;
  description: string | null;
  sourceBranch?: string | null;
  commitMessages?: string[];
  /** Linked issue titles/bodies already fetched. */
  linkedIssues?: Array<{ number: number; title: string; body: string | null }>;
}

export interface ExtractedTask {
  taskSummary: string;
  taskSources: TaskSource[];
  /** Raw combined text used for keyword matching. */
  combinedIntentText: string;
  linkedIssueNumbers: number[];
}

/**
 * Build a concise task summary and record which sources contributed.
 */
export function extractTask(input: ExtractTaskInput): ExtractedTask {
  const sources: TaskSource[] = [];
  const title = (input.title ?? "").trim();
  const description = (input.description ?? "").trim();
  const commits = (input.commitMessages ?? [])
    .map((m) => m.trim())
    .filter(Boolean);
  const issues = input.linkedIssues ?? [];

  if (title) {
    sources.push({
      type: "pr_title",
      label: "PR title",
      excerpt: title.slice(0, 240),
    });
  }

  if (description) {
    sources.push({
      type: "pr_description",
      label: "PR description",
      excerpt: description.slice(0, 400),
    });
  }

  for (const issue of issues) {
    sources.push({
      type: "linked_issue",
      label: `Issue #${issue.number}`,
      excerpt: (issue.title || issue.body || "").slice(0, 240),
    });
  }

  if (commits.length > 0) {
    const unique = uniqueMessages(commits).slice(0, 8);
    sources.push({
      type: "commit_messages",
      label: "Commit messages",
      excerpt: unique.join(" · ").slice(0, 400),
    });
  }

  const branch = (input.sourceBranch ?? "").trim();
  if (branch && branch !== "main" && branch !== "master") {
    sources.push({
      type: "branch_name",
      label: "Branch name",
      excerpt: branch.slice(0, 120),
    });
  }

  const linkedIssueNumbers = parseIssueNumbers(description, title, commits);
  for (const issue of issues) {
    if (!linkedIssueNumbers.includes(issue.number)) {
      linkedIssueNumbers.push(issue.number);
    }
  }

  const combinedIntentText = [
    title,
    description,
    ...issues.map((i) => `${i.title}\n${i.body ?? ""}`),
    ...commits.slice(0, 12),
    branch,
  ]
    .filter(Boolean)
    .join("\n");

  const taskSummary = buildTaskSummary({
    title,
    description,
    issues,
    commits,
    branch,
  });

  return {
    taskSummary,
    taskSources: sources,
    combinedIntentText,
    linkedIssueNumbers,
  };
}

/**
 * Parse issue numbers referenced in text.
 */
export function parseIssueNumbers(
  ...parts: Array<string | string[] | null | undefined>
): number[] {
  const text = parts
    .flat()
    .filter((p): p is string => typeof p === "string")
    .join("\n");
  const found = new Set<number>();
  let match: RegExpExecArray | null;
  const re = new RegExp(ISSUE_REF.source, "gi");
  while ((match = re.exec(text)) !== null) {
    const n = Number(match[1] || match[2]);
    if (Number.isFinite(n) && n > 0) found.add(n);
  }
  return Array.from(found).slice(0, 10);
}

function uniqueMessages(messages: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of messages) {
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function stripConventional(message: string): string {
  return message.replace(CONVENTIONAL, "").trim();
}

function sentenceCase(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return t;
  // Already sentence-like
  if (/^[A-Z]/.test(t) && t.endsWith(".")) return t;
  const cleaned = t.replace(/\.+$/, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function buildTaskSummary(input: {
  title: string;
  description: string;
  issues: Array<{ number: number; title: string; body: string | null }>;
  commits: string[];
  branch: string;
}): string {
  // Prefer linked issue title when PR title is generic
  const genericTitle =
    !input.title ||
    /^(wip|update|fix|changes?|misc|temp|test)\b/i.test(input.title) ||
    input.title.length < 8;

  if (input.issues.length > 0 && (genericTitle || input.issues[0].title)) {
    const issueTitle = input.issues[0].title.trim();
    if (issueTitle) {
      return sentenceCase(issueTitle).slice(0, 200);
    }
  }

  if (input.title) {
    return sentenceCase(stripConventional(input.title)).slice(0, 200);
  }

  // First non-empty description line that looks like a summary
  if (input.description) {
    const line =
      input.description
        .split(/\r?\n/)
        .map((l) => l.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
        .find((l) => l.length > 12 && !/^closes\b/i.test(l)) ?? "";
    if (line) return sentenceCase(line).slice(0, 200);
  }

  if (input.commits.length > 0) {
    return sentenceCase(stripConventional(input.commits[0])).slice(0, 200);
  }

  if (input.branch) {
    const fromBranch = input.branch
      .replace(/^(feature|fix|bugfix|chore|docs|hotfix)\//i, "")
      .replace(/[-_]/g, " ");
    return sentenceCase(fromBranch).slice(0, 200);
  }

  return "Unspecified task — insufficient title, description, or commits.";
}
