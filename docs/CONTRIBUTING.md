# Contributing

Thanks for helping improve **Agent PR Firewall**. This is a staged portfolio-grade product, so keep changes focused, reviewable, and consistent with the current stage.

---

## Ground rules

1. **Branch from up-to-date `main`.**
2. **One concern per PR** (docs, auth, API, schema, analysis, UI).
3. **Deterministic analysis before LLM** when extending the pipeline.
4. **Never commit secrets** (`.env.local`, `secrets/*.pem`, private keys, personal PDFs).
5. **Stay on free-tier AI** for baseline paths (`OPENROUTER_MODEL=cohere/north-mini-code:free`).
6. **No silent auto-merge/block** without an explicit Stage 4+ design.
7. **Client components must not import Node/GitHub App server modules.**

### Documentation standards

- Use **Agent PR Firewall** as the product name everywhere.
- Use **Decision Engine** for merge recommendation logic and UI.
- Use **Scope & Consistency Analysis** for the Stage 3 intent/scope feature.
- Keep README, PRD, ROADMAP, ARCHITECTURE, and handoff docs aligned when stage status changes.
- Prefer relative markdown links for cross-document references, and verify them after edits.

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill values
# Apply supabase/migrations 001–004 in Supabase SQL editor
npm run dev
```

See root `README.md` for GitHub App and OpenRouter setup.

### Scripts

```bash
npm run dev
npm run lint
npm run build
```

---

## Documentation checklist

- [ ] README matches the current implementation and roadmap status.
- [ ] PRD language matches the live product stage.
- [ ] ROADMAP stage names and statuses are internally consistent.
- [ ] ARCHITECTURE and DECISION_ENGINE reflect the current pipeline and decision flow.
- [ ] Handoff docs only describe the intended next stage.
- [ ] Links between docs resolve correctly.

---

## Project layout (quick)

| Path                   | Role                       |
| ---------------------- | -------------------------- |
| `src/app/`             | Routes + API               |
| `src/components/`      | UI only                    |
| `src/lib/analysis/`    | Analysis engine            |
| `src/services/`        | Domain workflows           |
| `docs/`                | Product & engineering docs |
| `supabase/migrations/` | Schema                     |

Conventions: TypeScript strict; avoid `any`; thin route handlers; structured analysis logs without secrets.

UI: if a shadcn/Base UI `Button` uses `render={<Link>}`, set `nativeButton={false}`.

When you update the analysis pipeline, update the related docs in the same PR so the stage narrative stays accurate.

---

## Pull request checklist

- [ ] `npm run lint` and `npm run build` pass
- [ ] Scope matches the PR title (avoid drive-by refactors)
- [ ] Docs updated if architecture, stage status, or terminology changed
- [ ] Migrations included if schema changed
- [ ] No secrets or large binaries
- [ ] Manual path tested when touching analysis (see [`TESTING.md`](./TESTING.md))

Useful evaluation branches (reference only): `test/docs-update`, `test/auth-improvement`, `test/database-migration`, `test/dependency-update`, `test/api-refactor`.

---

## Documentation

When you change product behavior, update the relevant file under `docs/`:

| Change             | Update                                      |
| ------------------ | ------------------------------------------- |
| Pipeline / modules | `ARCHITECTURE.md`                           |
| Decision rules     | `DECISION_ENGINE.md`                        |
| Stages             | `ROADMAP.md`                                |
| Requirements       | `PRD.md`                                    |
| Handoff facts      | `HANDOFF_STAGE3.md` (or next stage handoff) |

---

## Security

- Report potential vulnerabilities privately to the repository owner when possible.
- Do not open public issues that include live secrets or private key material.

---

## License

Private / portfolio project unless the owner states otherwise.
