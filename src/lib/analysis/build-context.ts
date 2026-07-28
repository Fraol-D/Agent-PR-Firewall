import { ANALYSIS_LIMITS, redactSecretsInText } from "@/lib/analysis/filters";
import type {
  AnalysisContext,
  DeterministicAnalysisResult,
} from "@/lib/analysis/types";

export function buildAnalysisContext(input: {
  repository: {
    fullName: string;
    owner: string;
    name: string;
    defaultBranch: string;
  };
  pullRequest: {
    number: number;
    title: string;
    description: string | null;
    authorLogin: string;
    sourceBranch: string;
    targetBranch: string;
    htmlUrl: string | null;
  };
  headSha: string;
  deterministic: DeterministicAnalysisResult;
}): AnalysisContext {
  const { deterministic } = input;
  const aiFiles = deterministic.changedFiles.filter(
    (f) => !f.excludedFromAi && f.patchExcerpt,
  );
  const excluded = deterministic.changedFiles.filter((f) => f.excludedFromAi);

  const parts: string[] = [];
  parts.push(`# Pull request analysis context`);
  parts.push(`Repository: ${input.repository.fullName}`);
  parts.push(
    `PR #${input.pullRequest.number}: ${redactSecretsInText(input.pullRequest.title)}`,
  );
  parts.push(
    `Author: ${input.pullRequest.authorLogin} | ${input.pullRequest.sourceBranch} → ${input.pullRequest.targetBranch}`,
  );
  parts.push(`Head SHA: ${input.headSha}`);
  parts.push(
    `Stats: ${deterministic.filesChanged} files, +${deterministic.linesAdded}/-${deterministic.linesDeleted}`,
  );
  if (deterministic.sensitiveAreas.length) {
    parts.push(
      `Sensitive areas (deterministic): ${deterministic.sensitiveAreas.join(", ")}`,
    );
  }
  if (input.pullRequest.description?.trim()) {
    parts.push(
      `Description:\n${redactSecretsInText(input.pullRequest.description).slice(0, 2000)}`,
    );
  }

  parts.push(`\n## Changed files (all)`);
  for (const f of deterministic.changedFiles) {
    parts.push(
      `- ${f.status} ${f.path} [${f.category}] +${f.additions}/-${f.deletions}` +
        (f.excludedFromAi ? ` (excluded from AI: ${f.excludeReason ?? "yes"})` : ""),
    );
  }

  parts.push(`\n## Diff excerpts (bounded)`);
  let used = parts.join("\n").length;
  let truncatedPatches = false;

  for (const f of aiFiles) {
    const block = [
      `\n### ${f.path} (${f.status}, ${f.category})`,
      "```diff",
      f.patchExcerpt ?? "",
      "```",
    ].join("\n");

    if (used + block.length > ANALYSIS_LIMITS.maxAiContextChars) {
      truncatedPatches = true;
      parts.push(
        `\n[Additional patches omitted to stay within context budget]`,
      );
      break;
    }
    parts.push(block);
    used += block.length;
  }

  return {
    repository: input.repository,
    pullRequest: input.pullRequest,
    commit: { headSha: input.headSha },
    stats: {
      filesChanged: deterministic.filesChanged,
      linesAdded: deterministic.linesAdded,
      linesDeleted: deterministic.linesDeleted,
      filesIncludedInAi: aiFiles.length,
      filesExcludedFromAi: excluded.length,
      truncatedPatches,
    },
    changedFiles: deterministic.changedFiles,
    aiContextText: parts.join("\n"),
    sensitiveAreas: deterministic.sensitiveAreas,
  };
}
