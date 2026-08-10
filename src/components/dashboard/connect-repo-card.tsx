import Link from "next/link";
import { ArrowRight, GitBranch, ShieldCheck } from "lucide-react";

import { SyncInstallationsButton } from "@/components/dashboard/sync-installations-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getGitHubAppInstallUrl,
  isGitHubAppConfigured,
} from "@/lib/github/config";

export function ConnectRepoCard() {
  const installUrl = getGitHubAppInstallUrl();
  const configured = isGitHubAppConfigured();

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="border-b border-border/70 bg-muted/20">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">Connect a repository</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Install the Agent PR Firewall GitHub App and select repositories
              to monitor. OAuth signs you in; the App grants repository access.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-6">
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background font-mono text-[11px] text-foreground">
              1
            </span>
            <span>
              Install the GitHub App on your account or organization.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background font-mono text-[11px] text-foreground">
              2
            </span>
            <span>
              Choose which repositories should send pull request events.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background font-mono text-[11px] text-foreground">
              3
            </span>
            <span>
              When agents open or update PRs, they appear in the dashboard.
            </span>
          </li>
        </ol>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {configured ? (
            <Button render={<a href="/api/github/install" />}>
              Install GitHub App
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button
              variant="outline"
              render={<Link href="/dashboard/settings" />}
            >
              Configure GitHub App env
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
          <p className="rounded-2xl border border-dashed border-border/70 bg-muted/25 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
            Server needs{" "}
            <code className="font-mono text-[11px] text-foreground">
              GITHUB_APP_ID
            </code>
            ,{" "}
            <code className="font-mono text-[11px] text-foreground">
              GITHUB_APP_SLUG
            </code>
            , and{" "}
            <code className="font-mono text-[11px] text-foreground">
              GITHUB_APP_PRIVATE_KEY_PATH
            </code>
            . See README for setup.
          </p>
        ) : (
          <div className="space-y-3 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">
              Install flow uses a signed state so repositories are linked to
              your account. If GitHub already shows the App installed but this
              page is empty, sync below.
            </p>
            <SyncInstallationsButton />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
