# Agent PR Firewall — Product Requirements Document

**Document status:** Current as of Stage 2 (+ hardening code in tree)  
**Product type:** Portfolio-grade GitHub-native developer tool with path to a real product  
**Primary source of truth (original):** `REQUIREMENTS.md` (local, gitignored)  
**Implementation handoff:** See `docs/HANDOFF_STAGE2.md`

---

## 1. Product vision

**Agent PR Firewall** is a GitHub-native system that evaluates pull requests created or modified by autonomous coding agents before those changes are trusted.

It is not primarily a generic AI code reviewer. Its central question:

> **Did the coding agent do what it was asked to do, and what else might this change affect?**

The product improves human understanding of agent-generated change: scope, impact, security-sensitive areas, and explainable risk—without becoming an autonomous merge gate in early stages.

---

## 2. Problem statement

AI coding agents can:

- Read repositories, modify code, run commands and tests  
- Open branches and pull requests  
- Iterate on review feedback  

An agent can produce code that is syntactically valid, tests-passing, and still wrong in a broader sense: out-of-scope edits, auth/DB/payment touch, missing tests, large blast radius.

Humans cannot manually re-read every agent PR at agent speed. Teams need a **scope, impact, and risk layer** between agent output and merge trust.

---

## 3. Goals

1. Integrate with GitHub (user identity + repository access + PR events).  
2. Detect and store relevant pull request activity.  
3. Analyze changes made by coding agents (and any PR) with explainable findings.  
4. Identify potentially affected / sensitive areas.  
5. Support comparison of intended task vs actual changes (Stage 3+).  
6. Produce structured, persisted, historical analysis results.  
7. Support human-in-the-loop review (no silent auto-merge in early stages).  
8. Remain impressive as a portfolio project with realistic architecture.  
9. Prefer deterministic analysis where possible; use LLMs for semantic judgment only.  
10. Stay usable on a **$0 API budget** for development (free-tier models only).

---

## 4. Non-goals (current product)

The product must **not** (yet / by design in early stages):

- Compete as a general AI code review platform focused on style/quality alone  
- Write code as an autonomous coding agent  
- Provide full enterprise security / SIEM / compliance platform  
- Automatically deploy to production  
- Require premature distributed infrastructure (Kafka, k8s microservices, etc.)  
- Automatically approve, block, or merge PRs without later deliberate product stages  
- Depend on paid AI credits for baseline development

---

## 5. Users

### Primary

Individual developers and small engineering teams who use AI coding agents (IDE agents, repo agents, custom internal agents).

### Secondary (future)

Startup teams, open-source maintainers, engineering managers, security/platform engineers, orgs deploying agents at scale.

---

## 6. Functional requirements

### 6.1 Authentication & account

- Sign in with GitHub via Supabase Auth (OAuth).  
- Maintain authenticated session for protected dashboard routes.  
- Sync application user profile (GitHub id, username, avatar).

### 6.2 Repository connection

- Install a GitHub App on selected repositories.  
- Return to the app and persist installations/repositories.  
- Show connection status (connected / pending / error / disconnected).  
- Recovery: sync existing installations if setup redirect fails.

### 6.3 Pull request ingestion

- Receive GitHub webhooks with signature verification.  
- Handle PR opened / synchronize / reopened / closed (and related safe actions).  
- Persist PR metadata uniquely (no duplicate rows on redelivery).  
- List and detail PRs in the dashboard.  
- Manual import of PRs via GitHub API when webhooks are unavailable.

### 6.4 Analysis (Stage 2)

- Manual **Analyze pull request** on PR detail.  
- Analysis lifecycle: not started → queued/pending → running → completed | failed.  
- Capture and pin **head SHA** for the analysis version.  
- Collect changed files/diffs; classify files deterministically.  
- Build bounded analysis context (exclude secrets, lockfiles, binaries, oversized patches).  
- Call pluggable AI provider for structured findings.  
- Validate AI output (normalize + Zod).  
- Persist analysis, findings, changed files, events.  
- Support re-analysis and mark outdated when head SHA changes.  
- Display summary, severity breakdown, findings, evidence, changed files.

### 6.5 Hardening (Stage 2.5 — code in tree)

- SHA-pinned GitHub compare for analysis integrity.  
- Atomic (or cleanup-safe) persistence of analysis results.  
- Filter hallucinated `affectedFiles`.  
- Calibrate confidence scores.  
- Record/display analysis duration; dashboard performance summary.  
- Structured server logs for analysis pipeline stages.

### 6.6 Explicitly not required yet (Stage 3+)

- Task-scope compliance engine as product differentiator  
- Decision engine (LOW / REVIEW_* / BLOCKED) with policy thresholds  
- Agent feedback loop (comments/checks to agent)  
- Automatic approval/blocking/merge  
- GitHub status checks / branch protection productization  

---

## 7. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Architecture | Modular monolith (Next.js); no unnecessary microservices |
| Security | Min permissions; secrets server-side; webhook HMAC; RLS on user data |
| Explainability | Findings with evidence; no opaque single score as sole output |
| Cost | Free-tier AI for dev; bounded context; no paid model fallbacks |
| Reliability | Idempotent webhooks; controlled analysis failures; retry UX |
| UX | Developer-infrastructure aesthetic; PR analysis page is primary surface |
| Portability | AI provider abstraction so models/providers can change |

---

## 8. Current feature set (implemented)

| Area | Status |
| --- | --- |
| Landing + design system | Yes |
| GitHub OAuth (Supabase) | Yes |
| Protected dashboard shell | Yes |
| GitHub App install / setup / sync | Yes |
| Webhooks + PR persistence | Yes |
| PR list + detail | Yes |
| Manual analysis + OpenRouter free model | Yes (local Stage 2 code) |
| Findings UI | Yes |
| Hardening (SHA, atomic persist, confidence, metrics, logs) | Yes (code in tree; verify migration 004) |

---

## 9. Future feature roadmap

See `docs/ROADMAP.md` for staged detail.

High level:

1. **Stage 3** — Task-scope analysis (intended work vs actual changes)  
2. **Stage 4** — Decision engine (explainable recommend/block)  
3. **Stage 5** — Agent feedback loop  
4. **Stage 6** — Portfolio polish, docs, demo  

---

## 10. Success criteria (product)

A developer can:

1. Sign in with GitHub.  
2. Connect a repository via the GitHub App.  
3. See real PRs from that repository.  
4. Run an analysis on a specific commit.  
5. Read structured, persisted findings that aid review.  
6. Re-run analysis when the PR moves forward.

The product must never claim perfect safety; it improves review quality and agent accountability.
