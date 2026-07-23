import { createAdminClient } from "@/lib/supabase/admin";
import type {
  InstallationEventPayload,
  InstallationRepositoriesEventPayload,
  PullRequestEventPayload,
} from "@/lib/github/webhooks/types";
import { SUPPORTED_PR_ACTIONS } from "@/lib/github/webhooks/types";
import {
  findInstallationByGitHubIdAdmin,
  syncRepositoriesFromWebhookAdmin,
  upsertInstallationAdmin,
} from "@/services/github-installations";
import { upsertPullRequestFromWebhookAdmin } from "@/services/pull-requests";
import {
  findRepositoryByGitHubIdAdmin,
  upsertRepositoryAdmin,
} from "@/services/repositories";
import type { Json } from "@/types/database";

export interface WebhookProcessContext {
  deliveryId: string;
  eventType: string;
  action: string | null;
  rawSummary?: Record<string, unknown>;
}

export type WebhookProcessResult =
  | { status: "ok"; message: string }
  | { status: "ignored"; message: string }
  | { status: "error"; message: string; httpStatus?: number };

/**
 * Idempotent webhook processing entrypoint.
 */
export async function processGitHubWebhook(
  context: WebhookProcessContext,
  payload: unknown,
): Promise<WebhookProcessResult> {
  const claimed = await claimWebhookDelivery(context, payload);
  if (!claimed.ok) {
    if (claimed.duplicate) {
      return { status: "ok", message: "Duplicate delivery ignored" };
    }
    return {
      status: "error",
      message: claimed.error,
      httpStatus: 500,
    };
  }

  try {
    let result: WebhookProcessResult;

    switch (context.eventType) {
      case "ping":
        result = { status: "ok", message: "Pong" };
        break;
      case "pull_request":
        result = await handlePullRequestEvent(
          payload as PullRequestEventPayload,
        );
        break;
      case "installation":
        result = await handleInstallationEvent(
          payload as InstallationEventPayload,
        );
        break;
      case "installation_repositories":
        result = await handleInstallationRepositoriesEvent(
          payload as InstallationRepositoriesEventPayload,
        );
        break;
      default:
        result = {
          status: "ignored",
          message: `Unsupported event type: ${context.eventType}`,
        };
    }

    await finalizeWebhookDelivery(
      context.deliveryId,
      result.status !== "error",
      result.status === "error" ? result.message : null,
    );

    return result;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Webhook processing failed";
    console.error("processGitHubWebhook:", message);
    await finalizeWebhookDelivery(context.deliveryId, false, message);
    return { status: "error", message, httpStatus: 500 };
  }
}

async function claimWebhookDelivery(
  context: WebhookProcessContext,
  payload: unknown,
): Promise<
  | { ok: true }
  | { ok: false; duplicate?: boolean; error: string }
> {
  try {
    const admin = createAdminClient();
    const repoName = extractRepoFullName(payload);

    const { error } = await admin.from("webhook_deliveries").insert({
      delivery_id: context.deliveryId,
      event_type: context.eventType,
      action: context.action,
      repository_full_name: repoName,
      processed: false,
      payload_summary: (context.rawSummary ?? {
        event: context.eventType,
        action: context.action,
      }) as Json,
    });

    if (error) {
      if (error.code === "23505") {
        return { ok: false, duplicate: true, error: "duplicate" };
      }
      console.error("claimWebhookDelivery:", error.message);
      return { ok: false, error: "Failed to record webhook delivery" };
    }

    return { ok: true };
  } catch (err) {
    console.error("claimWebhookDelivery unexpected:", err);
    return { ok: false, error: "Failed to record webhook delivery" };
  }
}

async function finalizeWebhookDelivery(
  deliveryId: string,
  processed: boolean,
  errorMessage: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("webhook_deliveries")
      .update({
        processed,
        error_message: errorMessage,
      })
      .eq("delivery_id", deliveryId);
  } catch (err) {
    console.error("finalizeWebhookDelivery:", err);
  }
}

async function handlePullRequestEvent(
  payload: PullRequestEventPayload,
): Promise<WebhookProcessResult> {
  const action = payload.action;
  if (
    !SUPPORTED_PR_ACTIONS.includes(
      action as (typeof SUPPORTED_PR_ACTIONS)[number],
    )
  ) {
    return {
      status: "ignored",
      message: `Unsupported pull_request action: ${action}`,
    };
  }

  if (!payload.repository || !payload.pull_request) {
    return {
      status: "error",
      message: "Missing repository or pull_request in payload",
      httpStatus: 400,
    };
  }

  const installationGitHubId = payload.installation?.id;
  if (!installationGitHubId) {
    return {
      status: "error",
      message: "Missing installation id on pull_request event",
      httpStatus: 400,
    };
  }

  let repository = await findRepositoryByGitHubIdAdmin(payload.repository.id);

  if (!repository) {
    const installation =
      await findInstallationByGitHubIdAdmin(installationGitHubId);

    if (!installation?.connectedByUserId) {
      return {
        status: "error",
        message:
          "Repository not connected. Complete GitHub App setup in the dashboard first.",
        httpStatus: 202,
      };
    }

    const upserted = await upsertRepositoryAdmin({
      githubRepositoryId: payload.repository.id,
      owner: payload.repository.owner.login,
      name: payload.repository.name,
      fullName: payload.repository.full_name,
      defaultBranch: payload.repository.default_branch ?? "main",
      installationDbId: installation.id,
      githubInstallationId: installationGitHubId,
      connectedByUserId: installation.connectedByUserId,
      htmlUrl: payload.repository.html_url ?? null,
      private: payload.repository.private,
      connectionStatus: "connected",
      isActive: true,
    });

    if (!upserted.ok) {
      return {
        status: "error",
        message: upserted.error,
        httpStatus: 500,
      };
    }

    repository = upserted.data;
  }

  if (
    repository.connectionStatus === "disconnected" ||
    !repository.isActive
  ) {
    return {
      status: "ignored",
      message: "Repository is disconnected; PR not ingested",
    };
  }

  const prResult = await upsertPullRequestFromWebhookAdmin({
    repositoryId: repository.id,
    pullRequest: payload.pull_request,
    action,
  });

  if (!prResult.ok) {
    return {
      status: "error",
      message: prResult.error,
      httpStatus: 500,
    };
  }

  return {
    status: "ok",
    message: `Pull request #${payload.pull_request.number} ${action}`,
  };
}

async function handleInstallationEvent(
  payload: InstallationEventPayload,
): Promise<WebhookProcessResult> {
  const installation = payload.installation;
  if (!installation) {
    return {
      status: "error",
      message: "Missing installation payload",
      httpStatus: 400,
    };
  }

  if (payload.action === "deleted") {
    await upsertInstallationAdmin({
      installationId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      accountId: installation.account.id,
      status: "deleted",
    });

    if (payload.repositories?.length) {
      const { markRepositoriesDisconnectedAdmin } = await import(
        "@/services/repositories"
      );
      await markRepositoriesDisconnectedAdmin(
        installation.id,
        payload.repositories.map((r) => r.id),
      );
    }

    return { status: "ok", message: "Installation deleted" };
  }

  if (payload.action === "suspend") {
    await upsertInstallationAdmin({
      installationId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      accountId: installation.account.id,
      status: "suspended",
      suspendedAt: installation.suspended_at ?? new Date().toISOString(),
    });
    return { status: "ok", message: "Installation suspended" };
  }

  if (payload.action === "unsuspend" || payload.action === "created") {
    await upsertInstallationAdmin({
      installationId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      accountId: installation.account.id,
      status: "active",
      suspendedAt: null,
    });

    // Repos are fully synced on setup callback when user is known.
    return {
      status: "ok",
      message: `Installation ${payload.action}`,
    };
  }

  return {
    status: "ignored",
    message: `Unsupported installation action: ${payload.action}`,
  };
}

async function handleInstallationRepositoriesEvent(
  payload: InstallationRepositoriesEventPayload,
): Promise<WebhookProcessResult> {
  await syncRepositoriesFromWebhookAdmin({
    installationId: payload.installation.id,
    accountLogin: payload.installation.account.login,
    accountType: payload.installation.account.type,
    accountId: payload.installation.account.id,
    added: payload.repositories_added ?? [],
    removed: payload.repositories_removed ?? [],
  });

  return {
    status: "ok",
    message: `installation_repositories.${payload.action}`,
  };
}

function extractRepoFullName(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "repository" in payload &&
    payload.repository &&
    typeof payload.repository === "object" &&
    "full_name" in payload.repository
  ) {
    return String(
      (payload.repository as { full_name?: string }).full_name ?? "",
    );
  }
  return null;
}
