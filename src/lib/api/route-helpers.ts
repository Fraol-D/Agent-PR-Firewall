import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

import { getAuthUser } from "@/lib/auth/session";

/**
 * Shared helpers for App Router API routes.
 * Keeps validation and error responses consistent without changing domain logic.
 */

export type JsonErrorBody = {
  error: string;
  code?: string;
  [key: string]: unknown;
};

/** Standard JSON error response. */
export function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): NextResponse {
  const body: JsonErrorBody = { error, ...extra };
  return NextResponse.json(body, { status });
}

/** Standard JSON success response. */
export function jsonOk<T extends Record<string, unknown>>(
  data: T,
  status = 200,
): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status });
}

/**
 * Require an authenticated user for the request.
 * Returns either the user or a 401 NextResponse.
 */
export async function requireApiUser(): Promise<
  { user: User; error: null } | { user: null; error: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) {
    return { user: null, error: jsonError(401, "Unauthorized") };
  }
  return { user, error: null };
}

/**
 * Parse JSON body safely. On failure returns a 400 response.
 * When `optional` is true, empty/invalid bodies yield `{}` instead of an error
 * (useful for routes that accept an empty POST body).
 */
export async function parseJsonBody<T extends Record<string, unknown>>(
  request: NextRequest,
  options?: { optional?: boolean },
): Promise<
  { body: T; error: null } | { body: null; error: NextResponse }
> {
  try {
    const text = await request.text();
    if (!text || text.trim() === "") {
      if (options?.optional) {
        return { body: {} as T, error: null };
      }
      return { body: null, error: jsonError(400, "Request body is required") };
    }
    const body = JSON.parse(text) as T;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return { body: null, error: jsonError(400, "Invalid JSON body") };
    }
    return { body, error: null };
  } catch {
    if (options?.optional) {
      return { body: {} as T, error: null };
    }
    return { body: null, error: jsonError(400, "Invalid JSON body") };
  }
}

/**
 * Require a non-empty string field on a parsed body.
 */
export function requireStringField(
  body: Record<string, unknown>,
  field: string,
): { value: string; error: null } | { value: null; error: NextResponse } {
  const raw = body[field];
  if (typeof raw !== "string" || raw.trim() === "") {
    return {
      value: null,
      error: jsonError(400, `${field} is required`),
    };
  }
  return { value: raw.trim(), error: null };
}

/**
 * Map common service result codes to HTTP status codes.
 */
export function statusFromServiceCode(code?: string): number {
  switch (code) {
    case "unauthorized":
      return 403;
    case "not_found":
      return 404;
    case "not_configured":
    case "ai_not_configured":
      return 503;
    default:
      return 400;
  }
}
