import Link from "next/link";
import { ExternalLink, GitPullRequest } from "lucide-react";

import { PrStatusBadge } from "@/components/dashboard/pr-status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PullRequestListItem } from "@/types/domain";

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function PullRequestRow({ pr }: { pr: PullRequestListItem }) {
  const updated = pr.githubUpdatedAt ?? pr.updatedAt;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand">
          <GitPullRequest className="size-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/pull-requests/${pr.id}`}
              className="truncate text-sm font-semibold hover:text-brand"
            >
              {pr.title}
            </Link>
            <PrStatusBadge status={pr.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{pr.repositoryFullName}</span>
            {" · "}
            <span className="font-mono">#{pr.number}</span>
            {" · "}
            <span className="font-mono">
              {pr.sourceBranch} → {pr.targetBranch}
            </span>
          </p>
          <div className="flex items-center gap-2 pt-0.5">
            <Avatar className="size-5">
              {pr.authorAvatarUrl ? (
                <AvatarImage src={pr.authorAvatarUrl} alt={pr.authorLogin} />
              ) : null}
              <AvatarFallback className="text-[9px]">
                {pr.authorLogin.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              @{pr.authorLogin} · updated {formatRelative(updated)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
        <Link
          href={`/dashboard/pull-requests/${pr.id}`}
          className="text-xs font-medium text-brand hover:underline"
        >
          View details
        </Link>
        {pr.htmlUrl ? (
          <a
            href={pr.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            GitHub
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
