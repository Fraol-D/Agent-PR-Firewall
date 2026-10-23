import Link from "next/link";

import { LandingFeatures } from "@/components/landing/features";
import { LandingHero } from "@/components/landing/hero";
import { ProblemFlow } from "@/components/landing/problem-flow";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUserProfile();

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader user={user} />
      <main className="flex-1">
        <LandingHero />
        <ProblemFlow />
        <LandingFeatures />
        <section className="border-t border-border/70 py-16">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6">
            <div className="max-w-xl space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Start with GitHub. Scale with confidence.
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Sign in with GitHub, connect a repository, and analyze a pull
                request. Veris produces an explainable decision from evidence,
                not style nits.
              </p>
            </div>
            <Button size="lg" render={<Link href={user ? "/dashboard" : "/login"} />}>
              {user ? "Open dashboard" : "Sign in with GitHub"}
            </Button>
          </div>
        </section>
      </main>
      <footer className="border-t border-border/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            {siteConfig.name} — evidence-based verification for agent pull
            requests.
          </p>
          <p className="font-mono">v0.5 · Stages 0–5</p>
        </div>
      </footer>
    </div>
  );
}
