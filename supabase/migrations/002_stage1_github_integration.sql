-- Stage 1: GitHub App integration, connection status, PR ingestion fields

-- ---------------------------------------------------------------------------
-- Installations: status tracking
-- ---------------------------------------------------------------------------
alter table public.github_installations
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted'));

alter table public.github_installations
  add column if not exists target_type text;

alter table public.github_installations
  add column if not exists target_login text;

-- ---------------------------------------------------------------------------
-- Repositories: connection status + sync metadata
-- ---------------------------------------------------------------------------
alter table public.repositories
  add column if not exists connection_status text not null default 'connected'
    check (connection_status in (
      'connected',
      'pending',
      'error',
      'disconnected'
    ));

alter table public.repositories
  add column if not exists connection_error text;

alter table public.repositories
  add column if not exists last_synced_at timestamptz;

alter table public.repositories
  add column if not exists github_installation_id bigint;

create index if not exists repositories_github_installation_id_idx
  on public.repositories (github_installation_id);

create index if not exists repositories_connection_status_idx
  on public.repositories (connection_status);

-- ---------------------------------------------------------------------------
-- Pull requests: richer GitHub metadata for ingestion
-- ---------------------------------------------------------------------------
alter table public.pull_requests
  add column if not exists is_draft boolean not null default false;

alter table public.pull_requests
  add column if not exists merged_at timestamptz;

alter table public.pull_requests
  add column if not exists closed_at timestamptz;

alter table public.pull_requests
  add column if not exists github_created_at timestamptz;

alter table public.pull_requests
  add column if not exists github_updated_at timestamptz;

alter table public.pull_requests
  add column if not exists last_event_action text;

alter table public.pull_requests
  add column if not exists last_ingested_at timestamptz;

-- ---------------------------------------------------------------------------
-- Webhook deliveries (idempotency)
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique,
  event_type text not null,
  action text,
  repository_full_name text,
  processed boolean not null default false,
  error_message text,
  payload_summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_event_type_idx
  on public.webhook_deliveries (event_type);

create index if not exists webhook_deliveries_created_at_idx
  on public.webhook_deliveries (created_at desc);

alter table public.webhook_deliveries enable row level security;

-- No user-facing policies: service role only for webhook deliveries

-- ---------------------------------------------------------------------------
-- Analysis events: allow PR ingestion lifecycle without analysis
-- (event_type already free-form text in stage 0)
-- ---------------------------------------------------------------------------
