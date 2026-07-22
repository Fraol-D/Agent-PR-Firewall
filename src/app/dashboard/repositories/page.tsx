import Link from "next/link";
import { ArrowRight, GitBranch, Plus } from "lucide-react";

import { ConnectRepoCard } from "@/components/dashboard/connect-repo-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUserProfile } from "@/lib/auth/session";
import {
  getGitHubAppInstallUrl,
  isGitHubAppConfigured,
} from "@/lib/github";
import { listUserRepositories } from "@/services/repositories";

export default async function RepositoriesPage() {
  const user = await getCurrentUserProfile();
  const repositories = user ? await listUserRepositories(user.id) : [];
  const installUrl = getGitHubAppInstallUrl();
  const appConfigured = isGitHubAppConfigured();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Repositories</h2>
          <p className="text-sm text-muted-foreground">
            Connect GitHub repositories to enable PR monitoring and analysis.
          </p>
        </div>
        {appConfigured && installUrl ? (
          <Button render={<a href={installUrl} />}>
            <Plus data-icon="inline-start" />
            Connect repository
          </Button>
        ) : (
          <Button variant="outline" disabled>
            <Plus data-icon="inline-start" />
            Connect repository
          </Button>
        )}
      </div>

      {repositories.length === 0 ? (
        <>
          <ConnectRepoCard />
          <Card className="border-border/80 bg-card/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Connection checklist</CardTitle>
              <CardDescription>
                Stage 0 provides the authenticated shell and connection entry
                points. Stage 1 completes GitHub App install callbacks, repo
                selection, and webhooks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ChecklistItem
                done={Boolean(user)}
                label="Signed in with GitHub"
              />
              <ChecklistItem
                done={appConfigured}
                label="GitHub App credentials configured"
              />
              <ChecklistItem
                done={false}
                label="Repository installed and selected"
              />
              <ChecklistItem
                done={false}
                label="Webhook endpoint receiving PR events"
              />
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/dashboard/settings" />}
                >
                  Review integration settings
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="grid gap-3">
          {repositories.map((repo) => (
            <Card
              key={repo.id}
              className="border-border/80 bg-card/80 shadow-none"
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-brand-muted text-brand">
                    <GitBranch className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium">{repo.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      Default branch · {repo.defaultBranch}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">
                  {repo.isActive ? "Active" : "Inactive"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
      <span
        className={
          done
            ? "size-2 rounded-full bg-risk-low"
            : "size-2 rounded-full bg-muted-foreground/40"
        }
      />
      <span className={done ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}
