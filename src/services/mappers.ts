import type { Tables } from "@/types/database";
import type {
  AnalysisEvent,
  GitHubInstallation,
  InstallationStatus,
  PullRequest,
  PullRequestListItem,
  PullRequestStatus,
  Repository,
  RepositoryConnectionStatus,
} from "@/types/domain";

export function mapInstallation(
  row: Tables<"github_installations">,
): GitHubInstallation {
  return {
    id: row.id,
    installationId: row.installation_id,
    accountLogin: row.account_login,
    accountType: row.account_type,
    accountId: row.account_id,
    status: row.status as InstallationStatus,
    suspendedAt: row.suspended_at,
    connectedByUserId: row.connected_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRepository(row: Tables<"repositories">): Repository {
  return {
    id: row.id,
    githubRepositoryId: row.github_repository_id,
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    defaultBranch: row.default_branch,
    installationId: row.installation_id,
    githubInstallationId: row.github_installation_id,
    connectedByUserId: row.connected_by_user_id,
    isActive: row.is_active,
    connectionStatus: row.connection_status as RepositoryConnectionStatus,
    connectionError: row.connection_error,
    lastSyncedAt: row.last_synced_at,
    htmlUrl: row.html_url,
    private: row.private,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPullRequest(row: Tables<"pull_requests">): PullRequest {
  return {
    id: row.id,
    githubPrId: row.github_pr_id,
    repositoryId: row.repository_id,
    number: row.number,
    title: row.title,
    description: row.description,
    authorLogin: row.author_login,
    authorAvatarUrl: row.author_avatar_url,
    sourceBranch: row.source_branch,
    targetBranch: row.target_branch,
    status: row.status as PullRequestStatus,
    isDraft: row.is_draft,
    headSha: row.head_sha,
    htmlUrl: row.html_url,
    mergedAt: row.merged_at,
    closedAt: row.closed_at,
    githubCreatedAt: row.github_created_at,
    githubUpdatedAt: row.github_updated_at,
    lastEventAction: row.last_event_action,
    lastIngestedAt: row.last_ingested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPullRequestListItem(
  row: Tables<"pull_requests"> & {
    repositories: Pick<
      Tables<"repositories">,
      "full_name" | "owner" | "name"
    > | null;
  },
): PullRequestListItem {
  const pr = mapPullRequest(row);
  return {
    ...pr,
    repositoryFullName: row.repositories?.full_name ?? "unknown/repo",
    repositoryOwner: row.repositories?.owner ?? "unknown",
    repositoryName: row.repositories?.name ?? "repo",
  };
}

export function mapAnalysisEvent(row: Tables<"analysis_events">): AnalysisEvent {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    pullRequestId: row.pull_request_id,
    eventType: row.event_type,
    message: row.message,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at,
  };
}

export function derivePullRequestStatus(input: {
  state: "open" | "closed";
  draft?: boolean;
  merged?: boolean | null;
  mergedAt?: string | null;
}): PullRequestStatus {
  if (input.merged || input.mergedAt) {
    return "merged";
  }
  if (input.state === "closed") {
    return "closed";
  }
  if (input.draft) {
    return "draft";
  }
  return "open";
}
