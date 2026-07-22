import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-border/70">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--brand)_18%,transparent),transparent_65%)]" />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Shield className="size-3.5 text-brand" />
            Scope · Impact · Risk for coding-agent PRs
          </div>
          <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            AI agents can write code.
            <span className="block text-brand">
              But who checks what they changed?
            </span>
          </h1>
          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {siteConfig.description} Agent PR Firewall answers:{" "}
            <span className="text-foreground">
              Did the agent do what it was asked to do, and what else might this
              change affect?
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" render={<Link href="/login" />}>
              Sign in with GitHub
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<a href="#how-it-works" />}
            >
              How it works
            </Button>
          </div>
        </div>

        <div className="flex-1">
          <div className="glow-brand rounded-2xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/70 pb-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Analysis preview
                </p>
                <p className="text-sm font-medium">
                  pr #142 · Add dark mode to dashboard
                </p>
              </div>
              <span className="rounded-md bg-risk-required/20 px-2 py-1 font-mono text-[11px] font-semibold text-risk-required-foreground">
                REVIEW_REQUIRED
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <PreviewMetric label="Risk" value="HIGH" tone="risk" />
              <PreviewMetric label="Scope" value="DEVIATION" tone="warn" />
              <PreviewMetric label="Blast radius" value="MEDIUM" tone="neutral" />
            </div>
            <div className="mt-4 space-y-2 rounded-xl border border-border/70 bg-background/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Unexpected changes
              </p>
              <code className="block font-mono text-xs text-risk-blocked">
                src/auth/middleware.ts
              </code>
              <code className="block font-mono text-xs text-risk-blocked">
                src/billing/service.ts
              </code>
              <code className="block font-mono text-xs text-risk-low">
                src/components/theme-toggle.tsx
              </code>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Explainable factors — not an opaque “risk: high” label. Deterministic
              signals first; LLM assistance only where semantic judgment helps.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "risk" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "risk"
      ? "text-risk-blocked"
      : tone === "warn"
        ? "text-risk-required-foreground"
        : "text-foreground";

  return (
    <div className="rounded-xl border border-border/70 bg-background/50 p-3">
      <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-mono text-sm font-semibold ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}
