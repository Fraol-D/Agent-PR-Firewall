"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { siteConfig } from "@/config/site";

/**
 * Resolve a safe origin for OAuth redirect construction.
 * Prefers the request Origin header, then Host, then site config.
 */
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

/**
 * Sanitize the post-login path so open redirects cannot leave the app origin.
 * Only relative same-app paths are allowed.
 */
function sanitizeNextPath(raw: string | null | undefined): string {
  const fallback = "/dashboard";
  if (!raw || typeof raw !== "string") {
    return fallback;
  }

  const trimmed = raw.trim();
  // Reject absolute URLs, protocol-relative URLs, and empty path abuse.
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("://")
  ) {
    return fallback;
  }

  return trimmed;
}

/**
 * Start GitHub OAuth via Supabase Auth.
 * Scopes stay minimal: identity only (`read:user`, `user:email`).
 * Repository access is granted separately through the GitHub App install.
 */
export async function signInWithGitHub(formData?: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/login?error=supabase_not_configured");
  }

  const next = sanitizeNextPath(formData?.get("next") as string | null);

  try {
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
  } catch (err) {
    // Next.js redirect() throws; rethrow those so navigation still works.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }

    const message = err instanceof Error ? err.message : "oauth_failed";
    console.error("Unexpected GitHub OAuth failure:", message);
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
}

/**
 * Clear the Supabase session cookies and return to the landing page.
 */
export async function signOut() {
  if (!isSupabaseConfigured()) {
    redirect("/");
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign-out error:", error.message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "sign_out_failed";
    console.error("Unexpected sign-out failure:", message);
  }

  redirect("/");
}

