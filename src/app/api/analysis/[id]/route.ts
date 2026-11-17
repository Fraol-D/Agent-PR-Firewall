import { type NextRequest } from "next/server";

import {
  jsonError,
  jsonOk,
  requireApiUser,
} from "@/lib/api/route-helpers";
import { createClient } from "@/lib/supabase/server";
import { getAnalysisDetail } from "@/services/analyses";

/**
 * GET /api/analysis/:id
 * Poll analysis status and findings for an authorized user.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (auth.error) {
    return auth.error;
  }

  const { id } = await context.params;
  if (!id || id.trim() === "") {
    return jsonError(400, "Analysis id is required");
  }

  // Resolve current head SHA for outdated detection
  const supabase = await createClient();
  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .select("pull_request_id")
    .eq("id", id)
    .maybeSingle();

  if (analysisError) {
    return jsonError(500, "Failed to load analysis");
  }

  let headSha: string | null = null;
  if (analysis) {
    const { data: pr, error: prError } = await supabase
      .from("pull_requests")
      .select("head_sha")
      .eq("id", analysis.pull_request_id)
      .maybeSingle();

    if (prError) {
      return jsonError(500, "Failed to load pull request context");
    }
    headSha = pr?.head_sha ?? null;
  }

  const result = await getAnalysisDetail(auth.user.id, id, headSha);
  if (!result.ok) {
    return jsonError(500, result.error);
  }
  if (!result.data) {
    return jsonError(404, "Not found");
  }

  return jsonOk({ analysis: result.data });
}
