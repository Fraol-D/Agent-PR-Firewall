# Agent PR Firewall

Scope, impact, and risk analysis for autonomous coding-agent pull requests.

> AI coding agents can generate software changes faster than humans can manually understand them. Agent PR Firewall analyzes agent PRs for task-scope compliance, change impact, security-sensitive changes, and overall risk before those changes are trusted.

This is **not** a generic AI code reviewer. Its central question:

> Did the agent do what it was asked to do, and what else might this change affect?

## Current stage

**Stage 0 — Foundation**

- Next.js (App Router) + TypeScript + Tailwind CSS
- shadcn/ui design system
- Supabase PostgreSQL schema + RLS
- GitHub authentication (via Supabase Auth)
- Protected dashboard shell
- Repository connection entry points (GitHub App wiring in Stage 1)

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js modular monolith |
| UI | React, Tailwind, shadcn/ui, Lucide |
| Auth | GitHub OAuth (Supabase Auth) |
| Data | Supabase PostgreSQL |
| Analysis | Modular engine (stubs in Stage 0) |

## Project structure

```text
src/
├── app/                 # Routes (landing, auth, dashboard, API)
├── components/          # UI + layout (no domain business logic)
├── lib/
│   ├── auth/            # Session + OAuth actions
│   ├── supabase/        # Clients + middleware helpers
│   ├── github/          # GitHub integration (Stage 1+)
│   └── analysis/        # Modular analysis engines
├── services/            # Server-side domain services
├── types/               # Domain + database types
└── config/              # Site configuration
supabase/migrations/     # SQL schema
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (default `http://localhost:3000`)

### 3. Supabase project

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL editor.
3. Enable **GitHub** under Authentication → Providers.
4. Create a GitHub OAuth App (or use GitHub App OAuth credentials):
   - Homepage: `http://localhost:3000`
   - Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
5. Copy Client ID / Secret into Supabase GitHub provider settings.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stage 0 acceptance criteria

| Criterion | Status |
| --- | --- |
| Open the application | Landing page |
| Sign in with GitHub | `/login` + Supabase OAuth |
| Access protected dashboard | Middleware + `/dashboard` |
| See application shell | Sidebar, header, overview |
| Begin connecting a repository | `/dashboard/repositories` flow |

## Development stages (from REQUIREMENTS.md)

0. Foundation ← **current**
1. GitHub Integration
2. Deterministic Analysis
3. Task-Scope Analysis
4. Decision Engine
5. Agent Feedback Loop
6. Portfolio and Product Polish

## Scripts

```bash
npm run dev      # development server
npm run build    # production build
npm run start    # start production server
npm run lint     # ESLint
```

## Security

- Request minimum GitHub OAuth scopes for sign-in (`read:user`, `user:email`).
- Repository access is intended via GitHub App permissions (Stage 1), not broad OAuth repo scopes.
- Secrets stay server-side; RLS enforces per-user data access.

## License

Private / portfolio project unless otherwise stated.
