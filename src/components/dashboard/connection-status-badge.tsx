import { Badge } from "@/components/ui/badge";
import type { RepositoryConnectionStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

const labels: Record<RepositoryConnectionStatus, string> = {
  connected: "Connected",
  pending: "Installation pending",
  error: "Connection error",
  disconnected: "Not connected",
};

const styles: Record<RepositoryConnectionStatus, string> = {
  connected: "bg-risk-low/15 text-risk-low-foreground border-transparent",
  pending: "bg-risk-review/15 text-risk-review-foreground border-transparent",
  error: "bg-risk-blocked/15 text-risk-blocked-foreground border-transparent",
  disconnected: "bg-muted/80 text-muted-foreground border-transparent",
};

export function ConnectionStatusBadge({
  status,
  className,
}: {
  status: RepositoryConnectionStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium capitalize", styles[status], className)}
    >
      {labels[status]}
    </Badge>
  );
}
