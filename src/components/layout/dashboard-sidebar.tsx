"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GitPullRequest,
  LayoutDashboard,
  Settings,
  Shield,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { navItems } from "@/config/site";

const icons = {
  "/dashboard": LayoutDashboard,
  "/dashboard/repositories": Shield,
  "/dashboard/pull-requests": GitPullRequest,
  "/dashboard/settings": Settings,
} as const;

export function DashboardSidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/dashboard" className="outline-none">
          <Logo size="sm" />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Workspace
        </p>
        {navItems.map((item) => {
          const Icon = icons[item.href as keyof typeof icons] ?? LayoutDashboard;
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors",
                active
                  ? "border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground shadow-sm dark:bg-sidebar-accent/90"
                  : "text-muted-foreground hover:border-sidebar-border/80 hover:bg-sidebar-accent/40 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span className="font-medium">{item.title}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-2xl border border-border/70 bg-card/70 p-3">
          <p className="text-xs font-medium text-foreground">Agent PR Firewall</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Monitor scope, consistency, and risk across autonomous PRs.
          </p>
        </div>
      </div>
    </aside>
  );
}
