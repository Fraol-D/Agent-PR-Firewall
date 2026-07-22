import {
  Bot,
  FileDiff,
  GitPullRequest,
  Shield,
  UserCheck,
} from "lucide-react";

const steps = [
  {
    title: "Task",
    description: "Developer asks an agent to implement a focused change.",
    icon: FileDiff,
  },
  {
    title: "AI agent",
    description: "Agent edits code, runs commands, and opens a pull request.",
    icon: Bot,
  },
  {
    title: "Pull request",
    description: "GitHub events stream the change into Agent PR Firewall.",
    icon: GitPullRequest,
  },
  {
    title: "Firewall analysis",
    description: "Scope, impact, and risk engines produce an explainable decision.",
    icon: Shield,
  },
  {
    title: "Human decision",
    description: "Approve, review, or block — with clear reasons you can audit.",
    icon: UserCheck,
  },
] as const;

export function ProblemFlow() {
  return (
    <section id="how-it-works" className="border-b border-border/70 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            Core workflow
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Built for agent-generated change, not generic review theater
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            The product question is always the same: did the agent stay within
            the task, and what else might this change affect?
          </p>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-5">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="relative rounded-2xl border border-border/80 bg-card/70 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-brand-muted text-brand">
                    <Icon className="size-4" />
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
