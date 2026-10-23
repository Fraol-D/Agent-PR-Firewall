# Veris — Development Roadmap

**Product version:** v0.5.0 = Stages 0–5 complete (code name: Agent PR Firewall)

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

### Stages 0–3

Foundation, GitHub App integration, analysis pipeline, hardening, trust UX, intent & scope.

**Status:** Complete.

### Stage 4 — Decision engine + import-graph impact

Explainable `final_decision`, risk × scope rules, HIGH-impact escalation, migration `005`.

**Status:** Complete (v0.4.0). See `HANDOFF_STAGE4.md`.

### Stage 5 — Agent feedback loop

Deterministic PR comments, report-only Check Runs, re-analyze on `synchronize`, human override audit trail.

**Status:** Complete (v0.5.0).

---

## In progress / next

### Stage 6 — Portfolio & product polish

Veris branding, monochrome dark UI, demo script, settings/docs alignment.

### Stage 7+ (unscheduled)

- Background job queue for analysis
- Per-repo policy overrides
- Deeper import-graph (tsconfig paths, packages)
- Org multi-seat workspaces

---

## Suggested next work

1. Record a demo: Analyze → decision → Check Run → PR comment → override.
2. Confirm Vercel env + GitHub App Checks write on production.
3. Optional: background analysis queue when inline timeouts hurt.
