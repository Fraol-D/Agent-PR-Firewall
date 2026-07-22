import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Upserts application user profile from Supabase Auth + GitHub metadata.
 * Called after successful OAuth callback.
 */
export async function syncUserFromAuth(user: User): Promise<void> {
  const meta = user.user_metadata ?? {};
  const identities = user.identities ?? [];
  const githubIdentity = identities.find((i) => i.provider === "github");

  const githubUserId = Number(
    githubIdentity?.id ??
      meta.provider_id ??
      meta.sub ??
      0,
  );

  if (!githubUserId) {
    console.warn("Could not resolve GitHub user id for", user.id);
  }

  const username =
    (meta.user_name as string | undefined) ??
    (meta.preferred_username as string | undefined) ??
    user.email?.split("@")[0] ??
    `user-${user.id.slice(0, 8)}`;

  const supabase = await createClient();

  const { error } = await supabase.from("users").upsert(
    {
      id: user.id,
      github_user_id: githubUserId || Date.now(),
      username,
      display_name: (meta.full_name as string | undefined) ?? null,
      avatar_url: (meta.avatar_url as string | undefined) ?? null,
      email: user.email ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("Failed to sync user profile:", error.message);
  }
}
