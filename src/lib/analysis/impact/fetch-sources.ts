/**
 * Fetch repository source files at a pinned SHA for import-graph analysis.
 * Fresh GitHub reads — Stage 1 only has changed-file patches, not full tree.
 */

import { RequestError } from "@octokit/request-error";

import { createInstallationOctokit } from "@/lib/github/app-auth";
import { isSourceCodePath, normalizePath } from "@/lib/analysis/impact/parse-imports";

/** Soft budgets to stay within analysis request time limits. */
export const IMPACT_FETCH_LIMITS = {
  maxSourceFiles: 220,
  maxFileBytes: 120_000,
  maxTotalBytes: 6_000_000,
  /** Prefer these path prefixes when truncating */
  preferPrefixes: ["src/", "app/", "lib/", "components/", "packages/"],
} as const;

export interface FetchedSources {
  files: Map<string, string>;
  treeFileCount: number;
  fetchedCount: number;
  truncated: boolean;
  errors: number;
}

/**
 * List code files at headSha and download content (capped).
 */
export async function fetchRepositorySources(input: {
  owner: string;
  repo: string;
  installationId: number;
  headSha: string;
  /** Prefer keeping these paths when over budget (e.g. changed files). */
  priorityPaths?: string[];
}): Promise<FetchedSources> {
  const octokit = createInstallationOctokit(input.installationId);
  const files = new Map<string, string>();
  let truncated = false;
  let errors = 0;
  let treeFileCount = 0;

  let tree;
  try {
    tree = await octokit.rest.git.getTree({
      owner: input.owner,
      repo: input.repo,
      tree_sha: input.headSha,
      recursive: "true",
    });
  } catch (err) {
    if (err instanceof RequestError) {
      throw new Error(
        `Failed to load repository tree at ${input.headSha.slice(0, 12)}: ${err.message}`,
      );
    }
    throw err;
  }

  if (tree.data.truncated) {
    truncated = true;
  }

  const blobs = (tree.data.tree ?? []).filter(
    (t) =>
      t.type === "blob" &&
      typeof t.path === "string" &&
      isSourceCodePath(t.path) &&
      (t.size == null || t.size <= IMPACT_FETCH_LIMITS.maxFileBytes),
  );
  treeFileCount = blobs.length;

  const priority = new Set(
    (input.priorityPaths ?? []).map((p) => normalizePath(p)),
  );

  const ranked = blobs
    .map((b) => ({
      path: normalizePath(b.path!),
      sha: b.sha!,
      size: b.size ?? 0,
      score: rankPath(normalizePath(b.path!), priority),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = ranked.slice(0, IMPACT_FETCH_LIMITS.maxSourceFiles);
  if (ranked.length > selected.length) truncated = true;

  let totalBytes = 0;
  // Sequential batches of parallel fetches
  const batchSize = 12;
  for (let i = 0; i < selected.length; i += batchSize) {
    if (totalBytes >= IMPACT_FETCH_LIMITS.maxTotalBytes) {
      truncated = true;
      break;
    }
    const batch = selected.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (item) => {
        try {
          const { data } = await octokit.rest.git.getBlob({
            owner: input.owner,
            repo: input.repo,
            file_sha: item.sha,
          });
          if (data.encoding === "base64" && typeof data.content === "string") {
            const text = Buffer.from(data.content, "base64").toString("utf8");
            // Skip obvious binary
            if (text.includes("\u0000")) return null;
            return { path: item.path, text, size: text.length };
          }
          return null;
        } catch {
          return "error" as const;
        }
      }),
    );

    for (const r of results) {
      if (r === "error") {
        errors += 1;
        continue;
      }
      if (!r) continue;
      if (totalBytes + r.size > IMPACT_FETCH_LIMITS.maxTotalBytes) {
        truncated = true;
        continue;
      }
      files.set(r.path, r.text);
      totalBytes += r.size;
    }
  }

  return {
    files,
    treeFileCount,
    fetchedCount: files.size,
    truncated,
    errors,
  };
}

function rankPath(path: string, priority: Set<string>): number {
  let score = 0;
  if (priority.has(path)) score += 1000;
  // Priority if any priority path is under same dir
  for (const p of priority) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    if (dir && path.startsWith(dir + "/")) score += 50;
  }
  for (const prefix of IMPACT_FETCH_LIMITS.preferPrefixes) {
    if (path.startsWith(prefix)) score += 20;
  }
  if (path.includes(".test.") || path.includes(".spec.") || path.includes("__tests__")) {
    score -= 5;
  }
  return score;
}
