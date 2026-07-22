import { Shield } from "lucide-react";

import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md";
}

export function Logo({
  className,
  showWordmark = true,
  size = "md",
}: LogoProps) {
  const iconSize = size === "sm" ? "size-7" : "size-8";
  const textSize = size === "sm" ? "text-sm" : "text-base";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm",
          iconSize,
        )}
      >
        <Shield className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2.25} />
      </div>
      {showWordmark ? (
        <div className="flex flex-col leading-none">
          <span className={cn("font-semibold tracking-tight", textSize)}>
            Agent PR Firewall
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Scope · Impact · Risk
          </span>
        </div>
      ) : null}
    </div>
  );
}
