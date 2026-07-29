# Agent PR Firewall — Product Requirements Document

**Version:** 0.3.0
**Status:** Current as of Stage 3 (Scope & Consistency Analysis)
**Handoff:** [`HANDOFF_STAGE3.md`](./HANDOFF_STAGE3.md)

---

## 1. Product vision

**Agent PR Firewall** evaluates pull requests—especially those produced by autonomous coding agents—before humans treat them as trustworthy.

Central question:

> **Did the agent do what it was asked to do, and what else might this change affect?**

It is **not** a generic AI style/quality reviewer. It prioritizes **intent, scope, sensitive areas, and explainable risk**, with a human in the loop.

---

## 2. Problem

Agents can produce valid, test-passing code that is still wrong for merge:

- Out-of-scope edits
- Silent auth / DB / config changes
- Missing companion work (tests, docs, rollbacks)
- Review volume that exceeds human bandwidth

Teams need a durable **scope–impact–risk** layer between agent output and merge.

---

## 3. Goals

1. GitHub identity + repository access + PR events
2. Persist PR activity with idempotent ingestion
3. Analyze changes with structured, historical findings
4. Extract intended task and verify implementation scope
5. Produce explainable merge recommendations (not silent gates)
6. Prefer deterministic steps; use LLMs only for semantic judgment
7. Remain usable on a **$0 AI API budget** for development
8. Stay portfolio-grade and operationally realistic

---

## 4. Non-goals (v0.3.0)

- Full enterprise SIEM / compliance platform
- Competing as a pure code-style AI review product
- Acting as a coding agent that writes application code
- Auto-approve / auto-block / auto-merge on GitHub
- Required paid AI providers
- Premature distributed infrastructure (Kafka, k8s services, etc.)

---

## 5. Users

| Priority  | Audience                                             |
| --------- | ---------------------------------------------------- |
| Primary   | Developers and small teams using IDE/repo agents     |
| Secondary | Maintainers, eng managers, platform/security (later) |

---

## 6. Functional requirements

### 6.1 Auth & account

- Sign in with GitHub via Supabase Auth
- Session-protected dashboard
- Sync app user profile (GitHub id, username, avatar)

### 6.2 Repository connection

- Install GitHub App; persist installation + repos
- Connection status + recovery sync

### 6.3 Pull request ingestion

- Webhooks with HMAC verification
- Idempotent PR upsert
- Manual **Import PRs** when webhooks unavailable
- Dashboard list + detail

### 6.4 Analysis pipeline (Stage 2)

- Manual analyze on PR detail
- Lifecycle: not started → pending → running → completed | failed
- Pin `head_sha`; re-analyze / outdated detection
- Collect diffs; classify; bound context; redact secrets
- Pluggable AI provider; normalize + Zod validate
- Persist analyses, findings, changed files, events

### 6.5 Hardening & trust UX (Stages 2.5–2.6)

- SHA-pinned compare; atomic or cleanup-safe persistence
- Confidence calibration + confidence reasons
- Structured evidence; decision + decision trace
- Risk breakdown; progress steps; optional browser notification
- Stale in-flight job healing (no infinite poll)

### 6.6 Scope & Consistency Analysis (Stage 3)

- Task extraction (title, body, issues, commits, branch)
- PR classification (feature, bug fix, docs, …)
- Scope match / creep / coverage / missing work
- **Scope & Consistency Analysis** UI section
- Scope signals feed merge recommendation

### 6.7 Explicitly later (Stage 4+)

- Policy thresholds product UI
- GitHub Checks / branch protection productization
- Agent feedback comments
- Org multi-seat workspaces

---

## 7. Non-functional requirements

| Area           | Requirement                                              |
| -------------- | -------------------------------------------------------- |
| Architecture   | Modular Next.js monolith                                 |
| Security       | Server-only secrets; webhook HMAC; RLS                   |
| Explainability | Findings + evidence + decision trace                     |
| Cost           | Free-tier AI path; bounded context                       |
| Reliability    | Idempotent webhooks; controlled analysis failures        |
| UX             | Infrastructure aesthetic; PR analysis as primary surface |

---

## 8. Feature status (v0.3.0)

| Area                             | Status              |
| -------------------------------- | ------------------- |
| Landing + design system          | Yes                 |
| GitHub OAuth + App + webhooks    | Yes                 |
| PR list/detail + import          | Yes                 |
| Analysis + OpenRouter free model | Yes                 |
| Decision + trust UX              | Yes                 |
| Scope & Consistency Analysis     | Yes                 |
| Auto merge/block on GitHub       | No                  |
| Job queue for analysis           | No (inline request) |

---

## 9. Success criteria

A developer can:

1. Sign in with GitHub
2. Connect a repository via the App
3. See real PRs
4. Run analysis on a pinned commit
5. Read Decision Engine, Scope & Consistency Analysis, and findings in seconds
6. Re-run when the PR advances

The product must **never** claim perfect safety; it improves review quality and agent accountability.

---

## 10. Related docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`ROADMAP.md`](./ROADMAP.md)
- [`DECISION_ENGINE.md`](./DECISION_ENGINE.md)
- [`TESTING.md`](./TESTING.md)
