"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { siteConfig } from "@/config/site";

function getOrigin(headerList: Headers): string {
  const origin = headerList.get("origin");
  if (origin) {
    return origin;
  }

  const host = headerList.get("host");
  if (host) {
    const protocol = host.includes("localhost") ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return siteConfig.url;
}

export async function signInWithGitHub(formData?: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/login?error=supabase_not_configured");
  }

  const next =
    (formData?.get("next") as string | null) ||
    "/dashboard";

  const supabase = await createClient();
  const headerList = await headers();
  const origin = getOrigin(headerList);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: "read:user user:email",
    },
  });

  if (error) {
    console.error("GitHub OAuth error:", error.message);
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    redirect(data.url);
  }

  redirect("/login?error=oauth_url_missing");
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    redirect("/");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
