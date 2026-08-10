# Veris — Engineering Handoff (Post–Stage 4)

**Document type:** Full development handoff for a new chat / new engineer  
**Audience:** Anyone continuing product development with **zero prior context**  
**Handoff date:** 2026-08-10  
**Product version:** **v0.4.0** (Stage 4 complete: decision engine + import-graph impact)  
**Status:** Stage 4 complete on `main`; next work = Stage 5 (feedback loop + further decision calibration)  

---

## Verified Stage 4 completion (pin this)

### Product version

| Field | Value |
| --- | --- |
| **Version** | **v0.4.0** |
| **Meaning** | Stages 0–4 shipped: GitHub integration, analysis pipeline, intent/scope, explainable final decisions, import-graph blast radius, dual-env GitHub App auth |

> Note: `package.json` may still show `0.1.0` — **v0.4.0** is the **product/stage version** recorded in this handoff until package metadata is bumped.

### Exact Git pin (Stage 4 feature complete)

| Field | Value |
| --- | --- |
| **Git commit (full)** | **`e42ba260e4bfc57ebf489554d1039705f0445ec0`** |
| **Git commit (short)** | **`e42ba26`** |
| **Branch** | `main` / `origin/main` |
| **Subject** | `Add import-graph impact analysis and dual-env GitHub App key loading.` |
| **Author date** | 2026-08-10 08:30:23 +0300 |
| **What this commit closes** | Import-graph impact, HIGH-impact escalation (later refined), dual-env PEM loading, migration `005` file in repo |
| **Prerequisite (decision engine core)** | `2018084` — `Implement Stage 4 decision engine with explainable final decisions.` |
| **Git tag** | *None* — treat **`e42ba260e4bfc57ebf489554d1039705f0445ec0`** as the Stage 4 pin. Suggested future tag: `v0.4.0` or `stage-4` on that commit (or on a later docs/calibration descendant). |

### Deployment status

| Environment | Status |
| --- | --- |
| **`origin/main`** | Contains Stage 4 pin `e42ba26` and any later handoff/calibration commits listed in **Latest published tip** below |
| **Vercel production** | Wired to deploy from **`main`**. Production was running Stage 4 after `e42ba26` was pushed (GitHub App auth + analyze worked in prod earlier). **Confirm live SHA in the Vercel dashboard** (Deployment → commit) after each push; auto-deploy may lag or fail independently of git |
| **Local** | `npm run dev` with `GITHUB_APP_PRIVATE_KEY_PATH` (or env PEM) — Analyze PR verified working after dual-env key fix |

### Database migration status

| Migration | Status |
| --- | --- |
| `001`–`004` | Applied (project in active use) |
| **`005_stage4_atomic_decision.sql`** | **Applied successfully** on the owner’s Supabase project (after drop-first fix for non-unique function overload) |
| Effect of 005 | Single `complete_analysis_atomic` overload writes `final_decision`, risk/scope/impact scores, and `affected_areas` in the same transaction as findings |

### Latest published tip (this handoff revision)

| Field | Value |
| --- | --- |
| **Handoff content + calibration commit** | **`621c6e7211c879a03d4a07c671f0a9e27a082538`** (`621c6e7`) — handoff body, decision softening, chime |
| **Latest `main` tip (hash stamp)** | **`f1489750c691305f61922b582ceceddc1d40ad4c`** (`f148975`) — records tip hashes in this document |
| **Subject (621c6e7)** | `Document Stage 4 handoff (v0.4.0) and soften over-aggressive BLOCK decisions.` |
| **Includes beyond Stage 4 pin (`e42ba26`)** | Decision softening / block safety net, clearer completion chime, this handoff document (v0.4.0 metadata) |
| **Relationship** | `e42ba26` → `621c6e7` → `f148975` (all on `main`) |

**How to verify the Stage 4 pin is in history:**

```bash
git fetch origin
git merge-base --is-ancestor e42ba260e4bfc57ebf489554d1039705f0445ec0 origin/main && echo "Stage 4 pin present on origin/main"
git rev-parse origin/main
```

---

## What changed since Stage 3 (highest impact)

Stage 3 delivered intent/scope (task extract, classification, creep, coverage, Intent UI). **Since then (→ v0.4.0 / Stage 4):**

1. **Final decision engine** — `LOW` \| `REVIEW_RECOMMENDED` \| `REVIEW_REQUIRED` \| `BLOCKED` from risk × scope rule table (`decision-engine/`).  
2. **Structured decision reasons** — plain-language list tied to risk factors, scope, impact, and policy rules; shown as **Decision explanation** in the UI.  
3. **Deterministic risk scoring** — `computeRiskFromFindings` → `risk_score` / `risk_classification` + `risk_factors` persistence (not only AI overall status).  
4. **Import-graph blast radius** — real reverse dependency graph from repo sources at pinned SHA; replaces sensitivity-tag-only “impact.”  
5. **Impact as third decision input** — HIGH blast radius escalates one level (refined so impact alone cannot invent BLOCKED).  
6. **Atomic completion RPC v2 (migration 005)** — `final_decision`, scores, and `affected_areas` committed with findings.  
7. **Dual-env GitHub App PEM loading** — path file (local) + multiline/escaped env (Vercel) via shared normalizer.  
8. **UX/reliability** — analysis poll caps, stale job healing, dark-mode decision contrast, clearer completion chime.  
9. **Decision calibration pass** — discount noisy medium infra findings; BLOCK safety net requires critical-class risk; softer matrix for medium stacks.  
10. **Handoff for Veris** — this document as the zero-context Stage 4 → 5 bridge.

---

## 0. Name mapping (read this first)

| Context | Name |
| --- | --- |
| **Product / brand direction (this handoff)** | **Veris** |
| **Current codebase / package / GitHub repo** | **Agent PR Firewall** (`agent-pr-firewall`, `Fraol-D/Agent-PR-Firewall`) |
| **UI `siteConfig.name` today** | `Agent PR Firewall` (`src/config/site.ts`) |
| **Local folder (author machine)** | `C:\Users\fraol\Desktop\Agent-Firewal` (note spelling: Firewal) |

Until an explicit rename PR lands, code, commits, and public repo still say **Agent PR Firewall**. Treat **Veris** as the product identity and positioning for planning, docs direction, and future branding work.

**Repo:** https://github.com/Fraol-D/Agent-PR-Firewall  

**Primary requirements source:** `REQUIREMENTS.md` (local; often gitignored — keep a copy for new threads).  

**Supporting docs:** `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISION_ENGINE.md`, `docs/TESTING.md`, `docs/STAGE_3_REPORT.md`, `docs/HANDOFF_STAGE3.md`.

---

## 1. Current project overview and positioning

**Veris** is a **GitHub-native trust layer for pull requests**, especially those written or heavily influenced by **autonomous coding agents**.

It answers a different question than a generic AI code reviewer:

> **Did the agent (or author) do what was asked, and what else might this change affect?**

The product sits between **agent output** and **human merge trust**:

1. Deterministic facts first (diffs, file classes, intent/scope, import graph).  
2. Bounded free-tier LLM for structured findings only.  
3. Explainable **final decision** with reasons (not silent auto-merge).

### Core user journey

```text
Sign in (GitHub OAuth via Supabase)
  → Install GitHub App on a repository
  → Import or ingest PRs
  → Open PR detail → Analyze pull request
  → Review Decision, Decision explanation, Intent & Scope, findings, blast radius
  → Re-analyze when head SHA moves
```

Analysis is **manual** in the current product (button-driven). No GitHub Check enforcement or auto-block yet.

---

## 2. Product philosophy

### What Veris optimizes for

| Principle | Meaning |
| --- | --- |
| **Intent over style** | Task match and scope creep matter more than lint nits |
| **Deterministic before LLM** | Graph, scores, and rules are reproducible; AI explains, doesn’t own truth |
| **Explainability** | Every decision has plain-language reasons tied to risk factors / areas |
| **Human in the loop** | Decisions are advisory until Stage 5+ deliberately productizes gates |
| **$0 AI path** | Default OpenRouter free model for development/demo |
| **Modular monolith** | One Next.js app; no premature microservices |

### What Veris is explicitly **not**

- Not a general “AI code review SaaS” focused on style/quality theater  
- Not a coding agent that writes application code  
- Not a full SIEM / enterprise compliance platform  
- Not an automatic merge bot (no silent approve/block/merge on GitHub yet)  
- Not dependent on paid AI for baseline operation  
- Not a perfect semantic program analyzer (import graph is file-level, incomplete by design when truncated)

---

## 3. Architecture and technology stack

### High-level

```text
┌────────────────────────────────────────────────────────────┐
│                 Next.js modular monolith                     │
│  App Router · React 19 · Tailwind v4 · shadcn/Base UI        │
│                                                              │
│  Dashboard UI  →  Services  →  Analysis engine               │
│  API routes    →  GitHub App (Octokit)                       │
│                →  Supabase (Auth + Postgres + RLS)           │
│                →  OpenRouter free model (optional Gemini)    │
└────────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Choice |
| --- | --- |
| App | Next.js App Router (v16.x in package.json) |
| Language | TypeScript (strict) |
| Auth | Supabase Auth + GitHub OAuth (identity only) |
| Repo access | **GitHub App** install (not user PAT) |
| DB | Supabase Postgres + RLS; service role for webhooks/analysis writes |
| AI | OpenRouter `cohere/north-mini-code:free` default; `AI_PROVIDER=gemini` optional |
| Hosting | Vercel (production) + local `npm run dev` |

### Critical identity split

| Question | Mechanism |
| --- | --- |
| Who is signed in? | Supabase GitHub OAuth |
| Which repos can we read? | GitHub App installation + installation Octokit |

### Analysis pipeline (end-to-end, current)

```text
POST /api/analysis/start
  → authz: user owns connected repo
  → create analyses row (pending), pin head_sha
  → status running
  → collectPullRequestChanges: getCommit + compareCommits(base, head_sha)
  → Stage 3: intent/scope (title, body, commits, issues, classify, creep, coverage)
  → build bounded AI context (redact/exclude secrets, caps)
  → AI provider → normalize → Zod → filter affectedFiles → calibrate confidence
  → Stage 2 risk: computeRiskFromFindings (deterministic scores/factors)
  → Impact: fetch tree+blobs @ head_sha → reverse import graph → blast radius
  → Stage 4: computeFinalDecision(risk × scope, then HIGH-impact escalate)
  → persist atomically via complete_analysis_atomic (migration 005) or sequential fallback
  → UI polls GET /api/analysis/:id (capped; stale jobs healed ~6 min)
```

### Important modules

| Path | Role |
| --- | --- |
| `src/services/analyses.ts` | Start/execute/persist/load analysis |
| `src/lib/analysis/orchestrator.ts` | Pipeline orchestration |
| `src/lib/analysis/collect-changes.ts` | SHA-pinned PR file collection |
| `src/lib/analysis/scope/*` | Intent extraction & scope verification |
| `src/lib/analysis/risk/index.ts` | Deterministic risk score/classification/factors |
| `src/lib/analysis/impact/*` | Import graph + blast radius |
| `src/lib/analysis/decision-engine/*` | Final decision + reasons + thresholds |
| `src/lib/analysis/decision.ts` | Legacy Stage 2.6 merge UX decision (still used for overall_status mapping / traces) |
| `src/lib/analysis/ai/*` | OpenRouter / Gemini providers |
| `src/lib/github/config.ts` | App env + **PEM normalization** (local path + Vercel) |
| `src/lib/github/app-auth.ts` | Octokit App / installation clients |
| `src/components/dashboard/analysis-panel.tsx` | Primary analysis UX |
| `supabase/migrations/001`–`005` | Schema + RPCs |

### Folder layout (abbrev.)

```text
src/app/                 # UI + API routes
src/components/          # UI only
src/lib/analysis/        # Engine (stages 2–4)
src/lib/github/          # App auth, webhooks helpers
src/lib/supabase/       # clients
src/services/            # domain workflows
supabase/migrations/
docs/
secrets/                 # local PEM only (gitignored)
```

### Client vs server rule (hard)

**Never** import GitHub App / `fs` / analysis server fetch modules into client components.

- Bad: `import … from "@/lib/analysis/scope"` (barrel can pull Octokit)  
- Good: `classificationLabel` from `@/lib/analysis/scope/classify-pr`  
- Client may type-import pure types; analysis runs only on server

---

## 4. Development progress through Stage 4

| Stage | Name | Status | Notes |
| --- | --- | --- | --- |
| **0** | Foundation | Done | Next.js, design system, Supabase auth/schema, dashboard shell |
| **1** | GitHub integration | Done | App install, webhooks, PR import, list/detail |
| **2** | PR analysis pipeline | Done | Collect/classify/AI/findings UI; free OpenRouter |
| **2.5** | Hardening | Done | SHA pin, confidence calibration, duration, logs, atomic RPC v1 (`004`) |
| **2.6** | UX & trust | Done | Decision card UX, traces, structured evidence, progress, notifications, dark contrast |
| **3** | Intent & scope | Done | Task extract, classification, match/creep/coverage, Intent UI |
| **4** | Decision engine + real impact | Done | Final decision enum, rule table, reasons, import-graph impact, migration `005` |
| **5** | Agent feedback loop | Not started | Comments/checks, re-analyze loop |
| **6** | Portfolio polish | Not started | Demo narrative, screenshots, branding (Veris rename) |

### Milestone commits on `main` (recent, representative)

| Commit | Summary |
| --- | --- |
| **`e42ba260e4bfc57ebf489554d1039705f0445ec0`** (`e42ba26`) | **Verified Stage 4 completion** — import-graph impact + dual-env PEM + migration 005 |
| `2018084` | Stage 4 decision engine core (final_decision, reasons, risk scores) |
| `df614de` | Dark mode contrast / surfaces |

(`main` also contains earlier Stage 1–3 history and various debug/demo commits.)

---

## 5. Import Graph Impact Analysis (detail)

### Problem it solved

Stage 2 claimed “basic dependency analysis,” but `src/lib/analysis/impact/` was a **stub**. Affected areas were derived from **file category / sensitivity tags + scope creep**, not from who imports whom. Decision “impact” could not independently escalate a clean risk×scope result based on real blast radius.

### What data Stage 1 already had

- Changed files for the PR via `compareCommits(base, head_sha)`  
- Patches / path / status / line counts  

### What must be fetched fresh

At analysis **head_sha**:

1. Recursive git tree  
2. Blob contents for TS/JS/TSX/JSX (capped)  

### Implementation layout

| File | Responsibility |
| --- | --- |
| `impact/parse-imports.ts` | Extract `import` / `export from` / `require` / dynamic `import()`; resolve `./`, `../`, `@/` → `src/` |
| `impact/import-graph.ts` | Reverse graph (target → importers); BFS dependents depth ≤ 3; Next route heuristics |
| `impact/fetch-sources.ts` | Tree + blob fetch budgets (~220 files, size/total byte caps, priority for changed paths) |
| `impact/index.ts` | `analyzeImpact()` → classification, confidence, per-file dependents, **affectedAreas** drafts |

### Per changed file, the engine computes

- **Direct dependents** — files that import it  
- **Indirect dependents** — transitive, depth capped at 3  
- **Dependency count** — unique reverse dependents  
- **Affected routes** — paths matching App Router / Pages conventions (`page.tsx`, `route.ts`, etc.)

### Impact classification

| Band | Typical triggers |
| --- | --- |
| **HIGH** | ≥8 direct **or** ≥15 total dependents **or** ≥4 route-like files |
| **MEDIUM** | ≥3 direct **or** ≥5 total **or** ≥2 routes |
| **LOW** | Otherwise |
| **UNKNOWN** | Graph fetch failed soft-fail |

**Confidence** is heuristic (~0.2–0.92) from parse coverage / truncation / errors — never “perfect semantics.”

### Affected areas (§21.7) — graph-backed

Rows use impact types such as:

- `blast_radius_summary`  
- `changed`  
- `direct_dependent`  
- `indirect_dependent`  
- `affected_route`  

Legacy category-only builder in `decision-engine/affected-areas.ts` remains as **fallback** if graph rows are empty.

### Soft-fail behavior

If tree/blob fetch fails, analysis **continues** with degraded impact (`UNKNOWN` / low confidence) rather than failing the whole analysis.

### Demo script

```bash
node scripts/impact-sample.mjs
```

Shows a shared `session.ts`-like module with many importers → HIGH impact → decision escalation.

---

## 6. Stage 4 decision wiring (detail)

### Outputs (§8.8 / schema)

| Code | Meaning |
| --- | --- |
| `LOW` | Low risk, within scope, no high blast radius escalation |
| `REVIEW_RECOMMENDED` | Soft review |
| `REVIEW_REQUIRED` | Significant risk or scope issues |
| `BLOCKED` | Critical / severe combinations |

Stored on `analyses.final_decision`. UI shows code + label + **Decision explanation**.

### Inputs

1. **Risk** (`computeRiskFromFindings`) — findings severities + sensitive-area bonuses → `risk_score` 0–100, `LOW|MEDIUM|HIGH|CRITICAL`, factors  
2. **Scope** (Stage 3) — `scope_score`, `HIGH_COMPLIANCE|PARTIAL|LOW_COMPLIANCE|UNKNOWN`, creep flags  
3. **Impact** (import graph) — `impactClassification` + explanation + confidence  

### Rule table (not a full 3D matrix)

File: `src/lib/analysis/decision-engine/thresholds.ts` — `DEFAULT_DECISION_RULES`.

Examples:

- Risk `CRITICAL` × any scope → `BLOCKED`  
- Risk `HIGH` × `LOW_COMPLIANCE` → `BLOCKED`  
- Risk `LOW` × `HIGH_COMPLIANCE` → `LOW`  
- Many medium combinations → `REVIEW_RECOMMENDED` / `REVIEW_REQUIRED`

### Escalations after the matrix

1. **Scope creep** + medium+ risk can lift `REVIEW_RECOMMENDED` → `REVIEW_REQUIRED`.  
2. **Impact HIGH** escalates **one level** (independent third input):

```text
LOW → REVIEW_RECOMMENDED
REVIEW_RECOMMENDED → REVIEW_REQUIRED
REVIEW_REQUIRED → BLOCKED
BLOCKED → BLOCKED
```

So impact **can change a decision alone** (e.g. low risk + high compliance + widely imported file → review recommended).

### Reasons

Structured list (`DecisionReason`) with `source`:

`policy` | `risk_factor` | `scope` | `impact` | `affected_area`

Persisted inside `context_stats.decisionEngine` (and recomputed on load for display consistency).

### Legacy Stage 2.6 merge decision

`computeMergeDecision` still runs for docs-only summary tweaks and decision **trace** chips.  
`overall_status` is mapped from **final** Stage 4 decision for storage/UI compatibility:

- `LOW` → `no_significant_concerns`  
- `REVIEW_*` → `review_recommended`  
- `BLOCKED` → `high_risk_concerns`  

---

## 7. Atomic migration (detail)

### Problem

After Stage 4 first land, `final_decision`, scope/risk scores, and `affected_areas` were often written in a **follow-up update** after `complete_analysis_atomic`, risking partial completes.

### Solution — migration `005_stage4_atomic_decision.sql`

Extends `complete_analysis_atomic` to accept:

- `p_risk_score`  
- `p_scope_score`  
- `p_scope_classification`  
- `p_impact_classification`  
- `p_final_decision`  
- `p_affected_areas` (jsonb array)  

and write them **in the same transaction** as findings, risk_factors, and changed_files.

### Bug when applying 005 (resolved)

**Error:** `function name "public.complete_analysis_atomic" is not unique` (42725).

**Cause:** Postgres `CREATE OR REPLACE` **cannot change argument lists** — adding params created a second overload; bare `REVOKE/GRANT` was ambiguous.

**Fix:** Migration now **drops both** old (20-arg) and new (26-arg) signatures by full type list, then `CREATE`s one function, then `GRANT` with full signature.

**User status:** Migration reported **successful** on their Supabase project after the drop-first fix.

### Fallback

If RPC is missing/old signature, `services/analyses.ts` falls back to sequential multi-step persistence (same as before).

---

## 8. Implementation details that matter for future work

### GitHub App private key (local + Vercel)

File: `src/lib/github/config.ts`

| Environment | How key is loaded |
| --- | --- |
| **Local** | Prefer `GITHUB_APP_PRIVATE_KEY_PATH=secrets/github-app.pem` |
| **Vercel** | `GITHUB_APP_PRIVATE_KEY` with escaped `\n` |
| **Both** | Same `normalizePrivateKeyPem()` + PEM header validation |

Diagnostics (server logs only, **never log key body**):

- detected, source (`path`|`env`), lengths, escaped newlines converted, PEM validation  

**Regression that was fixed:** Vercel-only env loading removed path support → local Analyze failed until path+normalize restored.

### Analysis only sees GitHub

Analyze PR uses **remote** compare/tree at the PR **head_sha**. Uncommitted local files are invisible. Re-analyze after push to evaluate new code.

### Stale jobs / polling

- In-flight `pending`/`running` older than ~6 minutes → marked failed  
- Client poll capped (~3–5 min) to avoid infinite `GET /api/analysis/:id`  
- Don’t reuse stale in-flight rows on start  

### Free AI model

Default: `OPENROUTER_MODEL=cohere/north-mini-code:free`  
Findings quality varies; enums normalized before Zod. **Do not** require paid models for core path.

### Security / secrets

- Never commit `.env.local`, `secrets/*.pem`  
- Service role + AI keys server-only  
- Context filters exclude `.env`, lockfiles, binaries, oversized patches  

### Client bundle

Importing analysis barrels that pull Octokit/`fs` into client components breaks the app (`Can't resolve 'fs'`). Keep server boundaries.

### Migrations order

1. `001_initial_schema.sql`  
2. `002_stage1_github_integration.sql`  
3. `003_stage2_analysis_pipeline.sql`  
4. `004_stage2_5_hardening.sql`  
5. `005_stage4_atomic_decision.sql`  

### Env essentials

See `.env.example`: Supabase trio, `GITHUB_APP_*`, PEM path or key, `OPENROUTER_API_KEY`, `NEXT_PUBLIC_APP_URL`.

---

## 9. Important engineering decisions and tradeoffs

| Decision | Tradeoff |
| --- | --- |
| Inline analysis in request (`maxDuration` ~300s) | Simple deploy; long PRs + graph fetch stress timeouts; no worker queue yet |
| Cap import-graph scan (~220 files) | Fits serverless time; incomplete graph on large monorepos |
| Relative + `@/` imports only | Covers Next app; no full tsconfig path mapping / monorepo packages |
| File-level graph only | No call-graph / symbol precision |
| Free LLM + normalize | Cheap demo; flaky enums/severity wording |
| Advisory decisions | Safe product posture; not a real merge gate until Stage 5 deliberate design |
| Keep Agent PR Firewall code name | Avoids churn; Veris rename is product/docs stage work |
| Rule table in code | Tunable without UI; not multi-tenant policy yet |

---

## 10. Bugs encountered around Stage 4 (and resolutions)

| Issue | Resolution |
| --- | --- |
| Infinite analysis polling on stuck `pending`/`running` | Stale fail (~6 min) + client poll cap |
| Client `fs` / GitHub config import via scope barrel | Import client-safe modules only (`classify-pr`, etc.) |
| Decision card dark-mode contrast (black on green) | Semantic emerald/amber/red text pairs + token fixes |
| `geistMono is not defined` in layout | Typo variable rename (`gesitew` → `geistMono`) |
| Migration 005 `function is not unique` | Drop old+new signatures by arg types before create |
| Local Analyze broken after Vercel PEM fix | Restore `GITHUB_APP_PRIVATE_KEY_PATH` + shared normalize |
| Impact was sensitivity-only | Real reverse import graph + HIGH escalation |
| Non-atomic final_decision write | Migration 005 folds fields into RPC |

### Analysis false-positive context (not a “bug,” product behavior)

Example risk factors on a large/integration PR:

- Medium security: `scripts/check-github-key.mjs` “may handle secrets”  
- Medium database: Stage 1 migration SQL  
- Medium API: GitHub install route  

These can push **BLOCK** / heavy review even when intentional. Future tuning: lower weight for expected infrastructure files, path allowlists, or require high+ only for block. **Do not** treat this as “local uncommitted code is unsafe.”

---

## 11. Current repository status

| Item | Value |
| --- | --- |
| **Branch** | `main` tracking `origin/main` |
| **Stage 4 feature pin** | `e42ba260e4bfc57ebf489554d1039705f0445ec0` (`e42ba26`) |
| **Handoff / calibration tip** | `621c6e7211c879a03d4a07c671f0a9e27a082538` (`621c6e7`) |
| **Start new threads from** | `f1489750c691305f61922b582ceceddc1d40ad4c` (`f148975`) **or later** on `main` |
| **Working tree** | Clean after handoff publish push (verify with `git status`) |
| **Other branches** | `test/*` evaluation branches; `stage/*` historical; `demo/video-recording` |
| **Deploy** | Vercel production used for App auth; redeploy after each `main` push |

### Commits to know

- **Verified Stage 4 completion (pin):** `e42ba260e4bfc57ebf489554d1039705f0445ec0`  
- Stage 4 decision engine core: `2018084`  
- Impact graph + PEM dual-env + migration file: same as pin (`e42ba26`)  

---

## 12. Verification status (what has been tested)

| Area | Status |
| --- | --- |
| Local `npm run dev` + GitHub path PEM + Analyze | Worked after PEM path restore |
| Vercel GitHub App auth with escaped PEM | Worked (motivation for dual-env loader) |
| Supabase migrations including fixed 005 | Applied successfully by owner |
| Typecheck (`tsc`) on Stage 4 / impact changes | Passed during development |
| Manual PR analyze end-to-end | Multiple successful runs; decisions + findings UI shown |
| Import-graph sample script | `scripts/impact-sample.mjs` demonstrates HIGH escalation |
| Infinite poll regression | Fixed earlier; re-verify if it reappears |
| Full automated e2e suite | **Not** present — manual scenarios in `docs/TESTING.md` |
| Systematic matrix of all decision rules in prod | Partial — sample + manual PRs only |

**How a new engineer should smoke-test:**

1. `npm install`, fill `.env.local`, `GITHUB_APP_PRIVATE_KEY_PATH=secrets/….pem`  
2. Confirm migrations 001–005 on Supabase  
3. `npm run dev` → connect repo → import PR → Analyze  
4. Confirm `final_decision`, risk/scope/impact lines, decision explanation, affected_areas rows  
5. Server log: `[github-app] private-key diagnostics` with `pemValidationPassed: true`  

---

## 13. Known limitations

- No job queue; analysis is request-inline  
- Import graph incomplete on large repos (cap/truncation)  
- No monorepo package boundary resolution  
- No path-alias resolution beyond `@/` → `src/`  
- Free model finding quality / over-flagging of intentional infra files  
- Decisions do not post to GitHub Checks or block merges  
- Stage 2.6 “Safe to merge” UX labels coexist with Stage 4 enum codes — keep both coherent  
- `REQUIREMENTS.md` may be gitignored; share out-of-band  
- Product name still Agent PR Firewall in UI  
- Windows path folder typo `Agent-Firewal`  
- ngrok / Defender issues for local webhooks — Import PRs is the offline path  
- Temporary PEM diagnostic logging should be reduced later (keep errors, drop noisy info if desired)  

---

## 14. Documentation status

| Doc | State |
| --- | --- |
| `README.md` | Open-source style setup (product still named Agent PR Firewall) |
| `docs/PRD.md` | Through Stage 3-ish feature set — **should refresh for Stage 4 + impact** |
| `docs/ARCHITECTURE.md` | Strong base — **should add impact graph + decision engine v4** |
| `docs/ROADMAP.md` | Needs Stage 4 marked done and next stages clarified |
| `docs/DECISION_ENGINE.md` | Stage 4 rules — **update for HIGH-impact escalation + graph** |
| `docs/TESTING.md` | Five PR scenarios — still valid; add impact re-analyze notes |
| `docs/HANDOFF_STAGE2.md` / `HANDOFF_STAGE3.md` | Historical |
| **`docs/HANDOFF_STAGE4.md`** | **This document — canonical post-Stage 4 handoff** |
| `REQUIREMENTS.md` | Original SoT (local) |

**Docs debt:** Align naming (Veris), mark Stage 4 complete, document import graph and migration 005 in ARCHITECTURE / DECISION_ENGINE / ROADMAP.

---

## 15. Recommended next stage

### Immediate recommendation: **Stage 5 — Agent feedback loop + decision calibration** (per REQUIREMENTS + product feedback)

**Objective:** Close the loop between analysis and the agent/author, and keep refining decision quality so critical issues stay loud while noise stays in review.

**Scope candidates (in order):**

1. Generate structured feedback text from final decision + top reasons (no LLM required)  
2. Post as PR comment via GitHub App (new permission: Pull requests **write** or issues write)  
3. Optional Check Run (report only first; no hard block until product sign-off)  
4. Continue **decision calibration** (allowlists, severity floors, per-path policy) using real PR samples  
5. Re-analyze on `synchronize` webhook when head moves (optional auto or banner-only)  
6. Record feedback events in `analysis_events`  
7. Human override recording (approve / keep blocked) only if scoped with audit trail  

**Already started (pre–Stage 5):** risk discount for expected infra paths, BLOCK safety net, softer matrix — iterate with production PR samples.

**Still out of Stage 5 unless scoped explicitly:** multi-tenant policy UI, paid-only models, full rewrite, silent auto-merge.

### Alternative / parallel

- **Veris rename** in UI + README (`siteConfig`)  
- **Docs refresh** (ARCHITECTURE / DECISION_ENGINE / ROADMAP for Stage 4 + impact)

---

## 16. Prioritized roadmap (next 2–3 stages)

### Stage 5 — Agent feedback loop (next)

| Priority | Work |
| --- | --- |
| P0 | Feedback payload builder from decision + reasons (no LLM required) |
| P0 | GitHub comment poster with App permissions + install token |
| P1 | Check Run “Veris / Agent PR Firewall” status  
| P1 | Event logging (`feedback_posted`) |
| P2 | Auto re-queue analysis on PR synchronize |
| P2 | Human override recording (approve / keep blocked) — UI carefully |

### Stage 6 — Portfolio & product polish

| Priority | Work |
| --- | --- |
| P0 | Branding: **Veris** name, landing copy, favicon |
| P0 | Screenshots + demo script of analyze → decision → explanation |
| P1 | Sample fixture analyses for empty-state demos |
| P1 | Reduce PEM debug noise; polish settings readiness |
| P2 | Deploy runbook (Vercel env checklist) |

### Stage 7+ (or late Stage 5) — Policy & reliability

| Priority | Work |
| --- | --- |
| P0 | Background job queue for analysis (exit inline-only) |
| P1 | Per-repo policy overrides (still simple config, not full DSL UI) |
| P1 | Deeper impact (optional: tsconfig paths, package boundaries) |
| P2 | Org multi-seat workspaces |

---

## 17. What a new ChatGPT / Grok thread needs to contribute effectively

### Bootstrap prompt (pasteable)

```text
Continue Veris (repo: Agent-PR-Firewall / local Agent-Firewal).
Read docs/HANDOFF_STAGE4.md first, then REQUIREMENTS.md (if present), docs/ROADMAP.md, docs/ARCHITECTURE.md.
Current tip should be main at or after f1489750c691305f61922b582ceceddc1d40ad4c (short f148975), which includes handoff 621c6e7 and Stage 4 pin e42ba26. Stages 0–4 are done; implement Stage 5 next.
Do not start Stage 5 agent feedback until planned; respect $0 AI budget and no silent auto-merge.
Analysis only sees GitHub-pushed PR SHAs, not uncommitted local files.
```

### Commands

```bash
cd <repo>
npm install
# .env.local: Supabase + GitHub App + OPENROUTER_API_KEY
# GITHUB_APP_PRIVATE_KEY_PATH=secrets/github-app.pem  (local)
npm run dev
npm run lint
npm run build
```

### Non-negotiables for the next agent

1. Read this handoff before coding.  
2. Prefer deterministic analysis before LLM.  
3. Keep server/client boundaries (no `fs`/Octokit in client).  
4. Never commit secrets or PEM files.  
5. Don’t implement auto-merge/block without explicit Stage design.  
6. When changing decision rules, update `DEFAULT_DECISION_RULES` and docs.  
7. After analysis/persistence changes, confirm migration 005 behavior.  
8. Re-analyze PRs after pushes when validating behavior.  

### Key file entry points for next work

| Goal | Start here |
| --- | --- |
| Feedback comments | New `services/` + GitHub permissions + webhook optional |
| Decision tuning | `decision-engine/thresholds.ts`, `risk/index.ts` |
| Impact tuning | `impact/index.ts` thresholds, `fetch-sources.ts` budgets |
| UI analysis | `analysis-panel.tsx`, PR detail page |
| Auth/App | `lib/github/config.ts`, `app-auth.ts` |

### Sample impact escalation (mental model)

```text
Risk LOW + Scope HIGH_COMPLIANCE + Impact LOW  → LOW
Risk LOW + Scope HIGH_COMPLIANCE + Impact HIGH → REVIEW_RECOMMENDED  (+high-impact-escalation)
```

---

## 18. Environment checklist (local + Vercel)

| Variable | Local | Vercel |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Production URL |
| Supabase URL/anon/service | Yes | Yes |
| `GITHUB_APP_ID` / `SLUG` / webhook secret | Yes | Yes |
| `GITHUB_APP_PRIVATE_KEY_PATH` | **Preferred** | Usually unset |
| `GITHUB_APP_PRIVATE_KEY` | Optional multiline | **Escaped `\n` PEM** |
| `OPENROUTER_API_KEY` | Yes for analyze | Yes for analyze |

---

## 19. Explicit non-goals for the immediate next session

Unless the user re-scopes:

- Full policy admin UI / multi-tenant orgs  
- Paid-model-only path  
- Silent auto-merge  
- Microservice split  
- Complete monorepo / multi-language dependency resolution  

---

## 20. Handoff complete

**Stage 4 is complete on `main` (product v0.4.0).**  

| Pin | Hash |
| --- | --- |
| **Stage 4 feature complete** | `e42ba260e4bfc57ebf489554d1039705f0445ec0` (`e42ba26`) |
| **Handoff + decision calibration** | `621c6e7211c879a03d4a07c671f0a9e27a082538` (`621c6e7`) |
| **Handoff hash stamp / start here** | `f1489750c691305f61922b582ceceddc1d40ad4c` (`f148975`) |

The system produces explainable `final_decision` values from **risk + scope + import-graph impact**, persists them (atomic with migration 005), and surfaces reasons in the PR analysis UI. BLOCK is reserved for critical-class risk after calibration.

**Next thread should:** open with this file, confirm `git rev-parse HEAD` is `f148975` or a descendant, then implement **Stage 5 (agent feedback loop + continued decision calibration)**.

**Canonical handoff path:** `docs/HANDOFF_STAGE4.md`
