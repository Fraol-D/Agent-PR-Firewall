# Engineering Handoff — Stage 3 (v0.3.0)

**Write this for the next engineer.**
**Stage 3 is implemented; Stage 4 is the next product stage.**

---

## 1. Project status

| Item              | Status                                                              |
| ----------------- | ------------------------------------------------------------------- |
| Product           | Agent PR Firewall                                                   |
| Repo              | https://github.com/Fraol-D/Agent-PR-Firewall                        |
| Local path note   | Folder may be `Agent-Firewal` (typo)—do not rename casually         |
| Version narrative | **v0.3.0** — Stage 3 Scope & Consistency Analysis                   |
| Stage 0–2.6       | Complete (see ROADMAP)                                              |
| Stage 3           | Complete in codebase (`src/lib/analysis/scope/*`, orchestrator, UI) |
| Stage 4+          | Not started                                                         |

**Git:** Prefer shipping Stage 3 + this docs set on `main`. Feature branch during development: `stage/3-intent-scope-analysis` (if still present).

**Secrets:** Never commit `.env.local`, `secrets/*.pem`, resume PDFs, or local screenshots.

---

## 2. Current architecture (summary)

Modular **Next.js monolith**:

| Layer      | Stack                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| UI         | App Router, Tailwind, shadcn; PR detail `AnalysisPanel`                                                   |
| Auth       | Supabase + GitHub OAuth                                                                                   |
| Data       | Supabase Postgres + RLS; service role for writes                                                          |
| GitHub     | App + Octokit + webhooks + Import PRs                                                                     |
| Analysis   | Deterministic collect → **Scope & Consistency Analysis** → AI → calibrate → **Decision Engine** → persist |
| AI default | OpenRouter `cohere/north-mini-code:free`                                                                  |

Full detail: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Analysis pipeline (must remember)

```text
start → pin head_sha → compareCommits
  → analyzeIntentAndScope (commits + issues + classify + verify)
  → build context (includes task line)
  → AI → normalize/Zod → filter paths → calibrate
  → computeMergeDecision (findings + intent)
  → persist + scope_score/classification
```

**Client constraint:** Do not import `scope/index` or GitHub App modules into client components (pulls Node `fs`). Use `scope/classify-pr` or pure types only.

**Poll constraint:** Abandoned `pending`/`running` jobs are failed after ~6 minutes; client poll is capped to avoid infinite GET loops.

---

## 3. Completed stages

| Stage | Deliverable                                              |
| ----- | -------------------------------------------------------- |
| 0     | App shell, auth, schema, design system                   |
| 1     | GitHub App, webhooks, PR ingestion, import               |
| 2     | Analysis API, orchestrator, OpenRouter, findings UI      |
| 2.5   | SHA integrity, confidence, duration, atomic RPC, logs    |
| 2.6   | Decision UI, trace, evidence, progress, notifications    |
| 3     | Intent extraction, scope match/creep/coverage, Intent UI |

Reports: `STAGE_2_6_REPORT.md`, `STAGE_3_REPORT.md`.

---

## 4. Key paths

| Path                                          | Responsibility                              |
| --------------------------------------------- | ------------------------------------------- |
| `src/services/analyses.ts`                    | Start/execute/persist/load analysis         |
| `src/lib/analysis/orchestrator.ts`            | Pipeline                                    |
| `src/lib/analysis/scope/*`                    | Stage 3 Scope & Consistency Analysis engine |
| `src/lib/analysis/decision.ts`                | Merge recommendation                        |
| `src/lib/analysis/confidence.ts`              | Calibration                                 |
| `src/lib/analysis/ai/*`                       | Providers                                   |
| `src/components/dashboard/analysis-panel.tsx` | Trust + intent UX                           |
| `supabase/migrations/`                        | `001`–`004`                                 |

---

## 5. Environment

See root `.env.example`. Critical: Supabase trio, GitHub App + PEM path, `OPENROUTER_API_KEY`.

```bash
npm install
npm run dev
```

Migrations must be applied on the Supabase project before analysis persistence features work.

---

## 6. Known limitations

| Issue              | Notes                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| Inline analysis    | No worker queue; long PRs stress request timeout (`maxDuration` 300s)    |
| Free models        | Rate limits; enum/quality variance; normalize mitigates validation fails |
| Scope heuristics   | Deterministic keyword/path rules—not full NLP task understanding         |
| Linked issues      | Best-effort fetch; private/missing issues skipped                        |
| Decision vs GitHub | Advisory only; no Checks / branch protection yet                         |
| DB types           | Hand-maintained; not generated from Supabase                             |
| Next middleware    | Deprecation warning toward “proxy” convention                            |
| Windows + ngrok    | Defender may block tunnels; use Import PRs                               |
| Contrast           | Decision colors tuned for dark mode; verify after theme changes          |

---

## 7. Technical debt

- No analysis job queue
- Impact/risk modules still stubs for deeper Stage 4 scoring
- Multiple AI provider files; default is OpenRouter free only
- Large PRs drop files from AI budget by design
- Test coverage is manual scenario-based (see TESTING.md), not full automated e2e suite

---

## 8. Future direction

1. **Stage 4** — Productize the Decision Engine (see below)
2. **Stage 5** — Agent feedback (comments/checks, re-analyze loop)
3. **Stage 6** — Demo polish, public screenshots, narrative

Longer term: local LLM option, deeper blast radius, multi-seat orgs.

---

## 9. Stage 4 recommendations

Prioritize in this order:

1. **Persist decision artifacts**
   - Store `final_decision`, rule version, primary reason, trace JSON
   - Keep mapping to existing `overall_status` for UI compatibility

2. **Policy configuration (server defaults first)**
   - Thresholds: e.g. any critical → BLOCK; auth touch → REVIEW
   - Optional per-repo overrides later

3. **Impact / risk modules**
   - Flesh out `src/lib/analysis/risk/` and `impact/` with deterministic scorers
   - Combine with scope score into a single explainable model

4. **GitHub Check (optional, read-only first)**
   - Report decision as a Check run without enforcing branch protection
   - Enforcement only after product sign-off

5. **Queue**
   - Move analysis off the request path (background job + poll) for reliability

6. **Do not**
   - Auto-merge
   - Require paid models
   - Rewrite the modular monolith into microservices

Decision rules today: [`DECISION_ENGINE.md`](./DECISION_ENGINE.md).

---

## 10. Verification checklist for the next engineer

- [ ] Migrations `001`–`004` applied
- [ ] Analyze a docs-only PR → Safe + docs banner + Intent section
- [ ] Analyze auth PR → Review or auth-sensitive trace
- [ ] No infinite `/api/analysis/:id` polling
- [ ] PR detail loads without `fs` / client bundle errors
- [ ] `npm run build` green
- [ ] Docs set under `/docs` matches code

Scenario detail: [`TESTING.md`](./TESTING.md).

---

## 11. Explicit non-goals for the next session

Unless planned as Stage 4+ design:

- Silent auto-approve/block/merge
- Enterprise multi-tenant rewrite
- Paid-only AI path as default

---

## 12. Doc index

| Doc                                          | Use                           |
| -------------------------------------------- | ----------------------------- |
| [`PRD.md`](./PRD.md)                         | Product requirements          |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)       | System design                 |
| [`ROADMAP.md`](./ROADMAP.md)                 | Stages                        |
| [`DECISION_ENGINE.md`](./DECISION_ENGINE.md) | Decision Engine rules         |
| [`TESTING.md`](./TESTING.md)                 | Five PR scenarios             |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md)       | Contribution norms            |
| [`STAGE_3_REPORT.md`](./STAGE_3_REPORT.md)   | Stage 3 implementation report |

**Handoff complete.** Continue with: _read `docs/HANDOFF_STAGE3.md` and `docs/ROADMAP.md`, then Stage 4 design or verification._
