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
  connected:
    "border-transparent bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  pending:
    "border-transparent bg-amber-500/15 text-amber-950 dark:text-amber-100",
  error: "border-transparent bg-red-500/15 text-red-950 dark:text-red-100",
  disconnected: "border-transparent bg-muted/80 text-muted-foreground",
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
