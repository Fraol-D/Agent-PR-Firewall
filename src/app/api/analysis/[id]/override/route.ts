import { NextResponse, type NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { recordHumanOverride } from "@/services/overrides";

/**
 * POST /api/analysis/:id/override
 * Body: { action: "approve" | "keep_blocked", note?: string }
 * Advisory only — does not merge or change GitHub branch protection.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminClientConfigured()) {
    return NextResponse.json(
      { error: "Server database admin client is not configured" },
      { status: 503 },
    );
  }

  const { id } = await context.params;

  let body: { action?: string; note?: string };
  try {
    body = (await request.json()) as { action?: string; note?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "keep_blocked") {
    return NextResponse.json(
      { error: "action must be approve or keep_blocked" },
      { status: 400 },
    );
  }

  const result = await recordHumanOverride({
    userId: user.id,
    analysisId: id,
    action: body.action,
    note: body.note ?? null,
  });

  if (!result.ok) {
    const status =
      result.code === "unauthorized"
        ? 403
        : result.code === "not_found"
          ? 404
          : result.code === "not_ready" || result.code === "invalid"
            ? 409
            : 500;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    override: result.data.override,
  });
}
