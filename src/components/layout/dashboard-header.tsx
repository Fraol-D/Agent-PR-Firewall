"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoonStar, Menu, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { navItems } from "@/config/site";
import type { UserProfile } from "@/types/domain";

interface DashboardHeaderProps {
  user: UserProfile;
  title?: string;
  description?: string;
}

export function DashboardHeader({
  user,
  title,
  description,
}: DashboardHeaderProps) {
  const pathname = usePathname();
  const current =
    navItems.find((item) =>
      item.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname.startsWith(item.href),
    ) ?? navItems[0];

  const pageTitle = title ?? current.title;
  const pageDescription = description ?? current.description;
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl dark:bg-background/90">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label="Open navigation"
                />
              }
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <DashboardSidebar className="w-full border-0" />
            </SheetContent>
          </Sheet>
          <Link href="/dashboard" className="lg:hidden">
            <Logo size="sm" showWordmark={false} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
              {pageTitle}
            </h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {pageDescription}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground dark:border-border dark:bg-card dark:hover:bg-muted/60"
            aria-label="Toggle theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            disabled={!mounted}
          >
            {mounted && resolvedTheme === "dark" ? (
              <SunMedium className="size-4" />
            ) : (
              <MoonStar className="size-4" />
            )}
          </button>
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
