import Image from "next/image";

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
  const logoBoxSize = size === "sm" ? "size-7" : "size-8";
  const imageSize = size === "sm" ? "28px" : "32px";
  const textSize = size === "sm" ? "text-sm" : "text-base";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn("relative shrink-0", logoBoxSize)}>
        <Image
          src="/assets/logo.png"
          alt="Agent PR Firewall"
          fill
          priority={size === "sm"}
          className="object-contain"
          sizes={imageSize}
        />
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
