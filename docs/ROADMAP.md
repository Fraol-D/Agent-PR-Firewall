# Agent PR Firewall — Development Roadmap

**Product version target:** v0.3.0 = Stage 3 complete

---

## Principles

| Principle                | Reason                                |
| ------------------------ | ------------------------------------- |
| Foundations first        | Auth, repos, PRs before analysis      |
| Deterministic before LLM | Facts first; AI explains              |
| Free-tier friendly       | No paid AI required for core demo     |
| Modular monolith         | Avoid premature distribution          |
| Human in the loop        | No silent auto-merge until deliberate |

---

## Completed

### Stage 0 — Foundation

Next.js app, design system, Supabase auth/schema, dashboard shell.

**Status:** Complete.

### Stage 1 — GitHub integration

GitHub App install/setup/sync, webhooks, PR persistence, list/detail, Import PRs.

**Status:** Complete.

### Stage 2 — PR analysis pipeline

Manual analyze, SHA-aware lifecycle, OpenRouter free model, findings UI, version history.

**Status:** Complete.

### Stage 2.5 — Hardening

SHA-pinned compare, confidence calibration, `affectedFiles` filter, `duration_ms`, structured logs, atomic completion RPC.

**Status:** Complete. Migration: `004_stage2_5_hardening.sql`.

### Stage 2.6 — UX & trust

Merge decision UI, decision trace, structured evidence, progress steps, notifications, risk breakdown, docs-aware prompts.

**Status:** Complete. See `STAGE_2_6_REPORT.md`.

### Stage 3 — Scope & Consistency Analysis

Task extraction, PR classification, scope match/creep/coverage/missing work, Scope & Consistency Analysis panel, Decision Engine integration.

**Status:** Complete (v0.3.0). See `STAGE_3_REPORT.md`, `HANDOFF_STAGE3.md`.

**Code:** `src/lib/analysis/scope/`

---

## Upcoming

### Stage 4 — Decision engine productization

**Why:** Turn deterministic recommendations into a first-class, configurable policy product.

**Directions:**

- Persist `final_decision` with versioned rule ids
- Policy thresholds (what becomes BLOCK vs REVIEW)
- Stronger impact/risk modules (beyond stubs)
- Optional GitHub Check / commit status (read-only first)
- Audit trail for decision overrides

**See:** [`DECISION_ENGINE.md`](./DECISION_ENGINE.md) (current rules) and Stage 4 notes in [`HANDOFF_STAGE3.md`](./HANDOFF_STAGE3.md).

### Stage 5 — Agent feedback loop

PR comments or checks for agents; re-analyze on new commits; structured “fix these items” output.

### Stage 6 — Portfolio & product polish

Demo narrative, sample analyses, public screenshots, optional deploy story.

---

## Future ideas (unscheduled)

- Local / self-hosted LLM path
- Import-graph blast radius
- Org multi-seat workspaces
- Policy UI
- Optional paid models (never required for baseline)

---

## Suggested next work

1. Read [`HANDOFF_STAGE3.md`](./HANDOFF_STAGE3.md).
2. Confirm migrations `001`–`004` on the target Supabase project.
3. Commit remaining Stage 3 + docs polish to `main` if not already.
4. Design Stage 4 policy + persistence (no silent GitHub blocks yet).
