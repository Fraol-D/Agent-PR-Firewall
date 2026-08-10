# Testing Guide

**Version:** v0.3.0
**Focus:** Five PR scenarios for analysis evaluation + smoke paths

These scenarios mirror the dedicated test branches used for portfolio / analysis evaluation. They validate Stage 2–3 behavior without requiring paid AI.

---

## 1. Prerequisites

- App running (`npm run dev`) with valid `.env.local`
- Supabase migrations `001`–`004` applied
- GitHub App installed on a **test repository you control**
- `OPENROUTER_API_KEY` set (free model)
- At least one PR visible (Import PRs if webhooks unavailable)

### Commands

```bash
npm run lint
npm run build
npm run dev
```

---

## 2. Test branches (reference)

| Branch                    | Intent                         |
| ------------------------- | ------------------------------ |
| `test/docs-update`        | Documentation-only change      |
| `test/auth-improvement`   | Authentication-related code    |
| `test/database-migration` | Schema / migration             |
| `test/dependency-update`  | Package bumps + lockfile       |
| `test/api-refactor`       | API validation / route helpers |

Open each as a PR against `main` (or merge base used in evaluation), connect the repo, import the PR, open detail → **Analyze pull request**.

---

## 3. Scenario matrix

### 3.1 Docs — `test/docs-update`

**Change shape:** `README.md` only (prerequisites, setup, contributing, typos).

| Expect           | Criterion                                                   |
| ---------------- | ----------------------------------------------------------- |
| Classification   | Documentation (primary)                                     |
| Docs-only banner | Yes (“modifies documentation only”)                         |
| Decision         | Typically **Safe to merge** (if findings are info/low only) |
| Scope match      | `matches` or high alignment                                 |
| Scope creep      | None (or empty unrelated files)                             |
| Findings         | Docs quality / clarity style; not “implemented feature X”   |
| Evidence         | Paths under README/docs                                     |

**Acceptance:** Task summary reflects doc update; decision card not “Block” without secret/critical signals.

---

### 3.2 Auth — `test/auth-improvement`

**Change shape:** `src/lib/auth/session.ts`, `actions.ts` (validation structure, error handling, comments). **No intentional vulnerabilities.**

| Expect          | Criterion                                                        |
| --------------- | ---------------------------------------------------------------- |
| Classification  | Often Security / Feature / Refactor (auth keywords + paths)      |
| Sensitive areas | Authentication present                                           |
| Decision        | Often **Review recommended** (auth surface) even if low findings |
| Scope match     | Aligns with auth/session task language                           |
| Missing work    | May flag “tests missing” if no test files                        |
| Findings        | Session validation, redirect sanitization, etc.                  |

**Acceptance:** Intent section shows auth-related task; decision trace mentions authentication; no false “docs-only”.

---

### 3.3 Database — `test/database-migration`

**Change shape:** New migration (e.g. nullable column) + types / map updates.

| Expect          | Criterion                                                                  |
| --------------- | -------------------------------------------------------------------------- |
| File categories | `database` + possibly `backend` / types                                    |
| Classification  | Feature / Maintenance / Refactor depending on title                        |
| Missing work    | Possible “rollback guidance missing” for SQL                               |
| Decision        | Review if DB sensitive; Block only if destructive/high security rules fire |
| Scope           | Expected areas include Database                                            |

**Acceptance:** Migration path listed in changed files; scope engine sees database area; analysis completes with SHA pin.

---

### 3.4 Dependency — `test/dependency-update`

**Change shape:** 2–3 compatible package bumps + lockfile only.

| Expect         | Criterion                                                                      |
| -------------- | ------------------------------------------------------------------------------ |
| Classification | **Dependency Update** (strong file signal)                                     |
| Scope          | Expected areas dominated by dependencies                                       |
| Creep          | Non-lockfile code would show creep if present—should **not** on a pure deps PR |
| Decision       | Often Safe or Review (deps can be medium risk depending on findings)           |
| AI context     | Lockfiles often excluded from AI budget by design                              |

**Acceptance:** Task/classification reflects dependency update; package.json + lockfile in changed files list.

---

### 3.5 API — `test/api-refactor`

**Change shape:** Route helpers + analysis/GitHub API routes (validation, errors only).

| Expect          | Criterion                                                           |
| --------------- | ------------------------------------------------------------------- |
| Classification  | Refactor / Feature / Maintenance                                    |
| File categories | backend / API-ish paths                                             |
| Scope           | Matches “refactor API validation” style titles                      |
| Decision        | Review if medium findings or sensitive touch; else Safe             |
| Client safety   | No `fs` import into client bundle (regression: PR detail must load) |

**Acceptance:** Analysis completes; Intent section present; no infinite poll; findings reference route/helper paths when claimed.

---

## 4. Cross-cutting acceptance criteria

### 4.1 Analysis lifecycle

| Check          | Pass                                                  |
| -------------- | ----------------------------------------------------- |
| Start analysis | Status moves to completed or failed                   |
| Progress UI    | Steps animate; complete with checkmarks               |
| Poll           | Stops on completed/failed; no infinite GET loop       |
| Stale job      | Abandoned pending/running (&gt; ~6 min) fails cleanly |
| Re-analyze     | New version or force on same SHA works                |
| Outdated       | Banner when PR head ≠ analysis head                   |

### 4.2 Decision & trust

| Check          | Pass                                      |
| -------------- | ----------------------------------------- |
| Decision card  | Safe / Review / Block with primary reason |
| Decision trace | Non-empty checklist, deterministic labels |
| Confidence     | ≤ ~0.95; reason High/Medium/Low           |
| Contrast       | Decision text readable in dark mode       |

### 4.3 Scope & Consistency Analysis (Stage 3)

| Check                  | Pass                                       |
| ---------------------- | ------------------------------------------ |
| Task summary           | Non-empty, derived from title/body/commits |
| Classification chip    | Present                                    |
| Scope match + coverage | Present with reasons                       |
| Creep list             | Only when unrelated files exist            |
| Missing work           | Optional warnings list                     |

### 4.4 Security / hygiene

| Check                          | Pass                      |
| ------------------------------ | ------------------------- |
| No secrets in findings context | `.env` / PEMs excluded    |
| Webhook invalid signature      | 401 (if testing webhooks) |
| Service role / AI keys         | Server-only               |

### 4.5 Build

```bash
npm run lint
npm run build
```

Both should pass on a clean tree.

---

## 5. Expected outputs (summary table)

| Scenario   | Decision (typical) | Intent classification (typical) | Creep                      |
| ---------- | ------------------ | ------------------------------- | -------------------------- |
| Docs       | Safe               | Documentation                   | No                         |
| Auth       | Review             | Security / related              | No (if only auth files)    |
| Database   | Review or Safe     | Feature/Maintenance             | No if only migration/types |
| Dependency | Safe or Review     | Dependency Update               | No                         |
| API        | Safe or Review     | Refactor                        | No if only API files       |

Free models vary on finding text; **deterministic** columns (docs-only, categories, decision band rules, creep file lists) are the reliable acceptance surface.

---

## 6. Manual smoke (Stage 1)

1. Sign in → Repositories → Connect / Sync
2. Import PRs
3. Open PR → metadata visible
4. Analyze → completed results

---

## 7. Failure injection (optional)

| Action                        | Expected                                   |
| ----------------------------- | ------------------------------------------ |
| Remove `OPENROUTER_API_KEY`   | 503 / clear config error                   |
| Force-analyze missing SHA     | Failed analysis, no orphan findings        |
| Leave tab mid-run (stuck row) | Later open marks failed after stale window |

---

## 8. Related docs

- [`DECISION_ENGINE.md`](./DECISION_ENGINE.md)
- [`HANDOFF_STAGE3.md`](./HANDOFF_STAGE3.md)
