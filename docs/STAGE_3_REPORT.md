# Stage 3 — Scope & Consistency Analysis — Implementation Report

**Branch:** `stage/3-intent-scope-analysis`
**Goal:** Understand *why* a PR exists and whether the implementation matches that intent—without removing Stage 2 analysis.

---

## Summary

Stage 3 adds a **deterministic Scope & Consistency Analysis engine** that runs after changed-file collection and before (and alongside) AI analysis:

1. Extract a **task summary** from PR title, description, linked issues, commit messages, and branch name.
2. **Classify** the PR (feature, bug fix, documentation, …).
3. **Verify** claimed task vs actual file areas.
4. Detect **scope creep** and list unrelated files.
5. Flag **missing companion work** (tests, docs, rollback signals, …).
6. Estimate **implementation coverage** (low / medium / high) with reasoning.
7. Surface results in a new **Scope & Consistency Analysis** UI section and feed weak scope into the merge decision.

AI is **not required** for Stage 3 signals. Existing Stage 2 findings, decision card, progress, and notifications remain.

---

## Capabilities

### 1. Task extraction

| Source | How |
| --- | --- |
| PR title | Primary summary (conventional-commit prefix stripped) |
| PR description | First meaningful line when title is weak |
| Linked issues | `#N` / `closes #N` parsed; issue title fetched via GitHub App |
| Commit messages | Compare + PR commits list (first line each) |
| Branch name | Fallback when other signals are empty |

**Output:** one-line `taskSummary` + `taskSources[]` with excerpts.

### 2. Scope classification

Deterministic scoring from intent keywords + file categories:

Feature · Bug Fix · Documentation · Refactor · Dependency Update · Security · Performance · Configuration · Infrastructure · Maintenance

Primary + optional secondary labels.

### 3. Scope verification

Compares **expected areas** (from classification + intent keywords) to **actual file categories**.

| `scopeMatch` | Meaning |
| --- | --- |
| `matches` | Implementation aligns with stated task |
| `partial` | Some expected areas hit; gaps remain |
| `exceeds` | Related work plus clear out-of-scope files |
| `unrelated` | Changes largely do not match the claim |
| `unknown` | Insufficient signals |

### 4. Scope creep

When files fall outside expected areas (strict for docs/deps/config), the engine sets:

- `scopeCreepDetected: true`
- `scopeCreepSummary`
- `unrelatedFiles[]` for the UI

Example: title “Update README” but auth + database files change → creep.

### 5. Missing work

Heuristic gaps, for example:

- Code changed without tests
- Validation without tests
- Migration without rollback signals
- API feature without docs
- Auth change without tests
- Security PR without threat-model notes

### 6. Implementation coverage

`low` | `medium` | `high` from area hit-rate, in-scope ratio, match quality, and high-severity missing work—with `coverageReason`.

### 7. Summary fields (UI)

Intent section shows:

Decision · Task Summary · Scope Match · Coverage · Scope Creep · Overall Recommendation

Plus classification chips, expected/actual areas, unrelated files, warnings, and expandable task sources.

### 8. Merge decision integration

`computeMergeDecision` treats as **review recommended** when:

- scope match is `unrelated` or `exceeds`
- scope creep detected
- coverage is `low`

Decision trace gains scope-related checklist items.

---

## Architecture

```text
collectPullRequestChanges (SHA-pinned)
        ↓
analyzeIntentAndScope  ← Stage 3 (GitHub: commits + issues)
        ↓
buildAnalysisContext (includes task line for AI)
        ↓
AI findings (Stage 2) → calibrate → merge decision (2.6 + scope)
        ↓
persist deterministic_result.intentScope + scope_score/classification
```

| Module | Role |
| --- | --- |
| `scope/extract-task.ts` | Task summary + sources |
| `scope/classify-pr.ts` | PR type classification |
| `scope/verify-scope.ts` | Match, creep, missing work, coverage |
| `scope/collect-intent.ts` | Commits + linked issues via Octokit |
| `scope/index.ts` | `analyzeIntentAndScope` public API |
| `orchestrator.ts` | Runs Stage 3 after collect |
| `services/analyses.ts` | Persist + load `intentScope` |
| `analysis-panel.tsx` | Scope & Consistency Analysis section |

### Persistence (backward compatible)

- Full result stored on `analyses.deterministic_result.intentScope`
- Also mirrored under `context_stats.intentScope`
- `scope_score` (0–100) and `scope_classification` (`HIGH_COMPLIANCE` / `PARTIAL` / `LOW_COMPLIANCE` / `UNKNOWN`) updated after complete
- Optional `tasks` row with extracted content (best-effort)
- Legacy analyses without `intentScope` simply hide the Intent section

No breaking schema migration required for UI; existing Stage 2 rows still load.

---

## Acceptance checklist

| Criterion | Status |
| --- | --- |
| Task extracted | Done |
| Scope classified | Done |
| Scope creep detected | Done |
| Missing work detected | Done |
| Coverage estimated | Done |
| Intent section visible | Done |
| Existing analysis preserved | Done |

---

## How to verify

1. `npm run dev` with GitHub App + OpenRouter configured.
2. Analyze a **docs-only** PR → classification Documentation, match high, no creep.
3. Analyze a PR titled “Update README” that also touches auth → **Scope creep** + unrelated files.
4. Analyze a feature PR without tests → **Tests missing** warning.
5. Confirm Stage 2 findings, decision card, and progress still work.

---

## Non-goals (respected)

- No Stage 4 policy engine
- No auto block/merge on GitHub
- No paid AI for scope (fully deterministic)
- No removal of Stage 2/2.5/2.6 behavior
