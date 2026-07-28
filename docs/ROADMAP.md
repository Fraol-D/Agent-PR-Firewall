# Agent PR Firewall — Development Roadmap

This roadmap aligns with `REQUIREMENTS.md` stages and what is actually in the codebase.

---

## Why staged delivery?

| Principle | Reason |
| --- | --- |
| Don’t skip foundations | Auth, repos, and PR data must exist before analysis |
| Deterministic before LLM | Objective facts first; AI explains, doesn’t invent ground truth |
| Free-tier friendly | Avoid paid-only paths for portfolio development |
| Modular monolith | Ship features without distributed complexity |
| Human in the loop early | No silent auto-merge until decision stages are deliberate |

---

## Completed

### Stage 0 — Foundation

**Why:** Application shell, identity, design system, and schema so later stages plug in cleanly.

**Includes:**

- Next.js + TypeScript + Tailwind + shadcn/ui  
- Supabase Auth (GitHub OAuth) + user profile  
- Protected dashboard layout  
- Initial PostgreSQL schema + RLS  
- Landing page + empty-state product surfaces  

**Status:** Complete and previously verified. Committed on `main` (root commit era / foundation).

---

### Stage 1 — GitHub Integration

**Why:** Without real repo + PR data, analysis is theater.

**Includes:**

- GitHub App install / setup / recovery sync  
- Webhook endpoint + signature verification  
- PR/repo persistence and idempotency  
- Dashboard list + PR detail (ingestion metadata)  
- Manual PR import when webhooks unavailable  

**Status:** Complete and manually verified. **Pushed on `main`** (`2bdff3b` — “Implement Stage 1 GitHub App integration and PR ingestion”).

---

### Stage 2 — PR Analysis Pipeline

**Why:** Answer “what changed and what should a reviewer care about?” with structured, persisted findings—not auto-merge.

**Includes:**

- Manual Analyze on PR detail  
- Lifecycle (pending → running → completed/failed)  
- Diff collection, classification, bounded context  
- AI provider abstraction  
- OpenRouter free model `cohere/north-mini-code:free`  
- Zod validation + normalization  
- Findings UI, history by analysis version, outdated SHA detection  

**Status:** Implemented and **manually verified** on a real PR (analysis completed with findings).  

**Git note:** Much of Stage 2 code may still be **local / uncommitted** relative to remote `main` (which is Stage 1). Next engineer should commit Stage 2 + docs carefully (no secrets).

---

## In tree / next verification

### Stage 2.5 — Hardening & reliability

**Why:** Stage 2 proves the path works; 2.5 makes results trustworthy (SHA integrity, atomic writes, confidence, observability).

**Objectives:**

- Pin every GitHub fetch to analysis `head_sha`  
- Atomic (or cleanup-safe) persistence  
- Validate `affectedFiles` against real changed paths  
- Calibrate confidence (cap ~95%, penalize weak evidence)  
- Record `duration_ms`; dashboard averages  
- Structured analysis logs without secrets  

**Status in codebase:** Implementation **present** (`004_stage2_5_hardening.sql`, `confidence.ts`, `validate-files.ts`, `log.ts`, SHA-pinned compare, dashboard metrics).  

**Remaining for next thread:**

1. Ensure migration `004` applied in Supabase.  
2. Re-run analysis on a PR and confirm duration + calibrated confidence.  
3. Commit + push Stage 2 + 2.5 + docs if not already on remote.  
4. Treat 2.5 as “done” only after that verification.

---

## Upcoming

### Stage 3 — Task-scope analysis

**Why:** Core product differentiator—intended task vs actual changes.

**Planned:**

- Extract task from issue / PR / manual source  
- Expected vs unexpected areas  
- Scope deviation classification  
- UI for task → expected → actual → unexpected  

**Stub location:** `src/lib/analysis/scope/`

**Do not start until Stage 2.5 is verified and committed if required by the team.**

---

### Stage 4 — Decision engine

**Why:** Combine risk, scope, impact into explainable recommendations.

**Planned outcomes:** `LOW` | `REVIEW_RECOMMENDED` | `REVIEW_REQUIRED` | `BLOCKED`  
with stored reasons—not opaque scores alone.

**Stub location:** risk/decision concepts in schema (`final_decision`) and modules.

---

### Stage 5 — Agent feedback loop

**Why:** Close the loop with agents via PR comments / checks; re-analyze on new commits.

---

### Stage 6 — Portfolio & product polish

**Why:** Presentability: demo narrative, polished UI, architecture story, sample analyses.

---

## Future ideas (not scheduled)

- Self-hosted / local LLM analysis option  
- Deeper import-graph blast radius  
- Multi-seat org workspaces  
- Policy configuration UI  
- Graphite/GitHub status check productization  
- Paid provider optional (never required for core demo)  

---

## Suggested next engineer order of work

1. Read `docs/HANDOFF_STAGE2.md`.  
2. Apply any missing migrations (`003`, `004`).  
3. Commit Stage 2 + 2.5 + `docs/` (exclude secrets).  
4. Verify 2.5 on a real analysis.  
5. Only then open Stage 3 design/implementation.  
