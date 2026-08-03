import { Badge } from "@/components/ui/badge";
import type { PullRequestStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

const labels: Record<PullRequestStatus, string> = {
  open: "Open",
  draft: "Draft",
  closed: "Closed",
  merged: "Merged",
};

const styles: Record<PullRequestStatus, string> = {
  open: "border-transparent bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  draft: "border-transparent bg-muted/80 text-muted-foreground",
  closed: "border-transparent bg-secondary text-secondary-foreground",
  merged:
    "border-transparent bg-sky-500/15 text-sky-950 dark:bg-sky-500/20 dark:text-sky-100",
};

export function PrStatusBadge({
  status,
  className,
}: {
  status: PullRequestStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(styles[status], className)}>
      {labels[status]}
    </Badge>
  );
}
