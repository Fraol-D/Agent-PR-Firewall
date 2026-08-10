-- Stage 2: PR analysis pipeline extensions

-- ---------------------------------------------------------------------------
-- Analyses: commit-aware lifecycle + deterministic/AI summaries
-- ---------------------------------------------------------------------------
alter table public.analyses
  add column if not exists head_sha text;

alter table public.analyses
  add column if not exists overall_status text
    check (
      overall_status is null
      or overall_status in (
        'no_significant_concerns',
        'review_recommended',
        'high_risk_concerns'
      )
    );

alter table public.analyses
  add column if not exists error_message text;

alter table public.analyses
  add column if not exists files_changed integer;

alter table public.analyses
  add column if not exists lines_added integer;

alter table public.analyses
  add column if not exists lines_deleted integer;

alter table public.analyses
  add column if not exists provider text;

alter table public.analyses
  add column if not exists model text;

alter table public.analyses
  add column if not exists deterministic_result jsonb;

alter table public.analyses
  add column if not exists context_stats jsonb;

-- Allow 'queued' as alias path: keep pending as queued for Stage 2 UI
-- status already: pending | running | completed | failed | cancelled

create index if not exists analyses_head_sha_idx
  on public.analyses (pull_request_id, head_sha);

-- ---------------------------------------------------------------------------
-- Changed files captured per analysis (deterministic)
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_changed_files (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  path text not null,
  previous_path text,
  status text not null
    check (status in ('added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged')),
  additions integer not null default 0,
  deletions integer not null default 0,
  category text not null default 'unknown',
  is_binary boolean not null default false,
  excluded_from_ai boolean not null default false,
  exclude_reason text,
  patch_excerpt text,
  created_at timestamptz not null default now()
);

create index if not exists analysis_changed_files_analysis_id_idx
  on public.analysis_changed_files (analysis_id);

-- ---------------------------------------------------------------------------
-- Structured findings (Stage 2 evidence-backed)
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_findings (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  category text not null,
  severity text not null
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  title text not null,
  summary text not null,
  explanation text not null,
  evidence text,
  affected_files jsonb not null default '[]'::jsonb,
  confidence numeric(4, 3),
  is_inference boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists analysis_findings_analysis_id_idx
  on public.analysis_findings (analysis_id);
create index if not exists analysis_findings_severity_idx
  on public.analysis_findings (severity);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.analysis_changed_files enable row level security;
alter table public.analysis_findings enable row level security;

create policy "analysis_changed_files_select_own"
  on public.analysis_changed_files for select
  using (
    exists (
      select 1
      from public.analyses a
      join public.pull_requests pr on pr.id = a.pull_request_id
      where a.id = analysis_id
        and public.user_owns_repository(pr.repository_id)
    )
  );

create policy "analysis_findings_select_own"
  on public.analysis_findings for select
  using (
    exists (
      select 1
      from public.analyses a
      join public.pull_requests pr on pr.id = a.pull_request_id
      where a.id = analysis_id
        and public.user_owns_repository(pr.repository_id)
    )
  );

-- Service role writes findings/files; users select via RLS
