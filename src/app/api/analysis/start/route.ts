import { type NextRequest } from "next/server";

import { isAiProviderConfigured } from "@/lib/analysis/ai";
import {
  jsonError,
  jsonOk,
  parseJsonBody,
  requireApiUser,
  requireStringField,
  statusFromServiceCode,
} from "@/lib/api/route-helpers";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { startPullRequestAnalysis } from "@/services/analyses";

export const maxDuration = 300;

/**
 * POST /api/analysis/start
 * Body: { pullRequestId: string, force?: boolean }
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.error) {
    return auth.error;
  }

  if (!isAdminClientConfigured()) {
    return jsonError(503, "Server database admin client is not configured");
  }

  if (!isAiProviderConfigured()) {
    return jsonError(
      503,
      "AI provider is not configured. Set OPENROUTER_API_KEY in the server environment (free model cohere/north-mini-code:free).",
    );
  }

  const parsed = await parseJsonBody<{
    pullRequestId?: string;
    force?: boolean;
  }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const pullRequestId = requireStringField(parsed.body, "pullRequestId");
  if (pullRequestId.error) {
    return pullRequestId.error;
  }

  const result = await startPullRequestAnalysis({
    userId: auth.user.id,
    pullRequestId: pullRequestId.value,
    force: Boolean(parsed.body.force),
  });

  if (!result.ok) {
    return jsonError(statusFromServiceCode(result.code), result.error, {
      code: result.code,
    });
  }

  return jsonOk({
    analysisId: result.data.analysisId,
    reused: result.data.reused,
  });
}
