import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "low" | "review" | "blocked" | "brand";
}

const toneStyles: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-muted-foreground bg-muted/70",
  brand: "text-foreground bg-muted/70",
  low: "text-emerald-800 bg-emerald-500/15 dark:text-risk-low dark:bg-transparent",
  review:
    "text-amber-900 bg-amber-500/15 dark:text-risk-review dark:bg-transparent",
  blocked:
    "text-red-900 bg-red-500/15 dark:text-risk-blocked dark:bg-transparent",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: StatCardProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-xl border border-border/70",
            toneStyles[tone],
          )}
        >
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}
