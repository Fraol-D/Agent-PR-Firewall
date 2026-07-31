import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  GitBranch,
} from "lucide-react";

import { AnalysisPanel } from "@/components/dashboard/analysis-panel";
import { PrStatusBadge } from "@/components/dashboard/pr-status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getLatestAnalysisForPullRequest } from "@/services/analyses";
import { getUserPullRequestById } from "@/services/pull-requests";

interface PullRequestDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PullRequestDetailPage({
  params,
}: PullRequestDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUserProfile();

  if (!user) {
    notFound();
  }

  const result = await getUserPullRequestById(user.id, id);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="border-destructive/30 bg-destructive/5 shadow-none">
          <CardHeader>
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-destructive" />
              <div>
                <CardTitle className="text-base">
                  Could not load pull request
                </CardTitle>
                <CardDescription className="mt-1">{result.error}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              render={<Link href="/dashboard/pull-requests" />}
            >
              GoBack to pull requests
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!result.data) {
    notFound();
  }

  const pr = result.data;

  const analysisResult = await getLatestAnalysisForPullRequest(
    user.id,
    pr.id,
    pr.headSha,
  );
  const initialAnalysis =
    analysisResult.ok && analysisResult.data ? analysisResult.data : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/dashboard/pull-requests" />}
        >
          <ArrowLeft data-icon="inline-start" />
          All pull requests
        </Button>
        {pr.htmlUrl ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer" />
            }
          >
            Open on GitHub
            <ExternalLink data-icon="inline-end" />
          </Button>
        ) : null}
      </div>

      <section className="surface rounded-3xl px-5 py-5 sm:px-6 sm:py-6">
        <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            {pr.repositoryFullName}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            #{pr.number}
          </Badge>
          <PrStatusBadge status={pr.status} />
          {pr.isDraft ? (
            <Badge variant="secondary">Draft</Badge>
          ) : null}
        </div>
        <h1 className="max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {pr.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Avatar className="size-6">
              {pr.authorAvatarUrl ? (
                <AvatarImage src={pr.authorAvatarUrl} alt={pr.authorLogin} />
              ) : null}
              <AvatarFallback className="text-[10px]">
                {pr.authorLogin.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            @{pr.authorLogin}
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-xs">
            <GitBranch className="size-3.5" />
            {pr.sourceBranch} → {pr.targetBranch}
          </span>
        </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetaCard
          label="Created"
          value={formatDate(pr.githubCreatedAt ?? pr.createdAt)}
        />
        <MetaCard
          label="Updated"
          value={formatDate(pr.githubUpdatedAt ?? pr.updatedAt)}
        />
        <MetaCard label="Head SHA" value={pr.headSha ?? "—"} mono />
        <MetaCard
          label="Last webhook action"
          value={pr.lastEventAction ?? "—"}
          mono
        />
        <MetaCard
          label="Last ingested"
          value={formatDate(pr.lastIngestedAt)}
        />
        <MetaCard
          label="Merged / closed"
          value={
            pr.mergedAt
              ? `Merged ${formatDate(pr.mergedAt)}`
              : pr.closedAt
                ? `Closed ${formatDate(pr.closedAt)}`
                : "—"
          }
        />
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
          <CardDescription>
            From the GitHub pull request body (task extraction arrives in Stage
            3).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pr.description?.trim() ? (
            <pre className="whitespace-pre-wrap rounded-2xl border border-border/70 bg-muted/20 p-4 font-sans text-sm leading-relaxed text-foreground">
              {pr.description}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No description provided.</p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Ingestion history</CardTitle>
          <CardDescription>
            Webhook lifecycle events for this pull request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pr.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            pr.events.map((event) => (
              <div key={event.id} className="rounded-2xl border border-border/70 bg-card/70 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-brand">
                    {event.eventType}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </span>
                </div>
                {event.message ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.message}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AnalysisPanel
        pullRequestId={pr.id}
        currentHeadSha={pr.headSha}
        initialAnalysis={initialAnalysis}
      />

      <Separator />
    </div>
  );
}

function MetaCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1.5 text-sm ${mono ? "font-mono text-xs break-all" : "font-medium"}`}
      >
        {value}
      </p>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}
