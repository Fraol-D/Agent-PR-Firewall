# Agent PR Firewall — Architecture

**Audience:** Engineers continuing the project
**Style:** Modular monolith (Next.js)
**Last updated:** v0.3.0 — Stage 3 (Scope & Consistency Analysis)

---

## 1. High-level system

```text
┌──────────────────────────────────────────────────────────────┐
│                    Next.js Application                         │
│  App Router · React 19 · Tailwind · shadcn/ui                  │
│                                                                │
│  Dashboard UI ── Auth ── Route handlers                        │
│       │              │            │                            │
│       └────────── Services + domain modules ────────────────── │
│                    repositories · PRs · analyses               │
│                         │                │                     │
│                   GitHub App          Analysis engine          │
│                   (Octokit)           orchestrator + AI        │
└─────────────────────────┼────────────────┼─────────────────────┘
                          │                │
                          ▼                ▼
                   GitHub APIs      OpenRouter (default)
                   Webhooks         cohere/north-mini-code:free
                          │
                          ▼
                   Supabase Postgres + Auth + RLS
```

---

## 2. Separation of concerns

| Concern                          | Mechanism                                   |
| -------------------------------- | ------------------------------------------- |
| Who is the user?                 | Supabase Auth · GitHub OAuth                |
| Which repos can we read?         | GitHub App installation                     |
| Where is state?                  | Supabase Postgres + RLS                     |
| What changed?                    | Deterministic GitHub compare (SHA-pinned)   |
| Why did it change?               | Stage 3 Scope & Consistency Analysis engine |
| What should reviewer care about? | Decision Engine + AI findings               |

**Never** conflate user OAuth with App install tokens.

---

## 3. Frontend

| Item            | Choice                              |
| --------------- | ----------------------------------- |
| Framework       | Next.js App Router                  |
| UI              | Tailwind v4, shadcn/Base UI, Lucide |
| Primary surface | PR detail → `AnalysisPanel`         |

Pages: `/`, `/login`, `/dashboard/*` (overview, repositories, pull requests, settings).

Presentational components stay thin; loaders/APIs own data.

**Client vs server:** Client components must not import GitHub App / `fs` modules. Example: `classificationLabel` from `scope/classify-pr`, not the scope barrel that pulls Octokit.

---

## 4. Backend

All inside Next.js (no separate API service).

| Pattern         | Location                                         |
| --------------- | ------------------------------------------------ |
| Route handlers  | `src/app/api/github/*`, `src/app/api/analysis/*` |
| Services        | `src/services/*`                                 |
| Analysis engine | `src/lib/analysis/*`                             |
| Auth helpers    | `src/lib/auth/*`                                 |
| Middleware      | Session refresh; protect `/dashboard`            |

---

## 5. Supabase

| Client                 | Use                                          |
| ---------------------- | -------------------------------------------- |
| Browser / server user  | RLS-scoped reads                             |
| Service role (`admin`) | Webhooks, analysis writes, stale job healing |

Migrations (apply in order):

| File                                | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `001_initial_schema.sql`            | Core entities + RLS + tasks + analyses    |
| `002_stage1_github_integration.sql` | Connection status, webhook deliveries     |
| `003_stage2_analysis_pipeline.sql`  | Findings / changed files fields           |
| `004_stage2_5_hardening.sql`        | `duration_ms`, `complete_analysis_atomic` |

---

## 6. GitHub App

**Permissions:** Metadata, Contents, Pull requests (read).
**Events:** Installation, Installation repositories, Pull request.

Routes:

| Route                                 | Role                  |
| ------------------------------------- | --------------------- |
| `GET /api/github/install`             | Start install         |
| `GET /api/github/setup`               | Post-install callback |
| `POST /api/github/webhooks`           | HMAC-verified events  |
| `POST /api/github/sync`               | Recover installations |
| `POST /api/github/sync-pull-requests` | Import PRs            |

---

## 7. Analysis pipeline

```text
POST /api/analysis/start
  → authorize user owns repo
  → create analyses row (pending), pin head_sha
  → status running
  → verify SHA + compareCommits(base, head_sha)
      → Stage 3: scope extraction + consistency verification
  → build bounded AI context
  → AI provider → normalize → Zod
  → filter affectedFiles → calibrate confidence
  → deterministic merge decision (+ scope signals)
  → atomic persist (RPC) or sequential fallback
  → scope_score / scope_classification update
  → completed | failed
UI polls GET /api/analysis/:id (capped; stale jobs healed)
```

### Modules (`src/lib/analysis`)

| Module                            | Role                                            |
| --------------------------------- | ----------------------------------------------- |
| `collect-changes.ts`              | SHA-pinned GitHub compare                       |
| `scope/*`                         | Task extract, classify, match, creep, coverage  |
| `classify.ts`                     | Deterministic file categories                   |
| `filters.ts` / `build-context.ts` | Exclusions, redaction, budget                   |
| `ai/*`                            | Providers (OpenRouter default, Gemini optional) |
| `confidence.ts`                   | Calibration + reasons                           |
| `decision.ts`                     | Merge recommendation + trace                    |
| `evidence.ts`                     | Structured evidence for UI                      |
| `orchestrator.ts`                 | End-to-end run                                  |
| `log.ts`                          | Structured server logs                          |

### Persistence model

- Multiple `analyses` per PR (`analysis_version`)
- Pin `head_sha`
- Findings + changed files as children
- `deterministic_result.intentScope` stores the Stage 3 Scope & Consistency Analysis payload
- `overall_status` maps from merge decision enums

---

## 8. Data model (conceptual)

```text
users
  └── github_installations
        └── repositories
              └── pull_requests
                    ├── tasks
                    └── analyses
                          ├── analysis_changed_files
                          ├── analysis_findings
                          ├── risk_factors
                          └── analysis_events
webhook_deliveries
```

---

## 9. Folder structure

```text
src/
├── app/                 # UI + API routes
├── components/          # UI only
├── lib/
│   ├── analysis/        # Engine (Stages 2–3)
│   ├── auth/
│   ├── github/
│   └── supabase/
├── services/
├── types/
└── middleware.ts
supabase/migrations/
docs/
secrets/                 # local PEMs (gitignored)
```

---

## 10. Security notes

- Webhook HMAC (`X-Hub-Signature-256`)
- Install `state` integrity
- Service role + AI keys server-only
- Context redaction for secrets/JWT patterns
- RLS on user-visible rows

---

## 11. Known architectural debt

| Item            | Note                                                |
| --------------- | --------------------------------------------------- |
| Inline analysis | No queue; request can run up to ~300s               |
| Free models     | Rate limits; enum sloppiness mitigated by normalize |
| DB types        | Hand-maintained (`src/types/database.ts`)           |
| Stage 4+        | Policy engine / GitHub Checks not productized       |
| Middleware      | Next.js may rename convention to “proxy”            |

---

## 12. Related docs

- [`DECISION_ENGINE.md`](./DECISION_ENGINE.md)
- [`HANDOFF_STAGE3.md`](./HANDOFF_STAGE3.md)
- [`STAGE_3_REPORT.md`](./STAGE_3_REPORT.md)
