import Link from "next/link";
import { AlertTriangle, GitPullRequest } from "lucide-react";

import { PullRequestRow } from "@/components/dashboard/pull-request-row";
import { SyncPullRequestsButton } from "@/components/dashboard/sync-pull-requests-button";
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
import { listUserRepositories } from "@/services/repositories";

interface PullRequestsPageProps {
  searchParams: Promise<{ repository?: string }>;
}

export default async function PullRequestsPage({
  searchParams,
}: PullRequestsPageProps) {
  const params = await searchParams;
  const user = await getCurrentUserProfile();

  const [prsResult, reposResult] = await Promise.all([
    user
      ? listUserPullRequests(user.id, {
          repositoryId: params.repository,
        })
      : Promise.resolve({ ok: true as const, data: [] }),
    user
      ? listUserRepositories(user.id)
      : Promise.resolve({ ok: true as const, data: [] }),
  ]);

  const pullRequests = prsResult.ok ? prsResult.data : [];
  const repositories = reposResult.ok ? reposResult.data : [];
  const selectedRepo = repositories.find((r) => r.id === params.repository);

  return (
    <div className="flex flex-col gap-6">
      <section className="surface rounded-3xl px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Pull requests
            </p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Agent PR intake
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Real pull requests ingested from connected GitHub repositories.
              Analysis arrives in Stage 2+.
            </p>
            {selectedRepo ? (
              <p className="text-xs text-muted-foreground">
                Filtered to{" "}
                <span className="font-mono text-foreground">
                  {selectedRepo.fullName}
                </span>{" "}
                ·{" "}
                <Link
                  href="/dashboard/pull-requests"
                  className="font-medium text-foreground hover:underline"
                >
                  Clear filter
                </Link>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {repositories.length > 0 ? (
              <SyncPullRequestsButton repositoryId={params.repository} />
            ) : null}
            <Button variant="outline" render={<Link href="/dashboard/repositories" />}>
              Manage repositories
            </Button>
          </div>
        </div>
      </section>

      {!prsResult.ok ? (
        <Card className="shadow-none">
          <CardHeader>
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-destructive" />
              <div>
                <CardTitle className="text-base">
                  An error occurred while loading pull requests
                </CardTitle>
                <CardDescription className="mt-1">
                  {prsResult.error}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      {prsResult.ok && repositories.length === 0 ? (
        <Card className="shadow-none">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-muted/50 text-foreground">
                <GitPullRequest className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base">Connect a repository first</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Install the GitHub App and select repositories. After that,
                  opened and synchronized PRs appear here automatically.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/dashboard/repositories" />}>
              Go to repositories
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {prsResult.ok && repositories.length > 0 && pullRequests.length === 0 ? (
        <Card className="shadow-none">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-muted/50 text-foreground">
                <GitPullRequest className="size-5" />
              </div>
              <div className="space-y-3">
                <div>
                  <CardTitle className="text-base">No pull requests yet</CardTitle>
                  <CardDescription className="mt-1 leading-relaxed">
                    Connecting a repository does not import old PRs by itself.
                    Import existing PRs from GitHub, or open/update a PR while
                    ngrok is running so webhooks can deliver new events.
                  </CardDescription>
                </div>
                <SyncPullRequestsButton repositoryId={params.repository} />
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      {prsResult.ok && pullRequests.length > 0 ? (
        <div className="space-y-3">
          {pullRequests.map((pr) => (
            <PullRequestRow key={pr.id} pr={pr} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
