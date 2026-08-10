# Decision Engine

**Version:** v0.3.0
**Implementation:** `src/lib/analysis/decision.ts`, `confidence.ts`, `scope/*`
**UI:** Decision card + Decision trace on `AnalysisPanel`

This document describes **exactly** how merge recommendations are produced today.
The recommendation is **advisory**—it does not block GitHub merges.

---

## 1. Outputs

| UI label               | Internal `MergeDecision` | Stored `overall_status`   |
| ---------------------- | ------------------------ | ------------------------- |
| **Safe to merge**      | `safe_to_merge`          | `no_significant_concerns` |
| **Review recommended** | `review_recommended`     | `review_recommended`      |
| **Block merge**        | `block_merge`            | `high_risk_concerns`      |

Also shown:

- **Primary reason** (one sentence)
- **Overall confidence** (mean of calibrated finding confidences, if any)
- **Confidence reason** (High / Medium / Low label)
- **Decision trace** (deterministic checklist)

---

## 2. Pipeline position

```text
collect files → Scope & Consistency Analysis → AI findings → calibrate confidence
        → computeMergeDecision(findings, deterministic, intentScope)
        → persist overall_status
```

AI may return its own `overallStatus`; **the deterministic decision overrides** what is stored and shown.

---

## 3. Deterministic rules

Evaluated in order (first matching “block” or “review” band wins for that tier).

### 3.1 Block merge

If **any** of:

| Signal                       | Definition                                                        |
| ---------------------------- | ----------------------------------------------------------------- |
| Critical finding             | Any finding with `severity === "critical"`                        |
| High security/auth           | `severity === "high"` and category `SECURITY` or `AUTHENTICATION` |
| Secret / credential language | Title/summary/explanation/evidence match secret-like patterns     |
| Destructive migration        | `DATABASE` + high severity + drop/truncate/destructive language   |

**Example primary reasons:**

- Critical findings require resolution before merge.
- Potential secret exposure or credential risk detected.
- Destructive database migration risk detected.
- High-severity security or authentication concerns.

### 3.2 Review recommended

If not blocked, and **any** of:

| Signal                | Definition                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Medium+ findings      | Count of medium/high/critical > 0, or max severity high                                         |
| Sensitive touch       | Deterministic sensitive areas include Auth/DB/Infra, or medium+ finding in AUTH/DB/API/SECURITY |
| Low confidence        | Average calibrated confidence &lt; 0.55 with ≥1 finding                                         |
| Scope unrelated       | Stage 3 `scopeMatch === "unrelated"`                                                            |
| Scope creep / exceeds | `scopeCreepDetected` or `scopeMatch === "exceeds"`                                              |
| Weak coverage         | Stage 3 `coverage === "low"`                                                                    |

**Example primary reasons:**

- Implementation appears unrelated to the stated task…
- Scope creep detected…
- Low implementation coverage…
- Medium or high severity findings need human review.
- Authentication, API, or database areas were modified.

### 3.3 Safe to merge

If not blocked/reviewed:

| Case                      | Reason pattern                                                              |
| ------------------------- | --------------------------------------------------------------------------- |
| Documentation-only change | All files classified as docs; no security/runtime risks from rules above    |
| No findings               | No structured findings (unless AI overall was high-risk → forced to review) |
| Info/low only             | Only informational/low findings remain                                      |

Docs-only is detected by file category + path patterns (`README`, `docs/`, `*.md`, …).

---

## 4. Confidence calibration

**File:** `src/lib/analysis/confidence.ts`
Applied **per finding** after AI returns raw confidence.

### Algorithm

1. Start with AI confidence in `[0, 1]`, or **0.55** if missing.
2. Hard cap at **0.95**.
3. Multiplicative adjustments:

| Condition                                         | Factor               |
| ------------------------------------------------- | -------------------- |
| `isInference`                                     | × 0.85               |
| Weak/empty evidence                               | × 0.70               |
| Evidence mentions a real analyzed path            | × 1.05 (then re-cap) |
| No valid `affectedFiles`                          | × 0.75               |
| &gt;50% files excluded from AI                    | × 0.90               |
| Truncated patches in context                      | × 0.92               |
| Category aligns with deterministic sensitive area | × 1.04 (then re-cap) |

4. Floor **0.05**, clamp to `[0.05, 0.95]`, round to 3 decimals.
5. Attach **confidence reason** (High / Medium / Low + short label).

### Overall confidence

Mean of calibrated finding confidences (null if no findings).

Overall reason examples:

- High — “Directly observed in modified code.”
- Medium — “Inference from surrounding implementation.”
- Low — “Limited evidence available.”
- Docs-only special case may prefer deterministic classification wording.

---

## 5. Decision trace

**Built only from deterministic facts**—no AI prose.

Compact checklist items with tones:

| Tone     | Meaning               |
| -------- | --------------------- |
| positive | Supporting safe merge |
| warning  | Needs attention       |
| negative | Blocking / severe     |
| neutral  | Informational         |

Typical items:

- Documentation-only / code change
- Scope match / creep / unrelated (Stage 3)
- Auth surface touched or not
- Secrets detected or not
- Finding severity summary
- Confidence %
- Manual review / block / no blocking concerns

UI shows icons + labels; color is not the only channel.

---

## 6. Interaction with Scope & Consistency Analysis

Scope & Consistency Analysis does **not** invent severity. It feeds the Decision Engine when:

- Implementation is unrelated to the task
- Scope creep or exceeds stated scope
- Coverage is low

Missing-work warnings appear in **Scope & Consistency Analysis**; high missing work can influence coverage → review.

Full intent engine: `src/lib/analysis/scope/`, [`STAGE_3_REPORT.md`](./STAGE_3_REPORT.md).

---

## 7. What this is not (yet)

| Not included in v0.3.0                 | Stage                                   |
| -------------------------------------- | --------------------------------------- |
| Configurable org policies              | 4                                       |
| Hard GitHub Checks / branch protection | 4–5                                     |
| Human override audit log               | 4                                       |
| Separate impact scoring engine         | 4                                       |
| Auto-merge                             | Never without explicit product decision |

---

## 8. Acceptance tests for decisions

| Scenario                           | Expected decision band      |
| ---------------------------------- | --------------------------- |
| Docs-only README PR, info findings | Safe to merge               |
| Medium reliability finding         | Review recommended          |
| Critical security finding          | Block merge                 |
| Docs title + auth/DB files         | Review (scope creep)        |
| Stuck analysis                     | Failed (not endless review) |

See [`TESTING.md`](./TESTING.md).
