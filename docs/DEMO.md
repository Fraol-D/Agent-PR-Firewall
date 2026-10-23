# Veris demo script (≈3 minutes)

Use a connected GitHub repo and an open PR. Prefer a PR that includes a small extra file so scope/risk is visible.

## Setup (once)

1. Sign in with GitHub.
2. Connect the repo (GitHub App installed).
3. App permissions: Pull requests **write**, Checks **write** (accept the install update).

## Script

1. **Landing** — “Agents write PRs faster than humans can re-read them. Veris asks: did they do the task, and what else did they touch?”
2. **Dashboard** — connected repos, ingested PRs, decision counts.
3. **PR detail** — open a PR. Show SHA pin (analysis only sees GitHub-pushed commits).
4. **Analyze** — wait for Decision + explanation (risk / scope / impact). Point at reasons, not the model.
5. **GitHub** — Check Run named **Veris** on the commit. Optional: **Post feedback to PR** and open the comment.
6. **Human review** — Approve or Keep blocked. Say: advisory only; merge is still the human’s.
7. **New commit** (optional) — push or Import PRs → outdated banner → re-analyze.

## What not to claim

- Does not silently block GitHub merges unless the repo requires the Veris check.
- Import graph is file-level and capped.
- Default AI path is free-tier OpenRouter.
