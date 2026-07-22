import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/domain";
import type { Tables } from "@/types/database";
import type { User } from "@supabase/supabase-js";

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

export async function getAuthUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const user = await getAuthUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load user profile:", error.message);
    return null;
  }

  if (!data) {
    // Fallback from auth metadata when profile row is not yet created.
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

  return mapUserRow(data);
}

export async function requireUser(): Promise<User> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}
