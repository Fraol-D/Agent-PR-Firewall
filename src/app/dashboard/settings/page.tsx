import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUserProfile } from "@/lib/auth/session";
import {
  GITHUB_APP_PERMISSIONS,
  GITHUB_APP_WEBHOOK_EVENTS,
  getAppUrl,
  getGitHubAppMissingConfig,
  getGitHubAppSlug,
  isGitHubAppConfigured,
  isGitHubWebhookConfigured,
} from "@/lib/github/config";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const user = await getCurrentUserProfile();
  const supabaseReady = isSupabaseConfigured();
  const githubAppReady = isGitHubAppConfigured();
  const webhookReady = isGitHubWebhookConfigured();
  const adminReady = isAdminClientConfigured();
  const missing = getGitHubAppMissingConfig();
  const slug = getGitHubAppSlug();
  const appUrl = getAppUrl();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Account and integration status for GitHub-connected ingestion.
        </p>
      </div>

      <Card className="border-border/80 bg-card/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>
            GitHub identity used for authentication (OAuth via Supabase).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Username" value={user ? `@${user.username}` : "—"} />
          <Row label="Display name" value={user?.displayName ?? "—"} />
          <Row label="Email" value={user?.email ?? "—"} />
          <Row
            label="GitHub user id"
            value={user?.githubUserId ? String(user.githubUserId) : "—"}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Integrations</CardTitle>
          <CardDescription>
            Server configuration required for Stage 1.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow
            label="Supabase"
            description="Auth + PostgreSQL"
            ready={supabaseReady}
          />
          <StatusRow
            label="Supabase service role"
            description="Required for webhook writes (bypasses RLS safely on server)"
            ready={adminReady}
          />
          <StatusRow
            label="GitHub OAuth"
            description="Sign-in provider via Supabase Auth"
            ready={supabaseReady}
          />
          <StatusRow
            label="GitHub App"
            description={
              slug
                ? `App slug: ${slug}`
                : "Repository install + API access"
            }
            ready={githubAppReady}
          />
          <StatusRow
            label="Webhook secret"
            description="Signature verification for /api/github/webhooks"
            ready={webhookReady}
          />
          {missing.length > 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Missing:{" "}
              <code className="font-mono text-foreground">
                {missing.join(", ")}
              </code>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">GitHub App endpoints</CardTitle>
          <CardDescription>
            Configure these URLs in your GitHub App settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Homepage" value={appUrl} />
          <Row label="Setup URL" value={`${appUrl}/api/github/setup`} />
          <Row
            label="Webhook URL"
            value={`${appUrl}/api/github/webhooks`}
          />
          <Row
            label="Callback URL (OAuth, optional)"
            value={`${appUrl}/api/github/setup`}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Minimum App permissions</CardTitle>
          <CardDescription>
            Stage 1 only needs read access for ingestion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {Object.entries(GITHUB_APP_PERMISSIONS).map(([key, value]) => (
            <Row key={key} label={key} value={String(value)} />
          ))}
          <div className="pt-2">
            <p className="mb-2 text-xs text-muted-foreground">Webhook events</p>
            <div className="flex flex-wrap gap-2">
              {GITHUB_APP_WEBHOOK_EVENTS.map((event) => (
                <Badge key={event} variant="secondary" className="font-mono">
                  {event}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Security notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            OAuth authenticates users. The GitHub App installation grants
            repository access separately.
          </p>
          <p>
            Webhook signatures are verified with{" "}
            <code className="font-mono text-[11px] text-foreground">
              GITHUB_APP_WEBHOOK_SECRET
            </code>
            . Private keys and secrets stay server-side only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all text-right font-mono text-xs text-foreground sm:text-sm">
        {value}
      </span>
    </div>
  );
}

function StatusRow({
  label,
  description,
  ready,
}: {
  label: string;
  description: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Badge variant={ready ? "secondary" : "outline"}>
        {ready ? "Configured" : "Pending"}
      </Badge>
    </div>
  );
}
