import { createClient } from "@/lib/supabase/server";
import type { OverviewStats, Repository } from "@/types/domain";
import type { Tables } from "@/types/database";

function mapRepository(row: Tables<"repositories">): Repository {
  return {
    id: row.id,
    githubRepositoryId: row.github_repository_id,
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    defaultBranch: row.default_branch,
    installationId: row.installation_id,
    connectedByUserId: row.connected_by_user_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listUserRepositories(
  userId: string,
): Promise<Repository[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repositories")
    .select("*")
    .eq("connected_by_user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listUserRepositories:", error.message);
    return [];
  }

  return (data ?? []).map(mapRepository);
}

export async function getOverviewStats(userId: string): Promise<OverviewStats> {
  const supabase = await createClient();

  const { data: repos, error: repoError } = await supabase
    .from("repositories")
    .select("id")
    .eq("connected_by_user_id", userId)
    .eq("is_active", true);

  if (repoError) {
    console.error("getOverviewStats repos:", repoError.message);
    return emptyStats();
  }

  const repoIds = (repos ?? []).map((r) => r.id);
  if (repoIds.length === 0) {
    return emptyStats();
  }

  const { data: prs, error: prError } = await supabase
    .from("pull_requests")
    .select("id")
    .in("repository_id", repoIds);

  if (prError) {
    console.error("getOverviewStats prs:", prError.message);
    return {
      connectedRepositories: repoIds.length,
      analyzedPullRequests: 0,
      lowRiskCount: 0,
      reviewRequiredCount: 0,
      blockedCount: 0,
    };
  }

  const prIds = (prs ?? []).map((p) => p.id);
  if (prIds.length === 0) {
    return {
      connectedRepositories: repoIds.length,
      analyzedPullRequests: 0,
      lowRiskCount: 0,
      reviewRequiredCount: 0,
      blockedCount: 0,
    };
  }

  // Latest analysis decision counts (simple aggregation for Stage 0 shell)
  const { data: analyses, error: analysisError } = await supabase
    .from("analyses")
    .select("pull_request_id, final_decision, status, analysis_version")
    .in("pull_request_id", prIds)
    .eq("status", "completed")
    .order("analysis_version", { ascending: false });

  if (analysisError) {
    console.error("getOverviewStats analyses:", analysisError.message);
  }

  const latestByPr = new Map<string, string | null>();
  for (const row of analyses ?? []) {
    if (!latestByPr.has(row.pull_request_id)) {
      latestByPr.set(row.pull_request_id, row.final_decision);
    }
  }

  let lowRiskCount = 0;
  let reviewRequiredCount = 0;
  let blockedCount = 0;

  for (const decision of latestByPr.values()) {
    if (decision === "LOW") lowRiskCount += 1;
    if (decision === "REVIEW_REQUIRED" || decision === "REVIEW_RECOMMENDED") {
      reviewRequiredCount += 1;
    }
    if (decision === "BLOCKED") blockedCount += 1;
  }

  return {
    connectedRepositories: repoIds.length,
    analyzedPullRequests: latestByPr.size,
    lowRiskCount,
    reviewRequiredCount,
    blockedCount,
  };
}

function emptyStats(): OverviewStats {
  return {
    connectedRepositories: 0,
    analyzedPullRequests: 0,
    lowRiskCount: 0,
    reviewRequiredCount: 0,
    blockedCount: 0,
  };
}
