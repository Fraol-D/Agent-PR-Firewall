import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { isGitHubAppConfigured } from "@/lib/github";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const user = await getCurrentUserProfile();
  const supabaseReady = isSupabaseConfigured();
  const githubAppReady = isGitHubAppConfigured();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Account and integration status for the foundation stage.
        </p>
      </div>

      <Card className="border-border/80 bg-card/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>GitHub identity used for authentication.</CardDescription>
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
            Environment readiness for Stage 0 and Stage 1.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow
            label="Supabase"
            description="Auth + PostgreSQL"
            ready={supabaseReady}
          />
          <StatusRow
            label="GitHub OAuth"
            description="Sign-in provider via Supabase Auth"
            ready={supabaseReady}
          />
          <StatusRow
            label="GitHub App"
            description="Repository install + webhooks (Stage 1)"
            ready={githubAppReady}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Security notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            OAuth requests only identity scopes. Repository access is granted
            separately through the GitHub App with minimum required permissions.
          </p>
          <p>
            Secrets never ship to the client. Service modules keep business
            logic outside route handlers and UI components.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs text-foreground sm:text-sm">{value}</span>
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
