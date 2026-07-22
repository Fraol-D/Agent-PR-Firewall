import Link from "next/link";
import { ArrowRight, GitBranch, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGitHubAppInstallUrl, isGitHubAppConfigured } from "@/lib/github";

export function ConnectRepoCard() {
  const installUrl = getGitHubAppInstallUrl();
  const configured = isGitHubAppConfigured();

  return (
    <Card className="overflow-hidden border-border/80 bg-card/80 shadow-none">
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand-muted text-brand">
            <ShieldCheck className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">Connect a repository</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Install the GitHub App and select repositories for Agent PR
              Firewall to monitor. Stage 0 starts the connection flow; Stage 1
              completes webhook-backed sync.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[11px] text-foreground">
              1
            </span>
            <span>
              Install the Agent PR Firewall GitHub App on your account or org.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[11px] text-foreground">
              2
            </span>
            <span>
              Choose which repositories receive pull request analysis.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[11px] text-foreground">
              3
            </span>
            <span>
              When agents open or update PRs, analysis results appear here.
            </span>
          </li>
        </ol>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {configured && installUrl ? (
            <Button render={<a href={installUrl} />}>
              Install GitHub App
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button render={<Link href="/dashboard/repositories" />}>
              Begin repository connection
              <ArrowRight data-icon="inline-end" />
            </Button>
          )}
          <Button
            variant="outline"
            render={<Link href="/dashboard/repositories" />}
          >
            <GitBranch data-icon="inline-start" />
            View repositories
          </Button>
        </div>

        {!configured ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            GitHub App credentials are not configured yet. You can still open
            the repositories page and complete setup when{" "}
            <code className="font-mono text-[11px] text-foreground">
              GITHUB_APP_SLUG
            </code>{" "}
            and related env vars are available (Stage 1).
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
