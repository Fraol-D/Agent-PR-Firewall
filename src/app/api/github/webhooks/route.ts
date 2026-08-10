import { NextResponse, type NextRequest } from "next/server";

import { verifyGitHubWebhookSignature } from "@/lib/github/webhooks/verify";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { processGitHubWebhook } from "@/services/github-events";

export const runtime = "nodejs";

/**
 * GitHub App webhook receiver.
 * Must verify X-Hub-Signature-256 before trusting the payload.
 */
export async function POST(request: NextRequest) {
  if (!isAdminClientConfigured()) {
    console.error("Webhook received but SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  const verification = verifyGitHubWebhookSignature(rawBody, signature);
  if (!verification.ok) {
    console.warn("Webhook signature rejected:", verification.reason);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  const eventType = request.headers.get("x-github-event") ?? "unknown";
  const deliveryId =
    request.headers.get("x-github-delivery") ??
    `missing-delivery-${Date.now()}`;

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action =
    payload &&
    typeof payload === "object" &&
    "action" in payload &&
    typeof (payload as { action?: unknown }).action === "string"
      ? (payload as { action: string }).action
      : null;

  const result = await processGitHubWebhook(
    {
      deliveryId,
      eventType,
      action,
      rawSummary: {
        event: eventType,
        action,
        delivery: deliveryId,
      },
    },
    payload,
  );

  if (result.status === "error") {
    const status = result.httpStatus ?? 500;
    // 202: accepted but not fully processable yet (e.g. setup incomplete)
    if (status === 202) {
      return NextResponse.json({ ok: true, message: result.message }, { status: 202 });
    }
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    message: result.message,
  });
}

/** GitHub may GET the webhook URL in some tooling; respond simply. */
export async function GET() {
  return NextResponse.json({
    service: "agent-pr-firewall-webhooks",
    status: "ok",
  });
}
