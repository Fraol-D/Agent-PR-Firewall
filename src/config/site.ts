export const siteConfig = {
  name: "Veris",
  shortName: "Veris",
  /** Repo/code name — keep until an explicit package rename. */
  codeName: "Agent PR Firewall",
  description:
    "Evidence-based pull request verification for autonomous coding agents.",
  tagline: "AI agents can write code. Veris checks what they actually changed.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  links: {
    github: "https://github.com/Fraol-D/Agent-PR-Firewall",
  },
} as const;

export const navItems = [
  {
    title: "Overview",
    href: "/dashboard",
    description: "Activity and risk summary",
  },
  {
    title: "Repositories",
    href: "/dashboard/repositories",
    description: "Connected GitHub repositories",
  },
  {
    title: "Pull Requests",
    href: "/dashboard/pull-requests",
    description: "Analyzed agent pull requests",
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    description: "Account and integration settings",
  },
] as const;
