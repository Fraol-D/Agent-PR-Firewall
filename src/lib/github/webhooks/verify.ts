import { createHmac, timingSafeEqual } from "crypto";

import { getGitHubWebhookSecret } from "@/lib/github/config";

/**
 * Verify GitHub webhook signature (X-Hub-Signature-256).
 * Requires the raw request body string.
 */
export function verifyGitHubWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): { ok: true } | { ok: false; reason: string } {
  const secret = getGitHubWebhookSecret();

  if (!secret) {
    return { ok: false, reason: "webhook_secret_not_configured" };
  }

  if (!signatureHeader) {
    return { ok: false, reason: "missing_signature" };
  }

  if (!signatureHeader.startsWith("sha256=")) {
    return { ok: false, reason: "invalid_signature_format" };
  }

  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const provided = signatureHeader;

  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");

  if (expectedBuf.length !== providedBuf.length) {
    return { ok: false, reason: "signature_mismatch" };
  }

  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}
