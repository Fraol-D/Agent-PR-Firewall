import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  GitPullRequest,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { ConnectRepoCard } from "@/components/dashboard/connect-repo-card";
import { PullRequestRow } from "@/components/dashboard/pull-request-row";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { listUserPullRequests } from "@/services/pull-requests";
import { getOverviewStats } from "@/services/repositories";

export default async function DashboardPage() {
  const user = await getCurrentUserProfile();

  const [statsResult, prsResult] = await Promise.all([
    user
      ? getOverviewStats(user.id)
      : Promise.resolve({
          ok: true as const,
          data: {
            connectedRepositories: 0,
            ingestedPullRequests: 0,
            openPullRequests: 0,
            analyzedPullRequests: 0,
            lowRiskCount: 0,
            reviewRequiredCount: 0,
            blockedCount: 0,
          },
        }),
    user
      ? listUserPullRequests(user.id, { limit: 5 })
      : Promise.resolve({ ok: true as const, data: [] }),
  ]);

  const stats = statsResult.ok
    ? statsResult.data
    : {
        connectedRepositories: 0,
        ingestedPullRequests: 0,
        openPullRequests: 0,
        analyzedPullRequests: 0,
        lowRiskCount: 0,
        reviewRequiredCount: 0,
        blockedCount: 0,
      };

  const recentPrs = prsResult.ok ? prsResult.data : [];
  const hasRepos = stats.connectedRepositories > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Welcome
          {user?.displayName || user?.username
            ? `, ${user.displayName ?? user.username}`
            : ""}
        </h2>
        <p className="text-sm text-muted-foreground">
          Monitor agent pull requests for scope compliance, impact, and risk.
        </p>
      </div>

      {!statsResult.ok ? (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{statsResult.error}</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Repositories"
          value={stats.connectedRepositories}
          icon={Shield}
          tone="brand"
          hint="Connected via GitHub App"
        />
        <StatCard
          label="Ingested PRs"
          value={stats.ingestedPullRequests}
          icon={GitPullRequest}
          hint={`${stats.openPullRequests} open`}
        />
        <StatCard
          label="Low risk"
          value={stats.lowRiskCount}
          icon={ShieldCheck}
          tone="low"
          hint="After Stage 2+ analysis"
        />
        <StatCard
          label="Review needed"
          value={stats.reviewRequiredCount}
          icon={ShieldAlert}
          tone="review"
          hint="After Stage 4 decisions"
        />
        <StatCard
          label="Blocked"
          value={stats.blockedCount}
          icon={AlertOctagon}
          tone="blocked"
          hint="After Stage 4 decisions"
        />
      </div>

      {!hasRepos ? <ConnectRepoCard /> : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="border-border/80 bg-card/80 shadow-none lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Recent pull requests</CardTitle>
              <CardDescription>
                Live data from GitHub webhooks after repository connection.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/dashboard/pull-requests" />}
            >
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!prsResult.ok ? (
              <ErrorPanel message={prsResult.error} />
            ) : recentPrs.length === 0 ? (
              <EmptyPanel
                title={
                  hasRepos
                    ? "No pull requests yet"
                    : "Connect a repository to get started"
                }
                body={
                  hasRepos
                    ? "Open or update a pull request in a connected repository. GitHub will deliver a webhook and the PR will appear here."
                    : "Install the GitHub App, select repositories, then agent PRs will stream into this dashboard."
                }
              />
            ) : (
              recentPrs.map((pr) => <PullRequestRow key={pr.id} pr={pr} />)
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/80 shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Stage status</CardTitle>
            <CardDescription>
              What is live versus planned next.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <PriorityItem
              title="Stage 1 · Ingestion"
              body="GitHub App install, repository connection, signed webhooks, PR persistence."
              active
            />
            <PriorityItem
              title="Stage 2 · Deterministic analysis"
              body="Changed files, sensitive areas, size signals, initial risk factors."
            />
            <PriorityItem
              title="Stage 3–4 · Scope + decisions"
              body="Task-scope compliance and explainable final decisions."
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

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function PriorityItem({
  title,
  body,
  active,
}: {
  title: string;
  body: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
      <p className="text-sm font-medium text-foreground">
        {title}
        {active ? (
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-brand">
            Live
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed">{body}</p>
    </div>
  );
}
