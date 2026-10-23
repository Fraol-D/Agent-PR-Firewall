import { createHmac, timingSafeEqual } from "crypto";

import { getGitHubWebhookSecret, getGitHubAppId } from "@/lib/github/config";

const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function getStateSecret(): string {
  return (
    getGitHubWebhookSecret() ||
    getGitHubAppId() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-only-install-state"
  );
}

/** Create a signed state value binding the install flow to a user. */
export function createInstallState(userId: string): string {
  const issuedAt = Date.now().toString();
  const payload = `${userId}.${issuedAt}`;
  const signature = createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyInstallState(
  state: string | null,
): { ok: true; userId: string } | { ok: false; reason: string } {
  if (!state) {
    return { ok: false, reason: "missing_state" };
  }

  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 3) {
      return { ok: false, reason: "invalid_state_format" };
    }

    const [userId, issuedAt, signature] = parts;
    if (!userId || !issuedAt || !signature) {
      return { ok: false, reason: "invalid_state_format" };
    }

    const payload = `${userId}.${issuedAt}`;
    const expected = createHmac("sha256", getStateSecret())
      .update(payload)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return { ok: false, reason: "invalid_state_signature" };
    }

    const age = Date.now() - Number(issuedAt);
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
      return { ok: false, reason: "state_expired" };
    }

    return { ok: true, userId };
  } catch {
    return { ok: false, reason: "invalid_state" };
  }
}
