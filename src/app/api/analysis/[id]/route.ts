import { NextResponse, type NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import { getAnalysisDetail } from "@/services/analyses";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/analysis/:id
 * Poll analysis status and findings for an authorized user.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Resolve current head SHA for outdated detection
  const supabase = await createClient();
  const { data: analysis } = await supabase
    .from("analyses")
    .select("pull_request_id")
    .eq("id", id)
    .maybeSingle();

  let headSha: string | null = null;
  if (analysis) {
    const { data: pr } = await supabase
      .from("pull_requests")
      .select("head_sha")
      .eq("id", analysis.pull_request_id)
      .maybeSingle();
    headSha = pr?.head_sha ?? null;
  }

  const result = await getAnalysisDetail(user.id, id, headSha);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, analysis: result.data });
}
