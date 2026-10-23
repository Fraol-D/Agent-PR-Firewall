/**
 * Gather commit messages and linked issue bodies for intent extraction.
 */

import { RequestError } from "@octokit/request-error";

import { createInstallationOctokit } from "@/lib/github/app-auth";
import { parseIssueNumbers } from "@/lib/analysis/scope/extract-task";

export interface IntentSignals {
  commitMessages: string[];
  linkedIssues: Array<{ number: number; title: string; body: string | null }>;
}

/**
 * Fetch commit messages on the pinned base...head range and linked issues.
 * Failures are soft — analysis continues with PR title/description only.
 */
export async function collectIntentSignals(input: {
  owner: string;
  repo: string;
  pullNumber: number;
  installationId: number;
  baseSha: string;
  headSha: string;
  prTitle: string;
  prDescription: string | null;
}): Promise<IntentSignals> {
  const octokit = createInstallationOctokit(input.installationId);
  const commitMessages: string[] = [];
  const linkedIssues: IntentSignals["linkedIssues"] = [];

  try {
    const compare = await octokit.rest.repos.compareCommits({
      owner: input.owner,
      repo: input.repo,
      base: input.baseSha,
      head: input.headSha,
    });
    for (const c of compare.data.commits ?? []) {
      const msg = c.commit?.message?.split("\n")[0]?.trim();
      if (msg) commitMessages.push(msg);
    }
  } catch (err) {
    if (!(err instanceof RequestError)) {
      console.error("collectIntentSignals commits:", err);
    }
  }

  // Also pull commit titles from the PR commits list (pagination capped)
  try {
    const commits = await octokit.rest.pulls.listCommits({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.pullNumber,
      per_page: 30,
    });
    for (const c of commits.data) {
      const msg = c.commit?.message?.split("\n")[0]?.trim();
      if (msg && !commitMessages.includes(msg)) commitMessages.push(msg);
    }
  } catch {
    /* optional */
  }

  const issueNums = parseIssueNumbers(
    input.prTitle,
    input.prDescription,
    commitMessages,
  );

  for (const num of issueNums.slice(0, 5)) {
    try {
      const { data: issue } = await octokit.rest.issues.get({
        owner: input.owner,
        repo: input.repo,
        issue_number: num,
      });
      // Skip if this "issue" is actually the same PR
      if (issue.pull_request) continue;
      linkedIssues.push({
        number: issue.number,
        title: issue.title ?? "",
        body: issue.body ?? null,
      });
    } catch {
      /* issue may be private or missing */
    }
  }

  return {
    commitMessages: commitMessages.slice(0, 40),
    linkedIssues,
  };
}
