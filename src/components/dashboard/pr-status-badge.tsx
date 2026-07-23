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
  open: "bg-risk-low/20 text-risk-low-foreground border-transparent",
  draft: "bg-muted text-muted-foreground border-transparent",
  closed: "bg-secondary text-secondary-foreground border-transparent",
  merged: "bg-brand-muted text-brand border-transparent",
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
