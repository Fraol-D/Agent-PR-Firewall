"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SyncInstallationsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSync() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/github/sync", { method: "POST" });
      const body = (await res.json()) as {
        error?: string;
        repositoryCount?: number;
        installationCount?: number;
        installations?: Array<{ account: string; repos: number }>;
      };

      if (!res.ok) {
        setError(body.error ?? "Sync failed");
        return;
      }

      setMessage(
        `Synced ${body.installationCount ?? 0} installation(s) and ${body.repositoryCount ?? 0} repository(ies).`,
      );
      router.refresh();
    } catch {
      setError("Network error while syncing. Is the app running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={loading}
        onClick={() => {
          void onSync();
        }}
      >
        <RefreshCw
          data-icon="inline-start"
          className={loading ? "animate-spin" : undefined}
        />
        {loading ? "Syncing…" : "Sync installed repositories"}
      </Button>
      {message ? (
        <p className="text-xs text-risk-low-foreground">{message}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Use this if the GitHub App is already installed but repositories do not
        appear here (setup redirect did not complete).
      </p>
    </div>
  );
}
