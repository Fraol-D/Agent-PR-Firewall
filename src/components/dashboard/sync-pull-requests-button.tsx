"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SyncPullRequestsButton({
  repositoryId,
}: {
  repositoryId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSync() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/github/sync-pull-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          repositoryId ? { repositoryId } : {},
        ),
      });
      const body = (await res.json()) as {
        error?: string;
        pullRequestCount?: number;
        repositoryCount?: number;
      };

      if (!res.ok) {
        setError(body.error ?? "Failed to sync pull requests");
        return;
      }

      setMessage(
        `Imported ${body.pullRequestCount ?? 0} pull request(s) from ${body.repositoryCount ?? 0} repository(ies).`,
      );
      router.refresh();
    } catch {
      setError("Network error while syncing pull requests.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={loading}
        onClick={() => {
          void onSync();
        }}
      >
        <RefreshCw
          data-icon="inline-start"
          className={loading ? "animate-spin" : undefined}
        />
        {loading ? "Importing…" : "Import PRs from GitHub"}
      </Button>
      {message ? (
        <p className="text-xs text-risk-low-foreground">{message}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
