# Engineering Handoff — Stage 2 (and 2.5 code)

**Write this for the next engineer.**  
**Do not start Stage 3 until Stage 2.5 is verified and the working tree is cleanly committed.**

---

## 1. Current project status

| Item | Status |
| --- | --- |
| Product name | Agent PR Firewall |
| Repo | https://github.com/Fraol-D/Agent-PR-Firewall |
| Local path (author machine) | `C:\Users\fraol\Desktop\Agent-Firewal` (note spelling) |
| Stage 0 | Complete |
| Stage 1 | Complete, verified, **on remote `main`** (`2bdff3b`) |
| Stage 2 | Complete, **manually verified** on real PR with OpenRouter free model |
| Stage 2.5 | **Code implemented** in working tree; apply migration `004` and re-verify |
| Stage 3+ | Not started (stubs only) |

### Critical git reality

As of handoff preparation:

- Remote/local tracked **`main` tip:** Stage 1 commit only.  
- Stage 2 + Stage 2.5 + much UI/API code exist **on disk** and may be **uncommitted/unpushed**.  
- Smoke branches:  
  - `test/stage1-pr-smoke`  
  - `test/stage2-openrouter-smoke`  

**First action for next engineer:** `git status` and commit Stage 2/2.5/docs without secrets.

---

## 2. Current architecture (summary)

Modular Next.js monolith:

- **UI:** App Router dashboard; PR detail hosts `AnalysisPanel`.  
- **Auth:** Supabase + GitHub OAuth.  
- **Data:** Supabase Postgres + RLS; service role for webhooks/analysis writes.  
- **GitHub:** App (Octokit) + webhooks + optional tunnel for live events.  
- **Analysis:** Deterministic collect/classify/filter → AI provider → normalize/Zod → calibrate → persist.  
- **Default AI:** OpenRouter `cohere/north-mini-code:free` (`OPENROUTER_API_KEY`).  

Full detail: `docs/ARCHITECTURE.md`.

---

## 3. Completed work

### Stage 0

- App foundation, design system, auth, schema, dashboard shell.

### Stage 1

- GitHub App install/setup/sync  
- Webhooks + signature verification  
- Repo/PR persistence  
- Dashboard PR list/detail (ingestion)  
- Import PRs without webhooks  

### Stage 2

- `POST /api/analysis/start`, `GET /api/analysis/[id]`  
- Orchestrator + file collection/classification/context  
- OpenRouter provider + Gemini optional + xAI file unused as default  
- Findings persistence + analysis panel UI  
- Real PR analysis succeeded (findings shown, provider openrouter)  

### Stage 2.5 (code present)

- SHA-pinned `compareCommits(base, headSha)`  
- Confidence calibration  
- affectedFiles filtering  
- `duration_ms` + dashboard performance card  
- Structured analysis logs  
- `complete_analysis_atomic` RPC + sequential fallback  

---

## 4. Remaining work (near term)

1. **Git hygiene**  
   - Commit Stage 2 + 2.5 + `docs/`  
   - Ensure `.env.local`, `secrets/*.pem`, screenshots not committed  

2. **Supabase**  
   - Confirm migrations `001`–`004` applied  
   - Especially `003` (findings tables) and `004` (duration + RPC)  

3. **Stage 2.5 verification**  
   - Re-analyze a PR  
   - Confirm duration on analysis card  
   - Confirm confidence values ≤ ~0.95  
   - Confirm failed SHA/API paths mark FAILED cleanly  

4. **Then Stage 3** — task-scope analysis (see ROADMAP)  

---

## 5. Known bugs / sharp edges

| Issue | Notes |
| --- | --- |
| Free model enum sloppiness | Mitigated by `normalize.ts`; still re-check Zod failures |
| Confidence overconfidence | Calibration reduces; free models still imperfect |
| Base UI `nativeButton` warnings | Fixed on PR detail links; other `render={<Link>}` may still warn |
| Windows Defender vs ngrok | Often blocks ngrok; use Import PRs or cloudflared |
| Inline analysis | Long PRs may approach request timeout (`maxDuration` 300s) |
| Analysis on old SHA | Outdated banner if PR head moves; force re-analyze |
| Uncommitted Stage 2 | Risk of loss if not committed |

---

## 6. Technical debt

- No job queue/worker for analysis  
- Scope/impact/risk engine modules are stubs  
- DB types hand-maintained (not generated from Supabase)  
- Large PRs exclude many files from AI budget by design  
- Multiple optional AI providers; default is OpenRouter free only  
- `openai` package used for OpenRouter; Gemini uses `@google/generative-ai`  

---

## 7. Current AI provider

| Setting | Value |
| --- | --- |
| Active default | **OpenRouter** |
| Model | **`cohere/north-mini-code:free`** |
| Factory | `src/lib/analysis/ai/index.ts` → `createDefaultAiProvider()` |
| Abstraction | `AiAnalysisProvider` in `ai/types.ts` |
| Override | `AI_PROVIDER=gemini` + `GEMINI_API_KEY` (optional) |
| Budget rule | **$0** — no paid model fallbacks |

Provider interface:

```ts
interface AiAnalysisProvider {
  readonly name: string;
  isConfigured(): boolean;
  analyzePullRequest(context): Promise<AiAnalysisResult>;
}
```

---

## 8. Environment variables

Copy from `.env.example`. Critical:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_PRIVATE_KEY_PATH=secrets/github-app.pem
GITHUB_APP_WEBHOOK_SECRET=

AI_PROVIDER=openrouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=cohere/north-mini-code:free
```

**Never commit** `.env.local` or PEM files.

---

## 9. Database overview

Core tables: `users`, `github_installations`, `repositories`, `pull_requests`, `analyses`, `analysis_changed_files`, `analysis_findings`, `risk_factors`, `analysis_events`, `webhook_deliveries`.

Analysis is historical: multiple `analyses` rows per PR, unique `(pull_request_id, analysis_version)`, pinned `head_sha`.

---

## 10. Development conventions

- TypeScript strict; avoid `any`.  
- Business logic in `services/` and `lib/`, not in fat route handlers or UI.  
- Prefer deterministic steps before AI.  
- Modular analysis engines for later stages.  
- shadcn/Base UI: if `Button` uses `render={<Link>}`, set `nativeButton={false}`.  
- Structured analysis logs via `logAnalysis` — no secrets.  
- Product thesis: scope/impact/risk for agent PRs, not generic code review theater.  

---

## 11. Branch expectations

| Branch | Purpose |
| --- | --- |
| `main` | Production-ish; currently remote = Stage 1 |
| `test/stage1-pr-smoke` | Stage 1 smoke PR content |
| `test/stage2-openrouter-smoke` | Stage 2 OpenRouter smoke file |

Prefer feature commits on `main` (or short-lived feature branches) for Stage 2/2.5.

---

## 12. Constraints

- **$0 API budget** for AI development.  
- No auto approve/block/merge yet.  
- No Stage 3 scope engine until 2.5 verified.  
- Ngrok optional; Import PRs is the offline path.  
- Windows path/folder name: `Agent-Firewal` (typo) — don’t rename casually.  

---

## 13. Verification status

| Check | Result |
| --- | --- |
| Stage 1 E2E (connect repo, see PR) | Passed (manual) |
| Stage 2 analyze with OpenRouter free model | Passed (manual) — findings UI shown |
| Production `npm run build` | Passed repeatedly during development |
| ESLint | Pass with minor unused-var warnings |
| Stage 2.5 re-verify after migration 004 | **Pending user confirmation** |

---

## 14. Manual testing performed

- GitHub App install + repo connected (including recovery sync)  
- PR create/import; PR appears in dashboard  
- Analyze PR → failed once on category enums → fixed via normalize  
- Re-analyze → completed with structured findings (OpenRouter / north-mini-code:free)  
- Sensitive areas + changed files list rendered  
- Secrets excluded from AI context (e.g. `.env.example` marked excluded)  

---

## 15. Remaining testing

- [ ] Apply/confirm migration `004`  
- [ ] Fresh analysis shows **Duration** and calibrated confidence  
- [ ] Force-push / missing SHA fails analysis cleanly  
- [ ] Persist failure path marks FAILED without orphan findings  
- [ ] Commit Stage 2+2.5+docs and green CI/build on clean clone  
- [ ] Optional: live webhook with tunnel after Windows Defender/ngrok issues  

---

## 16. Stage 2.5 objectives (checklist for next thread)

If anything is incomplete, finish only this list before Stage 3:

1. SHA integrity on all analysis GitHub fetches  
2. Atomic or cleanup-safe persistence  
3. Validate `affectedFiles`  
4. Confidence calibration  
5. Duration metrics on PR + dashboard  
6. Structured logging  
7. Build/lint green  
8. One successful re-analysis after migration  

**Code for most of this already exists.** Focus on verification + commit.

---

## 17. How to run locally (quick)

```powershell
cd C:\Users\fraol\Desktop\Agent-Firewal
# ensure .env.local filled
npm install
npm run dev
```

1. Sign in → Repositories (sync if needed)  
2. Pull requests → Import if needed  
3. Open PR → **Pull request analysis** → **Analyze pull request**  

Analyze button location: **Dashboard → Pull requests → [PR] → scroll to “Pull request analysis”**.

---

## 18. Contacts / artifacts

| Artifact | Path |
| --- | --- |
| Original requirements | `REQUIREMENTS.md` (local gitignored) |
| Env template | `.env.example` |
| README setup | `README.md` |
| This handoff set | `docs/*` |

---

## 19. Explicit non-goals for the next session

Do **not** implement until planned:

- Stage 3 task-scope product UI/engine (beyond stubs)  
- Automatic approval/blocking/merge  
- GitHub status checks product  
- Agent reputation systems  
- Paid AI providers as required path  

---

**Handoff complete.** Continue in a new thread with: *read `docs/HANDOFF_STAGE2.md` and `docs/ROADMAP.md`, verify Stage 2.5, commit Stage 2 work.*
