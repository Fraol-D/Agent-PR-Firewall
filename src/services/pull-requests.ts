import { createInstallationOctokit } from "@/lib/github/app-auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  derivePullRequestStatus,
  mapAnalysisEvent,
  mapPullRequest,
  mapPullRequestListItem,
} from "@/services/mappers";
import type {
  AnalysisEvent,
  PullRequest,
  PullRequestListItem,
  ServiceResult,
} from "@/types/domain";
import type { GitHubWebhookPullRequest } from "@/lib/github/webhooks/types";
import type { Tables, TablesInsert } from "@/types/database";

export async function listUserPullRequests(
  userId: string,
  options?: { repositoryId?: string; limit?: number },
): Promise<ServiceResult<PullRequestListItem[]>> {
  try {
    const supabase = await createClient();

    const { data: repos, error: repoError } = await supabase
      .from("repositories")
      .select("id")
      .eq("connected_by_user_id", userId);

    if (repoError) {
      console.error("listUserPullRequests repos:", repoError.message);
      return {
        ok: false,
        error: "Failed to load pull requests",
        code: "db_error",
      };
    }

    let repoIds = (repos ?? []).map((r) => r.id);
    if (options?.repositoryId) {
      if (!repoIds.includes(options.repositoryId)) {
        return { ok: true, data: [] };
      }
      repoIds = [options.repositoryId];
    }

    if (repoIds.length === 0) {
      return { ok: true, data: [] };
    }

    let query = supabase
      .from("pull_requests")
      .select(
        "*, repositories!inner(full_name, owner, name, connected_by_user_id)",
      )
      .in("repository_id", repoIds)
      .order("updated_at", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error("listUserPullRequests:", error.message);
      return {
        ok: false,
        error: "Failed to load pull requests",
        code: "db_error",
      };
    }

    type JoinedPrRow = Tables<"pull_requests"> & {
      repositories: {
        full_name: string;
        owner: string;
        name: string;
        connected_by_user_id: string;
      } | null;
    };

    const items = ((data ?? []) as unknown as JoinedPrRow[]).map((row) =>
      mapPullRequestListItem(row),
    );

    // Prefer GitHub updated_at ordering when present
    items.sort((a, b) => {
      const aTime = Date.parse(a.githubUpdatedAt ?? a.updatedAt);
      const bTime = Date.parse(b.githubUpdatedAt ?? b.updatedAt);
      return bTime - aTime;
    });

    return { ok: true, data: items };
  } catch (err) {
    console.error("listUserPullRequests unexpected:", err);
    return {
      ok: false,
      error: "Failed to load pull requests",
      code: "unexpected",
    };
  }
}

export async function getUserPullRequestById(
  userId: string,
  pullRequestId: string,
): Promise<
  ServiceResult<
    | (PullRequestListItem & { events: AnalysisEvent[] })
    | null
  >
> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("pull_requests")
      .select(
        "*, repositories!inner(full_name, owner, name, connected_by_user_id)",
      )
      .eq("id", pullRequestId)
      .maybeSingle();

    if (error) {
      console.error("getUserPullRequestById:", error.message);
      return {
        ok: false,
        error: "Failed to load pull request",
        code: "db_error",
      };
    }

    if (!data) {
      return { ok: true, data: null };
    }

    type JoinedPrRow = Tables<"pull_requests"> & {
      repositories: {
        full_name: string;
        owner: string;
        name: string;
        connected_by_user_id: string;
      } | null;
    };

    const row = data as unknown as JoinedPrRow;
    const repo = row.repositories;

    if (!repo || repo.connected_by_user_id !== userId) {
      return { ok: true, data: null };
    }

    const item = mapPullRequestListItem(row);

    const { data: events, error: eventsError } = await supabase
      .from("analysis_events")
      .select("*")
      .eq("pull_request_id", pullRequestId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (eventsError) {
      console.error("getUserPullRequestById events:", eventsError.message);
    }

    return {
      ok: true,
      data: {
        ...item,
        events: (events ?? []).map(mapAnalysisEvent),
      },
    };
  } catch (err) {
    console.error("getUserPullRequestById unexpected:", err);
    return {
      ok: false,
      error: "Failed to load pull request",
      code: "unexpected",
    };
  }
}

export async function upsertPullRequestFromWebhookAdmin(input: {
  repositoryId: string;
  pullRequest: GitHubWebhookPullRequest;
  action: string;
}): Promise<ServiceResult<PullRequest>> {
  try {
    const admin = createAdminClient();
    const pr = input.pullRequest;
    const status = derivePullRequestStatus({
      state: pr.state,
      draft: pr.draft,
      merged: pr.merged,
      mergedAt: pr.merged_at,
    });
    const now = new Date().toISOString();

    const payload: TablesInsert<"pull_requests"> = {
      github_pr_id: pr.id,
      repository_id: input.repositoryId,
      number: pr.number,
      title: pr.title,
      description: pr.body,
      author_login: pr.user?.login ?? "unknown",
      author_avatar_url: pr.user?.avatar_url ?? null,
      source_branch: pr.head.ref,
      target_branch: pr.base.ref,
      status,
      is_draft: Boolean(pr.draft),
      head_sha: pr.head.sha,
      html_url: pr.html_url,
      merged_at: pr.merged_at,
      closed_at: pr.closed_at,
      github_created_at: pr.created_at,
      github_updated_at: pr.updated_at,
      last_event_action: input.action,
      last_ingested_at: now,
      updated_at: now,
    };

    const { data, error } = await admin
      .from("pull_requests")
      .upsert(payload, { onConflict: "github_pr_id" })
      .select("*")
      .single();

    if (error || !data) {
      // Fallback: unique on (repository_id, number)
      const { data: fallback, error: fallbackError } = await admin
        .from("pull_requests")
        .upsert(payload, { onConflict: "repository_id,number" })
        .select("*")
        .single();

      if (fallbackError || !fallback) {
        console.error(
          "upsertPullRequestFromWebhookAdmin:",
          error?.message ?? fallbackError?.message,
        );
        return {
          ok: false,
          error: "Failed to persist pull request",
          code: "db_error",
        };
      }

      await recordIngestionEvent(
        fallback.id,
        input.action,
        pr.number,
        input.action === "synced" ? "github_api_sync" : "github_webhook",
      );
      return { ok: true, data: mapPullRequest(fallback) };
    }

    await recordIngestionEvent(
      data.id,
      input.action,
      pr.number,
      input.action === "synced" ? "github_api_sync" : "github_webhook",
    );
    return { ok: true, data: mapPullRequest(data) };
  } catch (err) {
    console.error("upsertPullRequestFromWebhookAdmin unexpected:", err);
    return {
      ok: false,
      error: "Failed to persist pull request",
      code: "unexpected",
    };
  }
}

async function recordIngestionEvent(
  pullRequestId: string,
  action: string,
  prNumber: number,
  source: "github_webhook" | "github_api_sync" = "github_webhook",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const eventType =
      action === "closed"
        ? "pr_closed"
        : action === "opened" || action === "synced"
          ? "pr_received"
          : "pr_updated";

    await admin.from("analysis_events").insert({
      pull_request_id: pullRequestId,
      event_type: eventType,
      message: `GitHub pull_request.${action} for #${prNumber}`,
      metadata: { action, source },
    });
  } catch (err) {
    console.error("recordIngestionEvent:", err);
  }
}

/**
 * Import existing PRs from GitHub for the user's connected repositories.
 * Needed because connecting a repo does not replay historical webhooks.
 */
export async function syncPullRequestsForUser(input: {
  userId: string;
  repositoryId?: string;
  state?: "open" | "closed" | "all";
}): Promise<
  ServiceResult<{
    repositoryCount: number;
    pullRequestCount: number;
    repositories: Array<{ fullName: string; imported: number }>;
  }>
> {
  try {
    const admin = createAdminClient();
    let query = admin
      .from("repositories")
      .select("*")
      .eq("connected_by_user_id", input.userId)
      .eq("is_active", true)
      .eq("connection_status", "connected");

    if (input.repositoryId) {
      query = query.eq("id", input.repositoryId);
    }

    const { data: repos, error } = await query;
    if (error) {
      console.error("syncPullRequestsForUser repos:", error.message);
      return { ok: false, error: "Failed to load repositories", code: "db_error" };
    }

    if (!repos?.length) {
      return {
        ok: false,
        error: "No connected repositories to sync",
        code: "no_repos",
      };
    }

    const state = input.state ?? "all";
    let pullRequestCount = 0;
    const summary: Array<{ fullName: string; imported: number }> = [];

    for (const repo of repos) {
      if (!repo.github_installation_id) {
        summary.push({ fullName: repo.full_name, imported: 0 });
        continue;
      }

      const octokit = createInstallationOctokit(repo.github_installation_id);
      let imported = 0;
      let page = 1;

      for (;;) {
        const { data: prs } = await octokit.rest.pulls.list({
          owner: repo.owner,
          repo: repo.name,
          state,
          per_page: 50,
          page,
          sort: "updated",
          direction: "desc",
        });

        for (const pr of prs) {
          const mapped: GitHubWebhookPullRequest = {
            id: pr.id,
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state === "open" ? "open" : "closed",
            draft: pr.draft,
            html_url: pr.html_url,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            closed_at: pr.closed_at,
            merged_at: pr.merged_at,
            user: pr.user
              ? { login: pr.user.login, avatar_url: pr.user.avatar_url }
              : null,
            head: { ref: pr.head.ref, sha: pr.head.sha },
            base: { ref: pr.base.ref },
            merged: pr.merged_at != null,
          };

          const result = await upsertPullRequestFromWebhookAdmin({
            repositoryId: repo.id,
            pullRequest: mapped,
            action: "synced",
          });

          if (result.ok) {
            imported += 1;
            pullRequestCount += 1;
          }
        }

        if (prs.length < 50 || page >= 5) {
          // Cap pages for Stage 1 (up to 250 PRs per repo)
          break;
        }
        page += 1;
      }

      summary.push({ fullName: repo.full_name, imported });

      await admin
        .from("repositories")
        .update({
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", repo.id);
    }

    return {
      ok: true,
      data: {
        repositoryCount: repos.length,
        pullRequestCount,
        repositories: summary,
      },
    };
  } catch (err) {
    console.error("syncPullRequestsForUser:", err);
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to sync pull requests",
      code: "github_api",
    };
  }
}
