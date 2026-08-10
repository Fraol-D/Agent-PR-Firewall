# Stage 2.6 — UX & Trust Hardening — Implementation Report

**Branch:** `stage/2.6-ux-trust-hardening`  
**Goal:** Make analysis results trustworthy, readable, and professional without adding product capabilities beyond Stage 2.

---

## Summary

Stage 2.6 keeps the Stage 2 analysis pipeline (collect → classify → context → AI → calibrate → persist) intact. It adds **deterministic decisioning**, **structured evidence**, **documentation-aware prompts**, and a **redesigned analysis panel** so reviewers can answer in seconds:

| Question | Where it appears |
| --- | --- |
| Is this PR safe? | **Decision** card (Safe / Review / Block) |
| Why? | Primary reason + **Decision trace** |
| What should I watch? | Risk breakdown + finding cards |
| How confident? | Confidence % + confidence reason |
| What evidence? | Structured evidence (file / lines / observed / supports) |

---

## Changes by requirement

### 1. Decision replaces “Overall”

- New types: `MergeDecision` (`safe_to_merge` | `review_recommended` | `block_merge`).
- Module: `src/lib/analysis/decision.ts` — `computeMergeDecision()`.
- Rules are **deterministic** from findings + change metadata (severity, categories, secrets hints, destructive migration language, sensitive areas, docs-only, confidence threshold).
- Stored `overall_status` is aligned on write via orchestrator mapping:
  - Safe → `no_significant_concerns`
  - Review → `review_recommended`
  - Block → `high_risk_concerns`
- UI shows prominent **Decision**, **Confidence**, and **Primary reason**.

### 2. Decision trace

- Compact checklist under the decision card.
- Tones: positive / warning / negative / neutral with icons (not color-only).
- Examples: “Documentation-only change”, “No secrets detected”, “Manual review recommended”.
- **No AI prose** — built only in `buildDecisionTrace()`.

### 3. Structured evidence

- Module: `src/lib/analysis/evidence.ts`.
- Derives `{ file, lines, observedChange, supportsFinding, raw }` from existing string `evidence` + `affectedFiles`.
- Collapses long text behind **View more**.
- **Backward compatible** — no findings table migration.

### 4. Documentation-aware analysis

- Docs-only detection: documentation category, `docs/`, `README*`, markdown extensions.
- Prompt updates in `src/lib/analysis/ai/prompts.ts`.
- Context banner in `build-context.ts`.
- Orchestrator prefixes summary when needed:  
  `This pull request modifies documentation only.`
- UI banner when `docsOnly` is true.

### 5. Better confidence

- Numerical confidence retained (Stage 2.5 calibration).
- `buildConfidenceReason()` → High / Medium / Low with labels:
  - *Directly observed in modified code.*
  - *Inference from surrounding implementation.*
  - *Limited evidence available.*
- Overall confidence reason on the decision card.

### 6. Live analysis progress

- Client progress steps while analysis runs (inline request + busy state):
  1. Collecting PR files  
  2. Filtering context  
  3. Preparing prompt  
  4. Running AI analysis  
  5. Validating output  
  6. Saving analysis  
  7. Completed  
- Completed → checkmarks; current → spinner; failure → highlighted step.

### 7. Completion notification

- `src/lib/analysis/client-notify.ts`
- Requests browser notification permission **once** (localStorage flag).
- On successful **user-triggered** completion: title “Analysis Complete”, body “Pull request analysis has finished.”
- Short soft Web Audio tone (not annoying; `silent: true` on Notification).
- Failures never block UI.

### 8. Improved summary

- Replaced large paragraph-first layout with compact meta:
  Decision, Reason, Files, Duration, Provider, Commit SHA, Findings.
- Optional short summary still available via primary reason / docs banner.

### 9–13. Findings UX, risk system, chips, collapse

- Finding cards: severity badge, category, title, summary, collapsible explanation, structured evidence, confidence + reason, affected files.
- Semantic colors: green safe, blue info, amber review, red block/critical (existing design tokens).
- Horizontal **Risk breakdown** strip (Security, Reliability, …).
- Metadata chips: provider, model, file count, duration, version, commit.

### 14–16. Empty states, micro-interactions, a11y

- Empty / no findings / failed / running states with icons and clear copy.
- Subtle expand transitions, hover on cards, skeletons while starting.
- `role="status" | "alert"`, `aria-expanded`, labels on icons, meaning not color-only.

### 17. Performance

- Decision/evidence enrichment is O(findings) on load/complete.
- Notifications deferred via `queueMicrotask`.
- No new paid services; OpenRouter path unchanged.

---

## Files touched

| Path | Role |
| --- | --- |
| `src/lib/analysis/decision.ts` | **New** — merge decision + trace + risk breakdown |
| `src/lib/analysis/evidence.ts` | **New** — structured evidence |
| `src/lib/analysis/client-notify.ts` | **New** — browser notify + sound |
| `src/lib/analysis/types.ts` | Decision / evidence / detail fields |
| `src/lib/analysis/confidence.ts` | Confidence reasons |
| `src/lib/analysis/ai/prompts.ts` | Docs-aware system + user prompts |
| `src/lib/analysis/build-context.ts` | Docs-only context flag |
| `src/lib/analysis/orchestrator.ts` | Apply decision; docs summary |
| `src/lib/analysis/log.ts` | `decision_computed` event |
| `src/lib/analysis/index.ts` | Public exports |
| `src/services/analyses.ts` | Enrich `AnalysisDetail` for UI |
| `src/components/dashboard/analysis-panel.tsx` | Full trust UX redesign |
| `docs/STAGE_2_6_REPORT.md` | This report |

---

## Before / after (UX)

### Before

- “Overall: No significant concerns detected”
- Long AI summary paragraph
- Raw evidence dump
- Spinner “Analysis in progress”
- Findings always fully expanded

### After

- **Decision: Safe to merge | Review recommended | Block merge**
- Primary reason + confidence % + reason label
- Deterministic decision trace
- Structured evidence fields + View more
- Stepped progress with checkmarks
- Collapsible finding cards
- Risk breakdown + metadata chips
- Optional browser notification + soft chime

*(Live product screenshots: open a PR → Analyze after deploy; capture decision card + trace + a finding card.)*

---

## Backward compatibility

- Existing analyses load without migration.
- `overall_status` enum unchanged in DB.
- Finding `evidence` remains a string; structure is derived at read time.
- New `AnalysisDetail` fields always computed in `getAnalysisDetail`.

---

## Acceptance checklist

| Criterion | Status |
| --- | --- |
| Decision replaces Overall | Done |
| Decision Trace | Done |
| Structured evidence | Done |
| Documentation-only review | Done |
| Confidence reason | Done |
| Live progress | Done |
| Browser notification | Done |
| Notification sound | Done |
| Risk breakdown | Done |
| Visual hierarchy | Done |
| Collapsible findings | Done |
| Stage 2 pipeline preserved | Done |

---

## How to verify

1. `npm run dev` with OpenRouter configured.  
2. Open a PR detail → **Analyze pull request**.  
3. Confirm progress steps animate, then decision card + trace.  
4. Re-open a docs-only PR analysis → docs banner + docs-focused findings.  
5. Allow notifications once → re-analyze → notification + soft tone.  
6. Expand a long finding → View more / Show less.

---

## Non-goals (respected)

- No full app redesign  
- No paid AI providers required  
- OpenRouter default retained  
- No Stage 3 scope engine  
- No auto merge/block enforcement on GitHub  
