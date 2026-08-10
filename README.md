# Agent PR Firewall

**Scope, impact, and intent analysis for pull requests—especially those written by coding agents.**

Agent PR Firewall is a GitHub-native developer tool that answers a different question than a generic AI code reviewer:

> Did the agent (or author) do what was asked, and what else might this change affect?

It sits between autonomous coding agents and human merge trust: deterministic change facts first, then bounded AI judgment, then an explainable merge recommendation.

**Product version:** v0.3.0 (Stage 3 — Scope & Consistency Analysis)
**License:** Private / portfolio (see [License](#license))

---

## Why it exists

Coding agents can open PRs faster than humans can re-read them. Code can be green on tests and still:

- Edit files outside the stated task
- Touch auth, database, or config without calling it out
- Skip tests, docs, or rollback paths
- Look “fine” while increasing blast radius

Teams need a **scope + risk + intent** layer—not more style nits.

---

## Core workflow

```text
Sign in with GitHub
      → Install GitHub App on a repository
      → Import or ingest pull requests
      → Open PR detail → Analyze pull request
      → Review Decision Engine, Scope & Consistency Analysis, findings, evidence
      → Re-analyze when head SHA moves
```

Analysis is **manual** in v0.3.0 (no silent auto-merge or required status checks).

---

## Features

| Area                             | Capability                                                        |
| -------------------------------- | ----------------------------------------------------------------- |
| **GitHub**                       | App install, webhooks, PR import without a tunnel                 |
| **Analysis**                     | SHA-pinned diffs, file classification, bounded AI context         |
| **Findings**                     | Structured severity/category cards with evidence                  |
| **Decision Engine**              | Safe to merge · Review recommended · Block merge                  |
| **Scope & Consistency Analysis** | Task extraction, classification, creep, coverage, missing work    |
| **Trust UX**                     | Decision trace, confidence reasons, progress steps, notifications |
| **Cost**                         | Default free OpenRouter model (`cohere/north-mini-code:free`)     |

---

## Screenshots

> Place real captures under `docs/images/` when available.

| Surface                      | Placeholder                         |
| ---------------------------- | ----------------------------------- |
| Landing                      | `docs/images/landing.png`           |
| Dashboard                    | `docs/images/dashboard.png`         |
| PR analysis — decision       | `docs/images/analysis-decision.png` |
| PR analysis — intent & scope | `docs/images/analysis-intent.png`   |
| Findings                     | `docs/images/analysis-findings.png` |

---

## Architecture overview

```text
Next.js (App Router) modular monolith
  ├── Dashboard UI (AnalysisPanel)
  ├── API routes (/api/github/*, /api/analysis/*)
  ├── Services (installations, PRs, analyses)
  └── Analysis engine
        collect → scope & consistency → context → AI → calibrate → Decision Engine → persist

GitHub App (Octokit)     Supabase (Auth + Postgres + RLS)
OpenRouter free model    (optional Gemini free tier)
```

Deep dive: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Local setup

### Prerequisites

- Node.js 20+
- npm
- Supabase project
- GitHub account + ability to create a GitHub App
- OpenRouter account (free key)

### Install

```bash
git clone https://github.com/Fraol-D/Agent-PR-Firewall.git
cd Agent-PR-Firewall   # local folder may be named Agent-Firewal
npm install
cp .env.example .env.local
```

### Database

In the Supabase SQL editor, apply migrations **in order**:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_stage1_github_integration.sql`
3. `supabase/migrations/003_stage2_analysis_pipeline.sql`
4. `supabase/migrations/004_stage2_5_hardening.sql`

### Run

```bash
npm run dev
```

Open `http://localhost:3000` → sign in → connect a repo → import PRs → analyze.

---

## Environment variables

Copy from [`.env.example`](.env.example). Never commit `.env.local` or PEM keys.

| Variable                        | Required         | Purpose                                        |
| ------------------------------- | ---------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`           | Yes              | App origin (`http://localhost:3000` or tunnel) |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes              | Supabase project URL                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes              | Public anon key                                |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes (server)     | Webhooks + analysis writes                     |
| `GITHUB_APP_ID`                 | Yes              | GitHub App ID                                  |
| `GITHUB_APP_SLUG`               | Yes              | App slug for install URL                       |
| `GITHUB_APP_PRIVATE_KEY_PATH`   | Yes\*            | Path to App PEM (preferred)                    |
| `GITHUB_APP_PRIVATE_KEY`        | Alt              | Full PEM if not using path                     |
| `GITHUB_APP_WEBHOOK_SECRET`     | Yes              | HMAC for webhooks                              |
| `OPENROUTER_API_KEY`            | Yes for analysis | Server-only AI key                             |
| `OPENROUTER_MODEL`              | Optional         | Default `cohere/north-mini-code:free`          |
| `AI_PROVIDER`                   | Optional         | `openrouter` (default) or `gemini`             |

\* Prefer `secrets/github-app.pem` (gitignored).

---

## GitHub App setup

1. Create a GitHub App: [Developer settings → GitHub Apps](https://github.com/settings/apps).
2. Configure:

| Field              | Value                               |
| ------------------ | ----------------------------------- |
| Homepage URL       | `{APP_URL}`                         |
| Setup URL          | `{APP_URL}/api/github/setup`        |
| Webhook URL        | `{APP_URL}/api/github/webhooks`     |
| Webhook secret     | Same as `GITHUB_APP_WEBHOOK_SECRET` |
| Redirect on update | Enabled                             |

3. **Permissions (repo):** Metadata read, Contents read, Pull requests read.
4. **Events:** Installation, Installation repositories, Pull request.
5. Install the app on a test repository from the product **Repositories** page.

**User sign-in** uses Supabase GitHub OAuth (identity only)—not a user PAT for repo access.

**Local webhooks:** GitHub cannot reach `localhost`. Use ngrok/cloudflared **or** dashboard **Import PRs**.

---

## OpenRouter setup

1. Create a key: https://openrouter.ai/keys
2. Set `OPENROUTER_API_KEY` in `.env.local`.
3. Keep `OPENROUTER_MODEL=cohere/north-mini-code:free` for $0 development.
4. Optional: `AI_PROVIDER=gemini` + `GEMINI_API_KEY` (not default).

---

## Development workflow

```bash
npm run dev      # local server
npm run lint     # ESLint
npm run build    # production build
```

Conventions:

- Business logic in `src/services/` and `src/lib/`; thin routes
- Deterministic analysis before LLM
- No secrets in git (`secrets/`, `.env*`, `*.pem`)
- Feature work on short-lived branches; keep `main` product-ready

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) and [`docs/TESTING.md`](docs/TESTING.md).

---

## Documentation map

| Doc                                                  | Contents                     |
| ---------------------------------------------------- | ---------------------------- |
| [`docs/PRD.md`](docs/PRD.md)                         | Product requirements         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)       | System design                |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)                 | Stages 0–6                   |
| [`docs/DECISION_ENGINE.md`](docs/DECISION_ENGINE.md) | Merge recommendation rules   |
| [`docs/TESTING.md`](docs/TESTING.md)                 | PR test scenarios            |
| [`docs/HANDOFF_STAGE3.md`](docs/HANDOFF_STAGE3.md)   | Engineering handoff          |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)       | How to contribute            |
| [`docs/STAGE_3_REPORT.md`](docs/STAGE_3_REPORT.md)   | Stage 3 implementation notes |

---

## Roadmap (summary)

| Stage                            | Status        |
| -------------------------------- | ------------- |
| 0 Foundation                     | Done          |
| 1 GitHub integration             | Done          |
| 2 PR analysis pipeline           | Done          |
| 2.5 Hardening                    | Done          |
| 2.6 UX & trust                   | Done          |
| 3 Scope & Consistency Analysis   | Done (v0.3.0) |
| 4 Decision engine productization | Next          |
| 5 Agent feedback loop            | Planned       |
| 6 Portfolio polish               | Planned       |

Details: [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## License

Private / portfolio project unless otherwise stated by the repository owner.
Not an official GitHub or OpenRouter product.
