# Agent PR Firewall — Architecture

**Audience:** Engineers continuing the project  
**Style:** Modular monolith on Next.js  
**Last updated:** After Stage 2 / Stage 2.5 hardening code

---

## 1. High-level system

```text
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
│  App Router · React · Tailwind · shadcn/ui                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Dashboard UI │  │ Auth layer   │  │ Route handlers    │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘ │
│         │                 │                      │           │
│  ┌──────▼─────────────────▼──────────────────────▼───────┐ │
│  │              Services + domain modules                 │ │
│  │  repositories · PRs · installations · analyses         │ │
│  └──────┬───────────────────────────────┬────────────────┘ │
│         │                               │                   │
│  ┌──────▼──────┐                 ┌──────▼────────────────┐ │
│  │ GitHub App  │                 │ Analysis engine       │ │
│  │ Octokit     │                 │ orchestrator + AI     │ │
│  └──────┬──────┘                 └──────┬────────────────┘ │
└─────────┼────────────────────────────────┼──────────────────┘
          │                                │
          ▼                                ▼
   GitHub APIs / Webhooks          OpenRouter (default AI)
          │                                │
          ▼                                ▼
   Supabase PostgreSQL              cohere/north-mini-code:free
   (Auth + data + RLS)
```

---

## 2. Frontend

| Concern | Choice |
| --- | --- |
| Framework | Next.js App Router (React 19) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + design tokens in `globals.css` |
| Components | shadcn/ui (Base UI primitives), Lucide icons |
| Motion | Framer Motion available; used sparingly |
| Key pages | `/`, `/login`, `/dashboard/*` |

### Primary UI surfaces

- **Landing** — product thesis and workflow  
- **Login** — GitHub OAuth via Supabase  
- **Dashboard overview** — repo/PR stats + analysis performance metrics  
- **Repositories** — connect / sync / status  
- **Pull requests** — list, import  
- **PR detail** — metadata + **Analysis panel** (Stage 2 primary surface)  
- **Settings** — integration readiness  

Business logic does **not** live in presentational components; they call APIs or server loaders.

---

## 3. Backend

Implemented **inside** the Next.js app (no separate API service).

| Pattern | Usage |
| --- | --- |
| Route Handlers | `/api/github/*`, `/api/analysis/*`, `/auth/callback` |
| Server Actions | Auth sign-in / sign-out |
| Services | `src/services/*` — domain operations |
| Lib modules | GitHub, Supabase, analysis engine |
| Middleware | Session refresh + protect `/dashboard` |

Route handlers stay thin; services own workflows.

---

## 4. Supabase

### Auth

- Provider: **GitHub OAuth** (configured in Supabase dashboard)  
- Callback: `https://<project-ref>.supabase.co/auth/v1/callback`  
- App exchange: `/auth/callback` → session cookies via `@supabase/ssr`  
- Profile sync: `users` table upsert on login  

### Database

PostgreSQL with migrations:

| Migration | Purpose |
| --- | --- |
| `001_initial_schema.sql` | Core entities + RLS |
| `002_stage1_github_integration.sql` | Connection status, PR enrichment, webhook_deliveries |
| `003_stage2_analysis_pipeline.sql` | Analysis fields, changed files, findings |
| `004_stage2_5_hardening.sql` | `duration_ms`, `complete_analysis_atomic` RPC |

### Clients

| Client | File | Use |
| --- | --- | --- |
| Browser | `lib/supabase/client.ts` | Rare; prefer server |
| Server (user) | `lib/supabase/server.ts` | RLS-scoped reads |
| Admin (service role) | `lib/supabase/admin.ts` | Webhooks, analysis writes |

**Never** expose `SUPABASE_SERVICE_ROLE_KEY` or AI keys to the client.

### RLS

Users see rows tied to repositories they connected (`connected_by_user_id` / `user_owns_repository`).  
Webhook/analysis writes use service role and then become visible via RLS.

---

## 5. GitHub App

### Concepts (do not conflate)

```text
Supabase GitHub OAuth  →  who is the user?
GitHub App install     →  which repos may we read?
```

### Permissions (Stage 1+)

- Metadata: read  
- Contents: read  
- Pull requests: read  

### Events

- Installation (+ repositories) — often automatic  
- Pull request — required for live ingest  

### Endpoints in this app

| Route | Role |
| --- | --- |
| `GET /api/github/install` | Start install with signed `state` |
| `GET /api/github/setup` | Post-install callback; link install + sync repos |
| `POST /api/github/webhooks` | HMAC-verified event processing |
| `POST /api/github/sync` | Recover installs without setup redirect |
| `POST /api/github/sync-pull-requests` | Import PR metadata via API |

### Auth to GitHub

- `@octokit/auth-app` + private key (`GITHUB_APP_PRIVATE_KEY_PATH` preferred)  
- Installation Octokit for repo-scoped API  

### Local webhooks

GitHub cannot reach `localhost`. Use a public tunnel (ngrok / cloudflared) **only** for live webhooks.  
Manual **Import PRs** works without a tunnel.

---

## 6. OAuth (user)

```text
User → Sign in with GitHub
     → Supabase Auth (GitHub provider)
     → /auth/callback exchanges code
     → cookies + users row
     → /dashboard
```

Scopes: minimal identity (`read:user`, `user:email`).  
Repository access is **not** via user OAuth PAT.

---

## 7. Webhooks

```text
GitHub POST /api/github/webhooks
  → read raw body
  → verify X-Hub-Signature-256 (GITHUB_APP_WEBHOOK_SECRET)
  → claim delivery_id (idempotency)
  → process pull_request | installation | installation_repositories
  → upsert repos / PRs
  → 200/202/4xx/5xx
```

Middleware skips session redirect for webhook paths.

---

## 8. Repository synchronization

1. User installs App (or already installed).  
2. Setup callback or **Sync installed repositories** calls GitHub list repos.  
3. Upsert `github_installations` + `repositories` with `connection_status`.  
4. Dashboard lists connected repos.

---

## 9. Pull request synchronization

**Live:** webhook `pull_request.*` → `upsertPullRequestFromWebhookAdmin`.  

**Manual:** `syncPullRequestsForUser` lists PRs via installation token.  

Uniqueness: `github_pr_id` and `(repository_id, number)`.

---

## 10. Analysis pipeline

```text
User clicks Analyze on PR detail
        ↓
POST /api/analysis/start
        ↓
Authz: user owns repository
        ↓
Create analyses row (pending) with head_sha pinned
        ↓
status → running
        ↓
Verify SHA exists (getCommit)
        ↓
compareCommits(base_sha, head_sha)  ← not live tip drift
        ↓
Classify / filter / redact / bound context
        ↓
AI provider.analyzePullRequest(context)
        ↓
Normalize + Zod validate
        ↓
Filter affectedFiles to real changed paths
        ↓
Calibrate confidence
        ↓
Atomic persist (RPC) or sequential+cleanup
        ↓
status → completed | failed
        ↓
UI polls GET /api/analysis/:id
```

### Analysis modules (`src/lib/analysis`)

| Module | Role |
| --- | --- |
| `collect-changes.ts` | SHA-pinned GitHub compare |
| `classify.ts` | Deterministic file categories |
| `filters.ts` | Cost/safety exclusions + redaction |
| `build-context.ts` | Bounded AI context text |
| `orchestrator.ts` | End-to-end run |
| `validate-files.ts` | Drop hallucinated paths |
| `confidence.ts` | Cap/calibrate confidence |
| `log.ts` | Structured JSON logs |
| `ai/*` | Provider abstraction + implementations |
| `scope/`, `risk/`, `impact/`, `tests/` | Stubs for later stages |

### Lifecycle statuses

`pending` (queued) → `running` → `completed` | `failed`  

UI “not started” = no analysis row.

---

## 11. OpenRouter integration

| Item | Value |
| --- | --- |
| Default provider | `AI_PROVIDER=openrouter` (default) |
| Implementation | `OpenRouterAnalysisProvider` |
| Base URL | `https://openrouter.ai/api/v1` |
| Client | `openai` npm package (OpenAI-compatible) |
| Env | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| Default model | `cohere/north-mini-code:free` |
| Structured output | `response_format.json_schema` + post Zod |
| Normalization | `normalize.ts` (casing/aliases before Zod) |

Optional: `AI_PROVIDER=gemini` with `GEMINI_API_KEY` (not default).  
xAI provider file exists but is **not** default (paid credits).

---

## 12. Database overview (conceptual)

```text
users
  └── github_installations
        └── repositories
              └── pull_requests
                    ├── tasks (Stage 3)
                    ├── analyses
                    │     ├── analysis_changed_files
                    │     ├── analysis_findings
                    │     ├── risk_factors
                    │     └── analysis_events
                    └── analysis_events
webhook_deliveries
policy_configurations (later)
```

Analyses are versioned per PR (`analysis_version`) and pin `head_sha`.

---

## 13. Environment variables

| Variable | Required for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | App | Local usually `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth/DB | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth/DB | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhooks/analysis writes | Server only |
| `GITHUB_APP_ID` | GitHub App | |
| `GITHUB_APP_SLUG` | Install URL | |
| `GITHUB_APP_PRIVATE_KEY_PATH` | App JWT | Prefer `secrets/*.pem` |
| `GITHUB_APP_PRIVATE_KEY` | Alt | Full PEM or path (path form supported) |
| `GITHUB_APP_WEBHOOK_SECRET` | Webhooks | Match GitHub App setting |
| `OPENROUTER_API_KEY` | Stage 2 analysis | Server only |
| `OPENROUTER_MODEL` | Optional | Default free model |
| `AI_PROVIDER` | Optional | `openrouter` \| `gemini` |
| `GEMINI_API_KEY` | Optional alt | Free AI Studio |

See `.env.example`.

---

## 14. Folder structure

```text
src/
├── app/                    # Routes (UI + API)
│   ├── api/analysis/       # Stage 2 analysis HTTP API
│   ├── api/github/         # App install, setup, webhooks, sync
│   ├── auth/callback/      # OAuth code exchange
│   ├── dashboard/          # Protected product UI
│   ├── login/
│   └── page.tsx            # Landing
├── components/             # UI only
├── config/                 # Site config
├── lib/
│   ├── analysis/           # Analysis engine
│   ├── auth/
│   ├── github/
│   └── supabase/
├── services/               # Domain services
├── types/                  # Domain + DB types
└── middleware.ts
supabase/migrations/
docs/                       # This handoff set
scripts/                    # Dev utilities (key check, list installs)
secrets/                    # Local PEM files (gitignored)
```

---

## 15. Important modules

| Path | Responsibility |
| --- | --- |
| `services/analyses.ts` | Start job, execute, persist, metrics |
| `services/github-events.ts` | Webhook processing |
| `services/github-installations.ts` | Install/setup/sync |
| `services/pull-requests.ts` | PR CRUD + API import |
| `services/repositories.ts` | Repo list + overview stats |
| `lib/github/config.ts` | Env + PEM loading |
| `lib/analysis/ai/index.ts` | Provider factory |
| `components/dashboard/analysis-panel.tsx` | Analyze UX |

---

## 16. Data flow — analyze PR

```text
Browser AnalysisPanel
  → POST /api/analysis/start { pullRequestId, force? }
  → services/analyses.startPullRequestAnalysis
  → create analyses (head_sha pinned)
  → executeAnalysisJob
       → runPullRequestAnalysis
            → collectPullRequestChanges (SHA-pinned)
            → buildAnalysisContext
            → OpenRouterAnalysisProvider
            → normalize + Zod
            → filter affectedFiles
            → calibrate confidence
       → complete_analysis_atomic (or sequential fallback)
  → Browser polls GET /api/analysis/:id
  → Render findings
```

---

## 17. Security architecture notes

- Webhook secret HMAC (`webhooks/verify.ts`)  
- Install `state` HMAC (`install-state.ts`)  
- Service role only on server  
- AI keys only on server  
- Context redaction for secrets/JWT/private keys  
- `.env*`, `secrets/`, `*.pem` gitignored  

---

## 18. Known architectural debt

- Analysis runs **inline** in the request (no queue).  
- Free models are rate-limited and sometimes loose with enums (mitigated by normalize).  
- Remote `main` may lag local Stage 2+ uncommitted work — see handoff.  
- Scope/risk/impact engine folders are stubs for Stages 3–4.  
