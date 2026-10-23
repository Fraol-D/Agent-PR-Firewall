import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRepository } from "@/services/mappers";
import type {
  OverviewStats,
  Repository,
  RepositoryConnectionStatus,
  ServiceResult,
} from "@/types/domain";
import type { TablesInsert } from "@/types/database";

export async function listUserRepositories(
  userId: string,
): Promise<ServiceResult<Repository[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("repositories")
      .select("*")
      .eq("connected_by_user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("listUserRepositories:", error.message);
      return { ok: false, error: "Failed to load repositories", code: "db_error" };
    }

    return { ok: true, data: (data ?? []).map(mapRepository) };
  } catch (err) {
    console.error("listUserRepositories unexpected:", err);
    return {
      ok: false,
      error: "Failed to load repositories",
      code: "unexpected",
    };
  }
}

export async function getUserRepositoryById(
  userId: string,
  repositoryId: string,
): Promise<ServiceResult<Repository | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("repositories")
      .select("*")
      .eq("id", repositoryId)
      .eq("connected_by_user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("getUserRepositoryById:", error.message);
      return { ok: false, error: "Failed to load repository", code: "db_error" };
    }

    return { ok: true, data: data ? mapRepository(data) : null };
  } catch (err) {
    console.error("getUserRepositoryById unexpected:", err);
    return {
      ok: false,
      error: "Failed to load repository",
      code: "unexpected",
    };
  }
}

export async function getOverviewStats(
  userId: string,
): Promise<ServiceResult<OverviewStats>> {
  try {
    const supabase = await createClient();

    const { data: repos, error: repoError } = await supabase
      .from("repositories")
      .select("id, connection_status")
      .eq("connected_by_user_id", userId)
      .eq("is_active", true);

    if (repoError) {
      console.error("getOverviewStats repos:", repoError.message);
      return {
        ok: false,
        error: "Failed to load overview stats",
        code: "db_error",
      };
    }

    const connectedRepos = (repos ?? []).filter(
      (r) => r.connection_status === "connected",
    );
    const repoIds = connectedRepos.map((r) => r.id);

    if (repoIds.length === 0) {
      return { ok: true, data: emptyStats() };
    }

    const { data: prs, error: prError } = await supabase
      .from("pull_requests")
      .select("id, status")
      .in("repository_id", repoIds);

    if (prError) {
      console.error("getOverviewStats prs:", prError.message);
      return {
        ok: true,
        data: {
          ...emptyStats(),
          connectedRepositories: repoIds.length,
        },
      };
    }

    const prIds = (prs ?? []).map((p) => p.id);
    const openPullRequests = (prs ?? []).filter(
      (p) => p.status === "open" || p.status === "draft",
    ).length;

    let analyzedPullRequests = 0;
    let lowRiskCount = 0;
    let reviewRequiredCount = 0;
    let blockedCount = 0;

    if (prIds.length > 0) {
      const { data: analyses, error: analysisError } = await supabase
        .from("analyses")
        .select("pull_request_id, final_decision, status, analysis_version")
        .in("pull_request_id", prIds)
        .eq("status", "completed")
        .order("analysis_version", { ascending: false });

      if (analysisError) {
        console.error("getOverviewStats analyses:", analysisError.message);
      } else {
        const latestByPr = new Map<string, string | null>();
        for (const row of analyses ?? []) {
          if (!latestByPr.has(row.pull_request_id)) {
            latestByPr.set(row.pull_request_id, row.final_decision);
          }
        }

        analyzedPullRequests = latestByPr.size;
        for (const decision of latestByPr.values()) {
          if (decision === "LOW") lowRiskCount += 1;
          if (
            decision === "REVIEW_REQUIRED" ||
            decision === "REVIEW_RECOMMENDED"
          ) {
            reviewRequiredCount += 1;
          }
          if (decision === "BLOCKED") blockedCount += 1;
        }
      }
    }

    return {
      ok: true,
      data: {
        connectedRepositories: repoIds.length,
        ingestedPullRequests: prIds.length,
        openPullRequests,
        analyzedPullRequests,
        lowRiskCount,
        reviewRequiredCount,
        blockedCount,
      },
    };
  } catch (err) {
    console.error("getOverviewStats unexpected:", err);
    return {
      ok: false,
      error: "Failed to load overview stats",
      code: "unexpected",
    };
  }
}

export interface UpsertRepositoryInput {
  githubRepositoryId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch?: string;
  installationDbId: string | null;
  githubInstallationId: number;
  connectedByUserId: string;
  htmlUrl?: string | null;
  private?: boolean;
  connectionStatus?: RepositoryConnectionStatus;
  connectionError?: string | null;
  isActive?: boolean;
}

/** Admin upsert used by webhooks and setup callback. */
export async function upsertRepositoryAdmin(
  input: UpsertRepositoryInput,
): Promise<ServiceResult<Repository>> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const payload: TablesInsert<"repositories"> = {
      github_repository_id: input.githubRepositoryId,
      owner: input.owner,
      name: input.name,
      full_name: input.fullName,
      default_branch: input.defaultBranch ?? "main",
      installation_id: input.installationDbId,
      github_installation_id: input.githubInstallationId,
      connected_by_user_id: input.connectedByUserId,
      html_url: input.htmlUrl ?? `https://github.com/${input.fullName}`,
      private: input.private ?? true,
      connection_status: input.connectionStatus ?? "connected",
      connection_error: input.connectionError ?? null,
      is_active: input.isActive ?? true,
      last_synced_at: now,
      updated_at: now,
    };

    const { data, error } = await admin
      .from("repositories")
      .upsert(payload, { onConflict: "github_repository_id" })
      .select("*")
      .single();

    if (error || !data) {
      console.error("upsertRepositoryAdmin:", error?.message);
      return {
        ok: false,
        error: "Failed to persist repository",
        code: "db_error",
      };
    }

    return { ok: true, data: mapRepository(data) };
  } catch (err) {
    console.error("upsertRepositoryAdmin unexpected:", err);
    return {
      ok: false,
      error: "Failed to persist repository",
      code: "unexpected",
    };
  }
}

export async function markRepositoriesDisconnectedAdmin(
  githubInstallationId: number,
  githubRepositoryIds: number[],
): Promise<void> {
  if (githubRepositoryIds.length === 0) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("repositories")
    .update({
      connection_status: "disconnected",
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("github_installation_id", githubInstallationId)
    .in("github_repository_id", githubRepositoryIds);

  if (error) {
    console.error("markRepositoriesDisconnectedAdmin:", error.message);
  }
}

export async function findRepositoryByGitHubIdAdmin(
  githubRepositoryId: number,
): Promise<Repository | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("repositories")
    .select("*")
    .eq("github_repository_id", githubRepositoryId)
    .maybeSingle();

  if (error) {
    console.error("findRepositoryByGitHubIdAdmin:", error.message);
    return null;
  }

  return data ? mapRepository(data) : null;
}

function emptyStats(): OverviewStats {
  return {
    connectedRepositories: 0,
    ingestedPullRequests: 0,
    openPullRequests: 0,
    analyzedPullRequests: 0,
    lowRiskCount: 0,
    reviewRequiredCount: 0,
    blockedCount: 0,
  };
}
