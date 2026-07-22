import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import type { UserProfile } from "@/types/domain";

interface SiteHeaderProps {
  user?: UserProfile | null;
}

export function SiteHeader({ user }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
          <Logo size="sm" />
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/dashboard" />}
              >
                Dashboard
              </Button>
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/login" />}
              >
                Sign in
              </Button>
              <Button size="sm" render={<Link href="/login" />}>
                Get started
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
