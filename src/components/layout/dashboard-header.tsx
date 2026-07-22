"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

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

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md">
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
        <UserMenu user={user} />
      </div>
    </header>
  );
}
