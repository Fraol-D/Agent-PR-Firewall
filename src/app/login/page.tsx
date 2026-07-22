import Link from "next/link";
import { AlertTriangle, LogIn } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signInWithGitHub } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { siteConfig } from "@/config/site";

const errorMessages: Record<string, string> = {
  supabase_not_configured:
    "Supabase environment variables are not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to continue.",
  auth_callback_failed:
    "GitHub authentication failed during callback. Check your Supabase GitHub provider settings and try again.",
  oauth_url_missing:
    "Could not start the GitHub OAuth flow. Verify Supabase Auth configuration.",
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const errorKey = params.error;
  const errorMessage =
    (errorKey && errorMessages[errorKey]) ||
    (errorKey ? decodeURIComponent(errorKey) : null);

  return (
    <div className="relative flex min-h-full flex-col">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--brand)_16%,transparent),transparent_70%)]" />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>

        <Card className="border-border/80 bg-card/90 shadow-sm backdrop-blur">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-xl">Sign in to continue</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Use GitHub to access the {siteConfig.name} dashboard. Only the
              minimum OAuth scopes are requested:{" "}
              <code className="font-mono text-[11px]">read:user</code> and{" "}
              <code className="font-mono text-[11px]">user:email</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage ? (
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            {!configured ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Setup required</p>
                <p className="mt-1">
                  Copy{" "}
                  <code className="font-mono text-[11px]">.env.example</code> to{" "}
                  <code className="font-mono text-[11px]">.env.local</code>, add
                  Supabase keys, enable the GitHub provider, and apply{" "}
                  <code className="font-mono text-[11px]">
                    supabase/migrations/001_initial_schema.sql
                  </code>
                  .
                </p>
              </div>
            ) : null}

            <form action={signInWithGitHub}>
              <input type="hidden" name="next" value={params.next ?? "/dashboard"} />
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={!configured}
              >
                <LogIn data-icon="inline-start" />
                Sign in with GitHub
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              By continuing you agree to connect your GitHub identity for
              authentication. Repository access is granted separately via the
              GitHub App.
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
