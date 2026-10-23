-- Stage 2.5: analysis duration metrics + atomic completion helper

alter table public.analyses
  add column if not exists duration_ms integer;

comment on column public.analyses.duration_ms is
  'Wall-clock analysis duration in milliseconds (completed analyses only).';

-- Atomic completion: children inserts + analysis update in one transaction.
-- Called from the service role. Cleans any partial children first.
create or replace function public.complete_analysis_atomic(
  p_analysis_id uuid,
  p_pull_request_id uuid,
  p_head_sha text,
  p_summary text,
  p_overall_status text,
  p_files_changed integer,
  p_lines_added integer,
  p_lines_deleted integer,
  p_provider text,
  p_model text,
  p_deterministic_result jsonb,
  p_context_stats jsonb,
  p_risk_classification text,
  p_duration_ms integer,
  p_changed_files jsonb,
  p_findings jsonb,
  p_risk_factors jsonb,
  p_event_message text,
  p_event_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ensure we only complete the intended analysis version/SHA.
  if not exists (
    select 1
    from public.analyses a
    where a.id = p_analysis_id
      and a.pull_request_id = p_pull_request_id
      and a.head_sha = p_head_sha
      and a.status in ('pending', 'running')
  ) then
    raise exception 'analysis_not_completable';
  end if;

  delete from public.analysis_changed_files where analysis_id = p_analysis_id;
  delete from public.analysis_findings where analysis_id = p_analysis_id;
  delete from public.risk_factors where analysis_id = p_analysis_id;

  if p_changed_files is not null and jsonb_array_length(p_changed_files) > 0 then
    insert into public.analysis_changed_files (
      analysis_id,
      path,
      previous_path,
      status,
      additions,
      deletions,
      category,
      is_binary,
      excluded_from_ai,
      exclude_reason,
      patch_excerpt
    )
    select
      p_analysis_id,
      f->>'path',
      nullif(f->>'previous_path', ''),
      f->>'status',
      coalesce((f->>'additions')::integer, 0),
      coalesce((f->>'deletions')::integer, 0),
      coalesce(f->>'category', 'unknown'),
      coalesce((f->>'is_binary')::boolean, false),
      coalesce((f->>'excluded_from_ai')::boolean, false),
      nullif(f->>'exclude_reason', ''),
      nullif(f->>'patch_excerpt', '')
    from jsonb_array_elements(p_changed_files) as f;
  end if;

  if p_findings is not null and jsonb_array_length(p_findings) > 0 then
    insert into public.analysis_findings (
      analysis_id,
      category,
      severity,
      title,
      summary,
      explanation,
      evidence,
      affected_files,
      confidence,
      is_inference,
      sort_order
    )
    select
      p_analysis_id,
      f->>'category',
      f->>'severity',
      f->>'title',
      f->>'summary',
      f->>'explanation',
      nullif(f->>'evidence', ''),
      coalesce(f->'affected_files', '[]'::jsonb),
      case
        when f->>'confidence' is null or f->>'confidence' = '' then null
        else (f->>'confidence')::numeric
      end,
      coalesce((f->>'is_inference')::boolean, true),
      coalesce((f->>'sort_order')::integer, 0)
    from jsonb_array_elements(p_findings) as f;
  end if;

  if p_risk_factors is not null and jsonb_array_length(p_risk_factors) > 0 then
    insert into public.risk_factors (
      analysis_id,
      category,
      severity,
      score_contribution,
      title,
      description,
      source_file,
      metadata
    )
    select
      p_analysis_id,
      r->>'category',
      r->>'severity',
      coalesce((r->>'score_contribution')::integer, 0),
      r->>'title',
      r->>'description',
      nullif(r->>'source_file', ''),
      coalesce(r->'metadata', '{}'::jsonb)
    from jsonb_array_elements(p_risk_factors) as r;
  end if;

  update public.analyses
  set
    status = 'completed',
    completed_at = now(),
    duration_ms = p_duration_ms,
    summary = p_summary,
    overall_status = p_overall_status,
    files_changed = p_files_changed,
    lines_added = p_lines_added,
    lines_deleted = p_lines_deleted,
    provider = p_provider,
    model = p_model,
    deterministic_result = p_deterministic_result,
    context_stats = p_context_stats,
    error_message = null,
    risk_classification = p_risk_classification
  where id = p_analysis_id
    and head_sha = p_head_sha;

  if not found then
    raise exception 'analysis_update_failed';
  end if;

  insert into public.analysis_events (
    analysis_id,
    pull_request_id,
    event_type,
    message,
    metadata
  ) values (
    p_analysis_id,
    p_pull_request_id,
    'analysis_completed',
    p_event_message,
    coalesce(p_event_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.complete_analysis_atomic from public;
grant execute on function public.complete_analysis_atomic to service_role;
