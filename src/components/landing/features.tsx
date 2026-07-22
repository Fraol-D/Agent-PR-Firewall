import { Crosshair, GitBranch, Layers3, Scale } from "lucide-react";

const features = [
  {
    title: "Task-scope compliance",
    description:
      "Compare intended work against actual diffs. Surface unexpected authentication, payment, or schema changes.",
    icon: Crosshair,
  },
  {
    title: "Explainable risk",
    description:
      "Risk factors are stored as structured reasons — scores you can audit, not opaque model vibes.",
    icon: Scale,
  },
  {
    title: "Blast radius awareness",
    description:
      "Understand which modules, routes, and dependencies may be affected by agent edits.",
    icon: Layers3,
  },
  {
    title: "GitHub-native workflow",
    description:
      "Sign in with GitHub, connect repositories, and analyze PRs as agents push new commits.",
    icon: GitBranch,
  },
] as const;

export function LandingFeatures() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            Product focus
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Developer infrastructure, not another chat box
          </h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-2xl border border-border/80 bg-card/60 p-5"
              >
                <div className="flex size-9 items-center justify-center rounded-lg border border-border/80 bg-background text-brand">
                  <Icon className="size-4" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
