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
  default: "text-muted-foreground bg-muted/60",
  brand: "text-brand bg-brand-muted",
  low: "text-risk-low-foreground bg-risk-low/20",
  review: "text-risk-required-foreground bg-risk-required/20",
  blocked: "text-risk-blocked-foreground bg-risk-blocked/25",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: StatCardProps) {
  return (
    <Card className="border-border/80 bg-card/80 shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
            "flex size-9 items-center justify-center rounded-lg",
            toneStyles[tone],
          )}
        >
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}
