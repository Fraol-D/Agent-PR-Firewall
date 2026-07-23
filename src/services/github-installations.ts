import {
  createAppOctokit,
  createInstallationOctokit,
} from "@/lib/github/app-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapInstallation } from "@/services/mappers";
import {
  markRepositoriesDisconnectedAdmin,
  upsertRepositoryAdmin,
} from "@/services/repositories";
import type { GitHubInstallation, ServiceResult } from "@/types/domain";
import type { TablesInsert } from "@/types/database";

export async function upsertInstallationAdmin(input: {
  installationId: number;
  accountLogin: string;
  accountType: string;
  accountId: number;
  status?: "active" | "suspended" | "deleted";
  suspendedAt?: string | null;
  connectedByUserId?: string | null;
  targetType?: string | null;
  targetLogin?: string | null;
}): Promise<ServiceResult<GitHubInstallation>> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const payload: TablesInsert<"github_installations"> = {
      installation_id: input.installationId,
      account_login: input.accountLogin,
      account_type: input.accountType,
      account_id: input.accountId,
      status: input.status ?? "active",
      suspended_at: input.suspendedAt ?? null,
      connected_by_user_id: input.connectedByUserId ?? null,
      target_type: input.targetType ?? input.accountType,
      target_login: input.targetLogin ?? input.accountLogin,
      updated_at: now,
    };

    // Preserve existing connected_by_user_id if not provided
    if (input.connectedByUserId === undefined) {
      const { data: existing } = await admin
        .from("github_installations")
        .select("connected_by_user_id")
        .eq("installation_id", input.installationId)
        .maybeSingle();

      if (existing?.connected_by_user_id) {
        payload.connected_by_user_id = existing.connected_by_user_id;
      }
    }

    const { data, error } = await admin
      .from("github_installations")
      .upsert(payload, { onConflict: "installation_id" })
      .select("*")
      .single();

    if (error || !data) {
      console.error("upsertInstallationAdmin:", error?.message);
      return {
        ok: false,
        error: "Failed to persist installation",
        code: "db_error",
      };
    }

    return { ok: true, data: mapInstallation(data) };
  } catch (err) {
    console.error("upsertInstallationAdmin unexpected:", err);
    return {
      ok: false,
      error: "Failed to persist installation",
      code: "unexpected",
    };
  }
}

export async function findInstallationByGitHubIdAdmin(
  installationId: number,
): Promise<GitHubInstallation | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("github_installations")
    .select("*")
    .eq("installation_id", installationId)
    .maybeSingle();

  if (error) {
    console.error("findInstallationByGitHubIdAdmin:", error.message);
    return null;
  }

  return data ? mapInstallation(data) : null;
}

/**
 * After GitHub App setup redirect: link installation to user and sync repos.
 */
export async function completeInstallationSetup(input: {
  installationId: number;
  userId: string;
}): Promise<
  ServiceResult<{
    installation: GitHubInstallation;
    repositoryCount: number;
  }>
> {
  try {
    const octokit = createInstallationOctokit(input.installationId);

    const { data: installation } =
      await octokit.rest.apps.getInstallation({
        installation_id: input.installationId,
      });

    const account = installation.account;
    if (!account || !("login" in account)) {
      return {
        ok: false,
        error: "Installation account could not be resolved",
        code: "github_api",
      };
    }

    const upserted = await upsertInstallationAdmin({
      installationId: input.installationId,
      accountLogin: account.login,
      accountType: "type" in account ? String(account.type) : "User",
      accountId: account.id,
      status: installation.suspended_at ? "suspended" : "active",
      suspendedAt: installation.suspended_at,
      connectedByUserId: input.userId,
      targetType: "type" in account ? String(account.type) : "User",
      targetLogin: account.login,
    });

    if (!upserted.ok) {
      return upserted;
    }

    const repos = await listAllInstallationRepositories(input.installationId);
    let repositoryCount = 0;

    for (const repo of repos) {
      const [owner, name] = repo.full_name.split("/");
      const result = await upsertRepositoryAdmin({
        githubRepositoryId: repo.id,
        owner: owner ?? repo.full_name,
        name: name ?? repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        installationDbId: upserted.data.id,
        githubInstallationId: input.installationId,
        connectedByUserId: input.userId,
        htmlUrl: repo.html_url,
        private: repo.private,
        connectionStatus: "connected",
        isActive: true,
      });

      if (result.ok) {
        repositoryCount += 1;
      } else {
        console.error(
          "completeInstallationSetup repo upsert failed:",
          repo.full_name,
          result.error,
        );
      }
    }

    return {
      ok: true,
      data: {
        installation: upserted.data,
        repositoryCount,
      },
    };
  } catch (err) {
    console.error("completeInstallationSetup:", err);
    const message =
      err instanceof Error ? err.message : "GitHub API request failed";
    return {
      ok: false,
      error: message,
      code: "github_api",
    };
  }
}

async function listAllInstallationRepositories(installationId: number) {
  const octokit = createInstallationOctokit(installationId);
  const repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    html_url: string;
  }> = [];

  let page = 1;
  for (;;) {
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation(
      {
        per_page: 100,
        page,
      },
    );

    for (const repo of data.repositories) {
      repositories.push({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        default_branch: repo.default_branch,
        html_url: repo.html_url,
      });
    }

    if (data.repositories.length < 100) {
      break;
    }
    page += 1;
  }

  return repositories;
}

/**
 * Recovery path when GitHub install succeeded but Setup URL redirect did not
 * complete (common when Setup URL is missing/wrong). Lists App installations
 * and links matching ones to the signed-in user.
 */
export async function syncInstallationsForUser(input: {
  userId: string;
  githubUsername?: string | null;
}): Promise<
  ServiceResult<{
    installationCount: number;
    repositoryCount: number;
    installations: Array<{ id: number; account: string; repos: number }>;
  }>
> {
  try {
    const appOctokit = createAppOctokit();
    const installations = await appOctokit.paginate(
      appOctokit.rest.apps.listInstallations,
      { per_page: 100 },
    );

    if (installations.length === 0) {
      return {
        ok: false,
        error:
          "No GitHub App installations found. Install the App on a repository first.",
        code: "no_installations",
      };
    }

    const username = input.githubUsername?.toLowerCase() ?? null;
    const candidates = username
      ? installations.filter((inst) => {
          const login =
            inst.account && "login" in inst.account
              ? String(inst.account.login).toLowerCase()
              : "";
          return login === username;
        })
      : installations;

    // If username filter empties the list (org install, rename, etc.), fall back.
    const targets = candidates.length > 0 ? candidates : installations;

    let repositoryCount = 0;
    const summary: Array<{ id: number; account: string; repos: number }> = [];

    for (const inst of targets) {
      const result = await completeInstallationSetup({
        installationId: inst.id,
        userId: input.userId,
      });

      if (!result.ok) {
        console.error(
          "syncInstallationsForUser failed for",
          inst.id,
          result.error,
        );
        continue;
      }

      repositoryCount += result.data.repositoryCount;
      summary.push({
        id: inst.id,
        account:
          inst.account && "login" in inst.account
            ? String(inst.account.login)
            : "unknown",
        repos: result.data.repositoryCount,
      });
    }

    if (summary.length === 0) {
      return {
        ok: false,
        error:
          "Found installations but failed to sync them. Check server logs and private key.",
        code: "sync_failed",
      };
    }

    return {
      ok: true,
      data: {
        installationCount: summary.length,
        repositoryCount,
        installations: summary,
      },
    };
  } catch (err) {
    console.error("syncInstallationsForUser:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to sync installations",
      code: "github_api",
    };
  }
}

export async function syncRepositoriesFromWebhookAdmin(input: {
  installationId: number;
  accountLogin: string;
  accountType: string;
  accountId: number;
  added: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  removed: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  senderUserId?: string | null;
}): Promise<void> {
  const installation = await upsertInstallationAdmin({
    installationId: input.installationId,
    accountLogin: input.accountLogin,
    accountType: input.accountType,
    accountId: input.accountId,
    status: "active",
    connectedByUserId: input.senderUserId ?? undefined,
  });

  if (!installation.ok) {
    return;
  }

  const connectedByUserId = installation.data.connectedByUserId;
  if (!connectedByUserId) {
    // Repos will be linked when setup callback associates a user.
    console.warn(
      `Installation ${input.installationId} has no connected user yet; skipping repo add until setup.`,
    );
  } else {
    for (const repo of input.added) {
      const [owner, name] = repo.full_name.split("/");
      await upsertRepositoryAdmin({
        githubRepositoryId: repo.id,
        owner: owner ?? input.accountLogin,
        name: name ?? repo.name,
        fullName: repo.full_name,
        installationDbId: installation.data.id,
        githubInstallationId: input.installationId,
        connectedByUserId,
        private: repo.private,
        connectionStatus: "connected",
        isActive: true,
      });
    }
  }

  if (input.removed.length > 0) {
    await markRepositoriesDisconnectedAdmin(
      input.installationId,
      input.removed.map((r) => r.id),
    );
  }
}
