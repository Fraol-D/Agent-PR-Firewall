export const siteConfig = {
  name: "Agent PR Firewall",
  shortName: "APF",
  description:
    "Scope, impact, and risk analysis for autonomous coding-agent pull requests.",
  tagline: "AI agents can write code. But who checks what they changed?",
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
