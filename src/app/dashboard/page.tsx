import {
  AlertOctagon,
  GitPullRequest,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { ConnectRepoCard } from "@/components/dashboard/connect-repo-card";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getOverviewStats } from "@/services/repositories";

export default async function DashboardPage() {
  const user = await getCurrentUserProfile();
  const stats = user
    ? await getOverviewStats(user.id)
    : {
        connectedRepositories: 0,
        analyzedPullRequests: 0,
        lowRiskCount: 0,
        reviewRequiredCount: 0,
        blockedCount: 0,
      };

  const hasRepos = stats.connectedRepositories > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Welcome{user?.displayName || user?.username ? `, ${user.displayName ?? user.username}` : ""}
        </h2>
        <p className="text-sm text-muted-foreground">
          Monitor agent pull requests for scope compliance, impact, and risk.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Repositories"
          value={stats.connectedRepositories}
          icon={Shield}
          tone="brand"
          hint="Connected via GitHub App"
        />
        <StatCard
          label="Analyzed PRs"
          value={stats.analyzedPullRequests}
          icon={GitPullRequest}
          hint="Completed analysis runs"
        />
        <StatCard
          label="Low risk"
          value={stats.lowRiskCount}
          icon={ShieldCheck}
          tone="low"
        />
        <StatCard
          label="Review needed"
          value={stats.reviewRequiredCount}
          icon={ShieldAlert}
          tone="review"
        />
        <StatCard
          label="Blocked"
          value={stats.blockedCount}
          icon={AlertOctagon}
          tone="blocked"
        />
      </div>

      {!hasRepos ? <ConnectRepoCard /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/80 bg-card/80 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>
              Analysis lifecycle events will appear here once repositories and
              pull requests are connected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyPanel
              title="No activity yet"
              body="When a coding agent opens or updates a PR, deterministic analysis and decision history will stream into this feed."
            />
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/80 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">What this dashboard prioritizes</CardTitle>
            <CardDescription>
              Built for technical clarity, not decorative metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <PriorityItem
              title="Risk visibility"
              body="Decisions are backed by stored risk factors and reproducible scores."
            />
            <PriorityItem
              title="Scope visibility"
              body="Intended task vs actual changes is the central product question."
            />
            <PriorityItem
              title="Explainability"
              body="Every review-required or blocked result should show why."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function PriorityItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed">{body}</p>
    </div>
  );
}
