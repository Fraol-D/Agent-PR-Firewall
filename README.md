# Agent PR Firewall

Scope, impact, and risk analysis for autonomous coding-agent pull requests.

> AI coding agents can generate software changes faster than humans can manually understand them. Agent PR Firewall analyzes agent PRs for task-scope compliance, change impact, security-sensitive changes, and overall risk before those changes are trusted.

This is **not** a generic AI code reviewer. Its central question:

> Did the agent do what it was asked to do, and what else might this change affect?

## Current stage

**Stage 2 — PR Analysis Pipeline** (with Stage 2.5 hardening in tree)

- Stage 0 foundation + Stage 1 GitHub integration
- Manual **Analyze pull request** on PR detail
- Deterministic changed-file collection + classification
- Bounded analysis context (secrets/lockfiles/binaries excluded)
- AI-assisted structured findings via **OpenRouter free model** `cohere/north-mini-code:free` (`OPENROUTER_API_KEY`)
- Historical analyses per commit SHA with outdated detection
- Hardening: SHA-pinned compares, confidence calibration, duration metrics, structured logs

## Prerequisites

Before setup, you need:

| Requirement | Notes |
| --- | --- |
| Node.js 20+ | LTS recommended |
| npm | Comes with Node |
| Supabase project | Free tier is fine |
| GitHub account | For OAuth and GitHub App install |
| OpenRouter account | Free key for Stage 2 analysis |
| Optional: tunnel | ngrok or cloudflared if you need live webhooks |

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js modular monolith |
| UI | React, Tailwind, shadcn/ui, Lucide |
| Auth | GitHub OAuth (Supabase Auth) |
| Data | Supabase PostgreSQL |
| GitHub | GitHub App + Webhooks + Octokit |
| Analysis | Modular engine (OpenRouter free model by default) |

## Project structure

```text
src/
├── app/
│   ├── api/
│   │   ├── analysis/    # start + poll analysis
│   │   └── github/      # install, setup, webhooks, sync
│   ├── auth/            # OAuth callback
│   └── dashboard/       # protected UI
├── components/
├── lib/
│   ├── auth/
│   ├── supabase/        # user client + service-role admin
│   ├── github/          # App auth, config, webhook verify
│   └── analysis/        # Stage 2 pipeline + AI providers
├── services/            # installations, repos, PRs, events, analyses
├── types/
└── config/
supabase/migrations/
docs/                    # architecture, PRD, roadmap, handoff
```

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in values from Supabase, your GitHub App, and OpenRouter. Never commit `.env.local` or PEM private keys.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app origin (local or tunnel) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser/server user client |
| `SUPABASE_SERVICE_ROLE_KEY` | **Stage 1** | Webhook + setup writes (server only) |
| `GITHUB_APP_ID` | **Stage 1** | GitHub App ID |
| `GITHUB_APP_SLUG` | **Stage 1** | App slug for install URL |
| `GITHUB_APP_PRIVATE_KEY_PATH` | **Stage 1** | Preferred path to App PEM (e.g. `secrets/github-app.pem`) |
| `GITHUB_APP_PRIVATE_KEY` | Alt | Full PEM if not using a path |
| `GITHUB_APP_WEBHOOK_SECRET` | **Stage 1** | HMAC signature verification |
| `GITHUB_APP_CLIENT_ID` | Optional | App OAuth (not required for Stage 1) |
| `GITHUB_APP_CLIENT_SECRET` | Optional | App OAuth (not required for Stage 1) |
| `OPENROUTER_API_KEY` | **Stage 2** | Free OpenRouter key for PR analysis |
| `OPENROUTER_MODEL` | Optional | Default `cohere/north-mini-code:free` |
| `AI_PROVIDER` | Optional | `openrouter` (default) or `gemini` |

### 3. Supabase

1. Create a Supabase project.
2. Run migrations in the SQL editor **in order**:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_stage1_github_integration.sql`
   - `supabase/migrations/003_stage2_analysis_pipeline.sql`
   - `supabase/migrations/004_stage2_5_hardening.sql`
3. Enable **GitHub** under Authentication → Providers (OAuth App for sign-in).
4. Copy **Project URL**, **anon key**, and **service_role** key into `.env.local`.
5. Add a free `OPENROUTER_API_KEY` from https://openrouter.ai/keys for Stage 2 analysis. Default model: `cohere/north-mini-code:free` (no paid credits required).

### 4. Create the GitHub App

1. Open [GitHub → Settings → Developer settings → GitHub Apps](https://github.com/settings/apps) → **New GitHub App**.
2. Fill in:

| Field | Value |
| --- | --- |
| GitHub App name | e.g. `Agent PR Firewall` |
| Homepage URL | `http://localhost:3000` (or your tunnel URL) |
| Callback URL | `{APP_URL}/api/github/setup` |
| Setup URL | `{APP_URL}/api/github/setup` |
| **Redirect on update** | Enable |
| Webhook URL | `{APP_URL}/api/github/webhooks` |
| Webhook secret | Long random string → same as `GITHUB_APP_WEBHOOK_SECRET` |

3. **Repository permissions** (minimum for Stage 1):

| Permission | Access |
| --- | --- |
| Metadata | Read-only |
| Contents | Read-only |
| Pull requests | Read-only |

4. **Subscribe to events**:

- `Installation`
- `Installation repositories`
- `Pull request`

5. Create the App, then:
   - Note **App ID** → `GITHUB_APP_ID`
   - Note **slug** from the public page URL (`github.com/apps/<slug>`) → `GITHUB_APP_SLUG`
   - Generate a **private key** → save under `secrets/github-app.pem` and set `GITHUB_APP_PRIVATE_KEY_PATH` (preferred), or paste into `GITHUB_APP_PRIVATE_KEY` with `\n` for newlines

### 5. Local webhooks (optional for real PR events)

GitHub cannot reach `localhost`. Use a tunnel **or** use **Import PRs** in the dashboard without webhooks:

```bash
# example with ngrok
ngrok http 3000
```

Then set:

```env
NEXT_PUBLIC_APP_URL=https://YOUR_SUBDOMAIN.ngrok-free.app
```

Update the GitHub App **Homepage**, **Setup URL**, and **Webhook URL** to the same public origin.

Restart `npm run dev` after env changes.

### 6. Run the app

```bash
npm run dev
```

Open the app URL → sign in → **Repositories** → **Connect repository**.

## End-to-end test checklist

1. Sign in with GitHub (Supabase OAuth).
2. Click **Connect repository** → install the App on a test repo.
3. Confirm you return to `/dashboard/repositories` with **Connected** status.
4. Open a PR (or push to an existing PR branch) on that repo.
5. Confirm the PR appears under **Pull requests** and on the overview.
6. Open the PR detail page and verify metadata + ingestion history.
7. Click **Analyze pull request** and confirm structured findings render.
8. Push another commit → PR updates in place (no duplicate row); re-analyze if head SHA moved.

### Manual webhook signature check

- Valid signature → `200` / `202` JSON response
- Invalid `X-Hub-Signature-256` → `401 Invalid signature`

## Stage acceptance

| Stage | Criteria |
| --- | --- |
| **0** | Landing, GitHub sign-in, protected dashboard shell |
| **1** | App install, connected repos, signed webhooks, PR list/detail |
| **2** | Manual analyze, structured findings, commit-aware history |
| **2.5** | SHA integrity, calibrated confidence, duration metrics, clean failures |

## Development stages

0. Foundation  
1. GitHub Integration  
2. PR Analysis Pipeline ← **current**  
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

- User OAuth scopes are minimal (`read:user`, `user:email`).
- Repository access is via GitHub App installation, not user PATs.
- Webhooks are rejected without a valid HMAC signature.
- `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are server-only.
- RLS still scopes user reads; webhooks write with the service role on the server.

## Contributing

This is a portfolio project with staged delivery. If you contribute:

1. Branch from up-to-date `main`.
2. Keep changes scoped to one concern (docs, auth, API, schema, etc.).
3. Prefer deterministic analysis steps before LLM calls.
4. Do not commit secrets (`.env.local`, `secrets/*.pem`, private keys).
5. Run `npm run lint` and `npm run build` before opening a PR.
6. Update `docs/` when architecture or stage status changes.
7. Stay on the free-tier AI path for baseline development (`OPENROUTER_MODEL=cohere/north-mini-code:free`).

See `docs/ROADMAP.md` and `docs/ARCHITECTURE.md` for stage goals and system design.

## License

Private / portfolio project unless otherwise stated.
