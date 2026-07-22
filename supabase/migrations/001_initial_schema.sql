-- Agent PR Firewall — Stage 0 initial schema
-- Source of truth aligned with REQUIREMENTS.md §21

-- Extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users (application profile linked to Supabase auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  github_user_id bigint not null unique,
  username text not null,
  display_name text,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_username_idx on public.users (username);

-- ---------------------------------------------------------------------------
-- GitHub App installations
-- ---------------------------------------------------------------------------
create table if not exists public.github_installations (
  id uuid primary key default gen_random_uuid(),
  installation_id bigint not null unique,
  account_login text not null,
  account_type text not null,
  account_id bigint not null,
  suspended_at timestamptz,
  connected_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists github_installations_account_login_idx
  on public.github_installations (account_login);

-- ---------------------------------------------------------------------------
-- Connected repositories
-- ---------------------------------------------------------------------------
create table if not exists public.repositories (
  id uuid primary key default gen_random_uuid(),
  github_repository_id bigint not null unique,
  owner text not null,
  name text not null,
  full_name text not null,
  default_branch text not null default 'main',
  installation_id uuid references public.github_installations (id) on delete set null,
  connected_by_user_id uuid not null references public.users (id) on delete cascade,
  is_active boolean not null default true,
  html_url text,
  private boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repositories_connected_by_user_id_idx
  on public.repositories (connected_by_user_id);
create index if not exists repositories_full_name_idx
  on public.repositories (full_name);

-- ---------------------------------------------------------------------------
-- Pull requests
-- ---------------------------------------------------------------------------
create table if not exists public.pull_requests (
  id uuid primary key default gen_random_uuid(),
  github_pr_id bigint not null,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  number integer not null,
  title text not null,
  description text,
  author_login text not null,
  author_avatar_url text,
  source_branch text not null,
  target_branch text not null,
  status text not null default 'open'
    check (status in ('open', 'closed', 'merged', 'draft')),
  head_sha text,
  html_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repository_id, number),
  unique (github_pr_id)
);

create index if not exists pull_requests_repository_id_idx
  on public.pull_requests (repository_id);
create index if not exists pull_requests_status_idx
  on public.pull_requests (status);

-- ---------------------------------------------------------------------------
-- Tasks (intended agent work)
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  pull_request_id uuid not null references public.pull_requests (id) on delete cascade,
  source_type text not null
    check (source_type in (
      'issue_title',
      'issue_description',
      'pr_title',
      'pr_description',
      'manual'
    )),
  title text,
  description text,
  extracted_content text not null,
  created_at timestamptz not null default now()
);

create index if not exists tasks_pull_request_id_idx
  on public.tasks (pull_request_id);

-- ---------------------------------------------------------------------------
-- Analyses (historical runs per PR)
-- ---------------------------------------------------------------------------
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  pull_request_id uuid not null references public.pull_requests (id) on delete cascade,
  analysis_version integer not null default 1,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  risk_score integer,
  risk_classification text
    check (risk_classification is null or risk_classification in (
      'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    )),
  scope_score integer,
  scope_classification text
    check (scope_classification is null or scope_classification in (
      'HIGH_COMPLIANCE', 'PARTIAL', 'LOW_COMPLIANCE', 'UNKNOWN'
    )),
  impact_classification text
    check (impact_classification is null or impact_classification in (
      'LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'
    )),
  final_decision text
    check (final_decision is null or final_decision in (
      'LOW', 'REVIEW_RECOMMENDED', 'REVIEW_REQUIRED', 'BLOCKED'
    )),
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pull_request_id, analysis_version)
);

create index if not exists analyses_pull_request_id_idx
  on public.analyses (pull_request_id);
create index if not exists analyses_final_decision_idx
  on public.analyses (final_decision);

-- ---------------------------------------------------------------------------
-- Risk factors (explainable risk contributions)
-- ---------------------------------------------------------------------------
create table if not exists public.risk_factors (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  category text not null,
  severity text not null
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  score_contribution integer not null default 0,
  title text not null,
  description text not null,
  source_file text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists risk_factors_analysis_id_idx
  on public.risk_factors (analysis_id);

-- ---------------------------------------------------------------------------
-- Affected areas (blast radius / impact)
-- ---------------------------------------------------------------------------
create table if not exists public.affected_areas (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  file_path text not null,
  affected_area text not null,
  impact_type text not null,
  confidence numeric(4, 3),
  explanation text,
  created_at timestamptz not null default now()
);

create index if not exists affected_areas_analysis_id_idx
  on public.affected_areas (analysis_id);

-- ---------------------------------------------------------------------------
-- Analysis events (lifecycle history)
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_events (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.analyses (id) on delete cascade,
  pull_request_id uuid references public.pull_requests (id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analysis_events_analysis_id_idx
  on public.analysis_events (analysis_id);
create index if not exists analysis_events_pull_request_id_idx
  on public.analysis_events (pull_request_id);

-- ---------------------------------------------------------------------------
-- Policy configurations (thresholds; used from Stage 4+)
-- ---------------------------------------------------------------------------
create table if not exists public.policy_configurations (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid references public.repositories (id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists policy_configurations_repository_id_idx
  on public.policy_configurations (repository_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists github_installations_set_updated_at on public.github_installations;
create trigger github_installations_set_updated_at
  before update on public.github_installations
  for each row execute function public.set_updated_at();

drop trigger if exists repositories_set_updated_at on public.repositories;
create trigger repositories_set_updated_at
  before update on public.repositories
  for each row execute function public.set_updated_at();

drop trigger if exists pull_requests_set_updated_at on public.pull_requests;
create trigger pull_requests_set_updated_at
  before update on public.pull_requests
  for each row execute function public.set_updated_at();

drop trigger if exists policy_configurations_set_updated_at on public.policy_configurations;
create trigger policy_configurations_set_updated_at
  before update on public.policy_configurations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.github_installations enable row level security;
alter table public.repositories enable row level security;
alter table public.pull_requests enable row level security;
alter table public.tasks enable row level security;
alter table public.analyses enable row level security;
alter table public.risk_factors enable row level security;
alter table public.affected_areas enable row level security;
alter table public.analysis_events enable row level security;
alter table public.policy_configurations enable row level security;

-- Users: read/update own profile
create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "users_insert_own"
  on public.users for insert
  with check (auth.uid() = id);

-- Installations: users see those they connected
create policy "installations_select_own"
  on public.github_installations for select
  using (connected_by_user_id = auth.uid());

create policy "installations_insert_own"
  on public.github_installations for insert
  with check (connected_by_user_id = auth.uid());

create policy "installations_update_own"
  on public.github_installations for update
  using (connected_by_user_id = auth.uid())
  with check (connected_by_user_id = auth.uid());

-- Repositories: access for connector
create policy "repositories_select_own"
  on public.repositories for select
  using (connected_by_user_id = auth.uid());

create policy "repositories_insert_own"
  on public.repositories for insert
  with check (connected_by_user_id = auth.uid());

create policy "repositories_update_own"
  on public.repositories for update
  using (connected_by_user_id = auth.uid())
  with check (connected_by_user_id = auth.uid());

create policy "repositories_delete_own"
  on public.repositories for delete
  using (connected_by_user_id = auth.uid());

-- Helper: repository ownership check
create or replace function public.user_owns_repository(repo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.repositories r
    where r.id = repo_id
      and r.connected_by_user_id = auth.uid()
  );
$$;

-- Pull requests via repository ownership
create policy "pull_requests_select_own"
  on public.pull_requests for select
  using (public.user_owns_repository(repository_id));

create policy "pull_requests_insert_own"
  on public.pull_requests for insert
  with check (public.user_owns_repository(repository_id));

create policy "pull_requests_update_own"
  on public.pull_requests for update
  using (public.user_owns_repository(repository_id))
  with check (public.user_owns_repository(repository_id));

-- Tasks via PR ownership
create policy "tasks_select_own"
  on public.tasks for select
  using (
    exists (
      select 1 from public.pull_requests pr
      where pr.id = pull_request_id
        and public.user_owns_repository(pr.repository_id)
    )
  );

create policy "tasks_insert_own"
  on public.tasks for insert
  with check (
    exists (
      select 1 from public.pull_requests pr
      where pr.id = pull_request_id
        and public.user_owns_repository(pr.repository_id)
    )
  );

-- Analyses via PR ownership
create policy "analyses_select_own"
  on public.analyses for select
  using (
    exists (
      select 1 from public.pull_requests pr
      where pr.id = pull_request_id
        and public.user_owns_repository(pr.repository_id)
    )
  );

create policy "analyses_insert_own"
  on public.analyses for insert
  with check (
    exists (
      select 1 from public.pull_requests pr
      where pr.id = pull_request_id
        and public.user_owns_repository(pr.repository_id)
    )
  );

create policy "analyses_update_own"
  on public.analyses for update
  using (
    exists (
      select 1 from public.pull_requests pr
      where pr.id = pull_request_id
        and public.user_owns_repository(pr.repository_id)
    )
  )
  with check (
    exists (
      select 1 from public.pull_requests pr
      where pr.id = pull_request_id
        and public.user_owns_repository(pr.repository_id)
    )
  );

-- Risk factors / affected areas / events via analysis ownership
create policy "risk_factors_select_own"
  on public.risk_factors for select
  using (
    exists (
      select 1
      from public.analyses a
      join public.pull_requests pr on pr.id = a.pull_request_id
      where a.id = analysis_id
        and public.user_owns_repository(pr.repository_id)
    )
  );

create policy "affected_areas_select_own"
  on public.affected_areas for select
  using (
    exists (
      select 1
      from public.analyses a
      join public.pull_requests pr on pr.id = a.pull_request_id
      where a.id = analysis_id
        and public.user_owns_repository(pr.repository_id)
    )
  );

create policy "analysis_events_select_own"
  on public.analysis_events for select
  using (
    (
      analysis_id is not null
      and exists (
        select 1
        from public.analyses a
        join public.pull_requests pr on pr.id = a.pull_request_id
        where a.id = analysis_id
          and public.user_owns_repository(pr.repository_id)
      )
    )
    or (
      pull_request_id is not null
      and exists (
        select 1 from public.pull_requests pr
        where pr.id = pull_request_id
          and public.user_owns_repository(pr.repository_id)
      )
    )
  );

-- Policies: repository-scoped or user-created
create policy "policy_configurations_select_own"
  on public.policy_configurations for select
  using (
    created_by_user_id = auth.uid()
    or (repository_id is not null and public.user_owns_repository(repository_id))
  );

create policy "policy_configurations_insert_own"
  on public.policy_configurations for insert
  with check (
    created_by_user_id = auth.uid()
    and (
      repository_id is null
      or public.user_owns_repository(repository_id)
    )
  );

create policy "policy_configurations_update_own"
  on public.policy_configurations for update
  using (created_by_user_id = auth.uid())
  with check (created_by_user_id = auth.uid());
