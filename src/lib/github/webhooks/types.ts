/**
 * Minimal typed shapes for GitHub webhook payloads we handle in Stage 1.
 * Not exhaustive — only fields we consume.
 */

export interface GitHubWebhookRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch?: string;
  html_url?: string;
  owner: {
    login: string;
    id: number;
    type?: string;
  };
}

export interface GitHubWebhookPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft?: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  user: {
    login: string;
    avatar_url?: string;
  } | null;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  merged?: boolean;
}

export interface PullRequestEventPayload {
  action: string;
  number: number;
  pull_request: GitHubWebhookPullRequest;
  repository: GitHubWebhookRepository;
  installation?: { id: number };
  sender?: { login: string };
}

export interface InstallationEventPayload {
  action: string;
  installation: {
    id: number;
    account: {
      login: string;
      id: number;
      type: string;
    };
    suspended_at?: string | null;
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  sender?: { login: string; id: number };
}

export interface InstallationRepositoriesEventPayload {
  action: "added" | "removed" | string;
  installation: {
    id: number;
    account: {
      login: string;
      id: number;
      type: string;
    };
  };
  repositories_added?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_removed?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  sender?: { login: string; id: number };
}

export const SUPPORTED_PR_ACTIONS = [
  "opened",
  "synchronize",
  "reopened",
  "closed",
  "edited",
  "ready_for_review",
  "converted_to_draft",
] as const;

export type SupportedPrAction = (typeof SUPPORTED_PR_ACTIONS)[number];
