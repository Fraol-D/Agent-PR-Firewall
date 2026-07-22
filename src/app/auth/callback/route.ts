import { NextResponse } from "next/server";

import { syncUserFromAuth } from "@/lib/auth/sync-user";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      await syncUserFromAuth(data.user);
      return NextResponse.redirect(`${origin}${safeNext}`);
    }

    console.error("Auth callback error:", error?.message);
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("auth_callback_failed")}`,
  );
}
