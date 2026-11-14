/**
 * Stage 5 — Human-in-the-loop override (advisory). Does not merge or block GitHub.
 */

import { getAnalysisDetail } from "@/services/analyses";
import { updateCheckRunForOverride } from "@/services/checks";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Decision, ServiceResult } from "@/types/domain";
import type { Json, Tables } from "@/types/database";

export type OverrideAction = "approve" | "keep_blocked";

export interface HumanOverrideRecord {
  action: OverrideAction;
  note: string | null;
  actorUserId: string;
  createdAt: string;
  originalDecision: Decision;
}

export interface RecordedOverride {
  analysisId: string;
  override: HumanOverrideRecord;
}

type PrWithRepo = Tables<"pull_requests"> & {
  repositories: {
    owner: string;
    name: string;
    github_installation_id: number | null;
    connected_by_user_id: string;
  };
};

export async function recordHumanOverride(input: {
  userId: string;
  analysisId: string;
  action: OverrideAction;
  note?: string | null;
}): Promise<ServiceResult<RecordedOverride>> {
  try {
    if (input.action !== "approve" && input.action !== "keep_blocked") {
      return { ok: false, error: "Invalid override action", code: "invalid" };
    }

    const detail = await getAnalysisDetail(input.userId, input.analysisId, null);
    if (!detail.ok) {
      return {
        ok: false,
        error: detail.error,
        code: detail.code ?? "db_error",
      };
    }
    if (!detail.data) {
      return { ok: false, error: "Analysis not found", code: "not_found" };
    }
    if (detail.data.status !== "completed") {
      return {
        ok: false,
        error: "Only completed analyses can be overridden",
        code: "not_ready",
      };
    }

    const originalDecision =
      detail.data.finalDecisionResult?.finalDecision ??
      (detail.data.finalDecision as Decision | null) ??
      "REVIEW_RECOMMENDED";

    const note = input.note?.trim().slice(0, 500) || null;
    const now = new Date().toISOString();

    const admin = createAdminClient();
    const { data: analysisRow, error: statsError } = await admin
      .from("analyses")
      .select("id, context_stats")
      .eq("id", input.analysisId)
      .maybeSingle();

    if (statsError) {
      return {
        ok: false,
        error: statsError.message || "Failed to load analysis context",
        code: "db_error",
      };
    }
    if (!analysisRow) {
      return { ok: false, error: "Analysis not found", code: "not_found" };
    }

    // null is an empty column value and is safe to replace. An array or a
    // scalar is corrupt: do not overwrite it with a partial object.
    const rawStats = analysisRow.context_stats;
    let stats: Record<string, unknown>;
    if (rawStats == null) {
      stats = {};
    } else if (typeof rawStats === "object" && !Array.isArray(rawStats)) {
      stats = rawStats as Record<string, unknown>;
    } else {
      return {
        ok: false,
        error: "Analysis context_stats is malformed",
        code: "db_error",
      };
    }

    const override: HumanOverrideRecord = {
      action: input.action,
      note,
      actorUserId: input.userId,
      createdAt: now,
      originalDecision,
    };

    // Full-object write. Two overrides that read the same stats can each
    // replace humanOverride; the later write wins. impact.graph stays when
    // both reads loaded this object. analyses has no row version to compare.
    // select() makes a zero-row update visible: PostgREST returns no error
    // when the filter matches nothing.
    const { data: updated, error: updateError } = await admin
      .from("analyses")
      .update({
        context_stats: {
          ...stats,
          humanOverride: override,
        } as unknown as Json,
      })
      .eq("id", input.analysisId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return {
        ok: false,
        error: updateError.message || "Failed to record override",
        code: "db_error",
      };
    }
    if (!updated) {
      return { ok: false, error: "Analysis not found", code: "not_found" };
    }

    await admin.from("analysis_events").insert({
      analysis_id: input.analysisId,
      pull_request_id: detail.data.pullRequestId,
      event_type: "human_override",
      message: `Human ${input.action.replace("_", " ")} (engine ${originalDecision})`,
      metadata: {
        action: input.action,
        note,
        actor_user_id: input.userId,
        original_decision: originalDecision,
      } as Json,
    });

    // Best-effort: reflect override on an existing check run
    const { data: prRaw } = await admin
      .from("pull_requests")
      .select(
        "id, repositories!inner(owner, name, github_installation_id, connected_by_user_id)",
      )
      .eq("id", detail.data.pullRequestId)
      .maybeSingle();

    const pr = prRaw as unknown as PrWithRepo | null;
    const checkId = detail.data.checkRun?.id;
    if (
      pr &&
      pr.repositories.github_installation_id &&
      checkId &&
      pr.repositories.connected_by_user_id === input.userId
    ) {
      await updateCheckRunForOverride({
        analysisId: input.analysisId,
        pullRequestId: detail.data.pullRequestId,
        owner: pr.repositories.owner,
        repo: pr.repositories.name,
        installationId: pr.repositories.github_installation_id,
        checkRunId: checkId,
        action: input.action,
        originalDecision,
      });
    }

    return {
      ok: true,
      data: { analysisId: input.analysisId, override },
    };
  } catch (err) {
    console.error("recordHumanOverride:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to record override",
      code: "unexpected",
    };
  }
}
