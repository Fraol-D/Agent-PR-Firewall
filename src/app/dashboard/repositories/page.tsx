import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  GitBranch,
  GitPullRequest,
  Plus,
} from "lucide-react";

import { ConnectRepoCard } from "@/components/dashboard/connect-repo-card";
import { ConnectionStatusBadge } from "@/components/dashboard/connection-status-badge";
import { SyncInstallationsButton } from "@/components/dashboard/sync-installations-button";
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
  getGitHubAppMissingConfig,
  isGitHubAppConfigured,
  isGitHubWebhookConfigured,
} from "@/lib/github/config";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { listUserRepositories } from "@/services/repositories";

interface RepositoriesPageProps {
  searchParams: Promise<{
    connected?: string;
    repos?: string;
    error?: string;
    detail?: string;
    missing?: string;
    action?: string;
  }>;
}

const errorMessages: Record<string, string> = {
  github_app_not_configured:
    "GitHub App environment variables are not fully configured on the server.",
  missing_installation_id: "GitHub did not return an installation id.",
  invalid_installation_id: "The installation id from GitHub was invalid.",
  install_state_mismatch:
    "The installation state did not match your signed-in account. Try connecting again.",
  setup_failed: "GitHub App setup failed while syncing repositories.",
};

export default async function RepositoriesPage({
  searchParams,
}: RepositoriesPageProps) {
  const params = await searchParams;
  const user = await getCurrentUserProfile();
  const reposResult = user
    ? await listUserRepositories(user.id)
    : { ok: true as const, data: [] };

  const repositories = reposResult.ok ? reposResult.data : [];
  const appConfigured = isGitHubAppConfigured();
  const webhookConfigured = isGitHubWebhookConfigured();
  const adminConfigured = isAdminClientConfigured();
  const missing = getGitHubAppMissingConfig();

  const errorMessage =
    params.error &&
    (params.detail
      ? `${errorMessages[params.error] ?? "Connection error."} ${params.detail}`
      : errorMessages[params.error] ?? decodeURIComponent(params.error));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Repositories</h2>
          <p className="text-sm text-muted-foreground">
            Connect GitHub repositories via the GitHub App to ingest pull
            requests.
          </p>
        </div>
        {appConfigured ? (
          <Button render={<a href="/api/github/install" />}>
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

      {params.connected === "1" ? (
        <div className="rounded-lg border border-risk-low/30 bg-risk-low/10 px-4 py-3 text-sm text-risk-low-foreground">
          GitHub App installation complete
          {params.repos
            ? ` · ${params.repos} repositor${params.repos === "1" ? "y" : "ies"} connected`
            : ""}
          . Open or update a pull request to see it appear in the dashboard.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!reposResult.ok ? (
        <Card className="border-destructive/30 bg-destructive/5 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Could not load repositories</CardTitle>
            <CardDescription>{reposResult.error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {repositories.length === 0 && reposResult.ok ? (
        <>
          <ConnectRepoCard />
          <Card className="border-border/80 bg-card/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Connection checklist</CardTitle>
              <CardDescription>
                Complete these steps so GitHub can install the App and send PR
                webhooks to Agent PR Firewall.
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
                done={adminConfigured}
                label="Supabase service role configured (webhook writes)"
              />
              <ChecklistItem
                done={webhookConfigured}
                label="Webhook secret configured"
              />
              <ChecklistItem
                done={false}
                label="Repository installed and selected"
              />
              {missing.length > 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Missing env:{" "}
                  <code className="font-mono text-foreground">
                    {missing.join(", ")}
                  </code>
                </p>
              ) : null}
              <div className="space-y-3 border-t border-border/60 pt-4">
                <p className="text-sm text-muted-foreground">
                  Already installed the App on GitHub but nothing shows here?
                  Sync imports the existing installation (we detected this is
                  the usual failure when Setup URL redirect does not return to
                  the app).
                </p>
                <SyncInstallationsButton />
              </div>
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
      ) : null}

      {repositories.length > 0 ? (
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
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{repo.fullName}</p>
                      {repo.private ? (
                        <Badge variant="outline" className="text-[10px]">
                          Private
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Public
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Default branch ·{" "}
                      <span className="font-mono">{repo.defaultBranch}</span>
                      {repo.lastSyncedAt
                        ? ` · synced ${new Date(repo.lastSyncedAt).toLocaleString()}`
                        : ""}
                    </p>
                    {repo.connectionError ? (
                      <p className="text-xs text-destructive">
                        {repo.connectionError}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ConnectionStatusBadge status={repo.connectionStatus} />
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link
                        href={`/dashboard/pull-requests?repository=${repo.id}`}
                      />
                    }
                  >
                    <GitPullRequest data-icon="inline-start" />
                    Pull requests
                  </Button>
                  {repo.htmlUrl ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      render={
                        <a
                          href={repo.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      GitHub
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
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
