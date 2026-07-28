import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/domain";
import type { Tables } from "@/types/database";
import type { User } from "@supabase/supabase-js";

/**
 * Session helpers for dashboard and API route authorization.
 *
 * Notes:
 * - Always use `getUser()` (validated against Supabase Auth) rather than
 *   trusting client-supplied user ids from request bodies.
 * - These helpers never expose the service-role key; they use the user-scoped
 *   Supabase server client and RLS.
 */

export type SessionResult =
  | { ok: true; user: User }
  | { ok: false; reason: "not_configured" | "unauthenticated" | "auth_error"; message: string };

export function mapUserRow(row: Tables<"users">): UserProfile {
  return {
    id: row.id,
    githubUserId: row.github_user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Build a best-effort profile from auth metadata when the `users` row is missing.
 * Used only as a temporary fallback; prefer the database row when present.
 */
function profileFromAuthUser(user: User): UserProfile {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    githubUserId: Number(meta.provider_id ?? meta.sub ?? 0),
    username:
      (meta.user_name as string | undefined) ??
      (meta.preferred_username as string | undefined) ??
      user.email?.split("@")[0] ??
      "user",
    displayName: (meta.full_name as string | undefined) ?? null,
    avatarUrl: (meta.avatar_url as string | undefined) ?? null,
    email: user.email ?? null,
    createdAt: user.created_at,
    updatedAt: user.updated_at ?? user.created_at,
  };
}

/**
 * Structured session check for API routes and server components.
 * Prefer this when you need to distinguish "misconfigured" from "not signed in".
 */
export async function getSession(): Promise<SessionResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Supabase auth is not configured",
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error("Session validation failed:", error.message);
      return {
        ok: false,
        reason: "auth_error",
        message: "Failed to validate session",
      };
    }

    if (!user) {
      return {
        ok: false,
        reason: "unauthenticated",
        message: "Unauthorized",
      };
    }

    return { ok: true, user };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown auth error";
    console.error("Unexpected session error:", message);
    return {
      ok: false,
      reason: "auth_error",
      message: "Failed to validate session",
    };
  }
}

/**
 * Returns the authenticated Supabase user, or null when missing / misconfigured.
 */
export async function getAuthUser(): Promise<User | null> {
  const session = await getSession();
  return session.ok ? session.user : null;
}

/**
 * Loads the application user profile for the current session.
 * Falls back to auth metadata if the `users` row is not yet synced.
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const session = await getSession();
  if (!session.ok) {
    return null;
  }

  const { user } = session;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to load user profile:", error.message);
      // Soft-fail to metadata profile so the dashboard shell can still render.
      return profileFromAuthUser(user);
    }

    if (!data) {
      return profileFromAuthUser(user);
    }

    return mapUserRow(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown profile error";
    console.error("Unexpected profile load error:", message);
    return profileFromAuthUser(user);
  }
}

/**
 * Require an authenticated user. Throws if the session is invalid.
 * Prefer `getSession()` in API routes when you need HTTP status mapping.
 */
export async function requireUser(): Promise<User> {
  const session = await getSession();
  if (!session.ok) {
    throw new Error(
      session.reason === "not_configured"
        ? "Auth not configured"
        : "Unauthorized",
    );
  }
  return session.user;
}
