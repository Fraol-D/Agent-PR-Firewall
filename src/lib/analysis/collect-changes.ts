import { RequestError } from "@octokit/request-error";

import { createInstallationOctokit } from "@/lib/github/app-auth";
import {
  classifyFilePath,
  isSensitiveCategory,
  sensitiveAreaLabel,
} from "@/lib/analysis/classify";
import {
  ANALYSIS_LIMITS,
  shouldExcludeFromAi,
  truncatePatch,
} from "@/lib/analysis/filters";
import type {
  ChangeStatus,
  ChangedFileEvidence,
  DeterministicAnalysisResult,
} from "@/lib/analysis/types";

function mapGithubStatus(status: string | undefined): ChangeStatus {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "renamed":
      return "renamed";
    case "copied":
      return "copied";
    case "changed":
      return "changed";
    case "unchanged":
      return "unchanged";
    case "modified":
    default:
      return "modified";
  }
}

/**
 * Fetch PR changes for a **fixed head SHA** captured at analysis start.
 *
 * Integrity rules:
 * 1. Verify headSha still exists via repos.getCommit.
 * 2. Load PR metadata for base SHA.
 * 3. Compare base...headSha (not live tip) so analysis cannot drift if the PR moves.
 * 4. Fail hard if the SHA is missing or compare cannot be produced.
 */
export async function collectPullRequestChanges(input: {
  owner: string;
  repo: string;
  pullNumber: number;
  installationId: number;
  headSha: string;
}): Promise<DeterministicAnalysisResult & { baseSha: string; headSha: string }> {
  const octokit = createInstallationOctokit(input.installationId);
  const headSha = input.headSha;

  // 1) SHA must still exist
  try {
    await octokit.rest.repos.getCommit({
      owner: input.owner,
      repo: input.repo,
      ref: headSha,
    });
  } catch (err) {
    if (err instanceof RequestError && (err.status === 404 || err.status === 422)) {
      throw new Error(
        `Analysis SHA ${headSha.slice(0, 12)} is no longer available on GitHub`,
      );
    }
    throw err;
  }

  // 2) PR base for compare
  const { data: pr } = await octokit.rest.pulls.get({
    owner: input.owner,
    repo: input.repo,
    pull_number: input.pullNumber,
  });

  const baseSha = pr.base.sha;
  if (!baseSha) {
    throw new Error("Pull request base SHA is missing; cannot pin analysis diff");
  }

  // 3) Diff for base...captured head only (never live PR tip)
  let compare;
  try {
    compare = await octokit.rest.repos.compareCommits({
      owner: input.owner,
      repo: input.repo,
      base: baseSha,
      head: headSha,
    });
  } catch (err) {
    if (err instanceof RequestError && (err.status === 404 || err.status === 422)) {
      throw new Error(
        `Could not compare base ${baseSha.slice(0, 7)}...head ${headSha.slice(0, 7)}; SHA may be unreachable`,
      );
    }
    throw err;
  }

  const compareFiles = compare.data.files ?? [];
  const files: ChangedFileEvidence[] = [];
  let linesAdded = 0;
  let linesDeleted = 0;

  for (const file of compareFiles) {
    const path = file.filename;
    if (!path) continue;

    const category = classifyFilePath(path);
    const exclude = shouldExcludeFromAi(path);
    const binaryOrNoPatch =
      file.patch === undefined &&
      (file.status === "added" || file.status === "modified");

    const { text: patchExcerpt } = truncatePatch(file.patch);

    const excludedFromAi = exclude.exclude || binaryOrNoPatch || !patchExcerpt;
    const excludeReason =
      exclude.reason ??
      (binaryOrNoPatch
        ? "No text patch available (binary or too large)"
        : !patchExcerpt
          ? "Empty patch"
          : null);

    const additions = file.additions ?? 0;
    const deletions = file.deletions ?? 0;
    linesAdded += additions;
    linesDeleted += deletions;

    files.push({
      path,
      previousPath: file.previous_filename ?? null,
      status: mapGithubStatus(file.status),
      additions,
      deletions,
      category,
      isBinary: binaryOrNoPatch && !file.patch,
      excludedFromAi,
      excludeReason,
      patchExcerpt: excludedFromAi && exclude.exclude ? null : patchExcerpt,
    });
  }

  // Cap AI-included files by priority (sensitive first, then by size)
  const included = files
    .filter((f) => !f.excludedFromAi && f.patchExcerpt)
    .sort((a, b) => {
      const aSens = isSensitiveCategory(a.category) ? 0 : 1;
      const bSens = isSensitiveCategory(b.category) ? 0 : 1;
      if (aSens !== bSens) return aSens - bSens;
      return b.additions + b.deletions - (a.additions + a.deletions);
    });

  const keep = new Set(
    included.slice(0, ANALYSIS_LIMITS.maxFilesInAiContext).map((f) => f.path),
  );

  let totalPatch = 0;
  for (const file of files) {
    if (!keep.has(file.path)) {
      if (!file.excludedFromAi && file.patchExcerpt) {
        file.excludedFromAi = true;
        file.excludeReason =
          file.excludeReason ?? "Excluded by AI file-count budget";
        file.patchExcerpt = null;
      }
      continue;
    }
    if (file.patchExcerpt) {
      if (
        totalPatch + file.patchExcerpt.length >
        ANALYSIS_LIMITS.maxTotalPatchChars
      ) {
        file.excludedFromAi = true;
        file.excludeReason = "Excluded by total patch size budget";
        file.patchExcerpt = null;
      } else {
        totalPatch += file.patchExcerpt.length;
      }
    }
  }

  const categories: Record<string, number> = {};
  const sensitive = new Set<string>();
  for (const f of files) {
    categories[f.category] = (categories[f.category] ?? 0) + 1;
    const label = sensitiveAreaLabel(f.category);
    if (label) sensitive.add(label);
  }

  return {
    filesChanged: files.length,
    linesAdded,
    linesDeleted,
    categories,
    sensitiveAreas: Array.from(sensitive),
    hasTests: files.some((f) => f.category === "tests"),
    changedFiles: files,
    baseSha,
    headSha,
  };
}
