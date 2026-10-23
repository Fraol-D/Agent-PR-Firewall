-- Stage 4 / impact: extend complete_analysis_atomic so final_decision,
-- risk/scope/impact scores, and affected_areas commit in the same transaction
-- as findings (avoids partial completes when follow-up updates fail).
--
-- NOTE: Adding parameters creates a NEW overload in Postgres; CREATE OR REPLACE
-- cannot change the argument list. Drop all prior signatures first.

-- Old Stage 2.5 signature (20 args, no Stage 4 fields)
drop function if exists public.complete_analysis_atomic(
  uuid, uuid, text, text, text,
  integer, integer, integer,
  text, text, jsonb, jsonb, text, integer,
  jsonb, jsonb, jsonb, text, jsonb
);

-- New Stage 4 signature (26 args) if a previous failed/partial run created it
drop function if exists public.complete_analysis_atomic(
  uuid, uuid, text, text, text,
  integer, integer, integer,
  text, text, jsonb, jsonb, text, integer,
  jsonb, jsonb, jsonb, text, jsonb,
  integer, integer, text, text, text, jsonb
);

create function public.complete_analysis_atomic(
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
  p_event_metadata jsonb,
  -- Stage 3/4 fields (optional for older callers; default null)
  p_risk_score integer default null,
  p_scope_score integer default null,
  p_scope_classification text default null,
  p_impact_classification text default null,
  p_final_decision text default null,
  p_affected_areas jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
  delete from public.affected_areas where analysis_id = p_analysis_id;

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

  if p_affected_areas is not null and jsonb_array_length(p_affected_areas) > 0 then
    insert into public.affected_areas (
      analysis_id,
      file_path,
      affected_area,
      impact_type,
      confidence,
      explanation
    )
    select
      p_analysis_id,
      a->>'file_path',
      a->>'affected_area',
      a->>'impact_type',
      case
        when a->>'confidence' is null or a->>'confidence' = '' then null
        else (a->>'confidence')::numeric
      end,
      nullif(a->>'explanation', '')
    from jsonb_array_elements(p_affected_areas) as a;
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
    risk_classification = p_risk_classification,
    risk_score = coalesce(p_risk_score, risk_score),
    scope_score = coalesce(p_scope_score, scope_score),
    scope_classification = coalesce(p_scope_classification, scope_classification),
    impact_classification = coalesce(p_impact_classification, impact_classification),
    final_decision = coalesce(p_final_decision, final_decision)
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

-- GRANT/REVOKE must use the full signature when overloads may exist
revoke all on function public.complete_analysis_atomic(
  uuid, uuid, text, text, text,
  integer, integer, integer,
  text, text, jsonb, jsonb, text, integer,
  jsonb, jsonb, jsonb, text, jsonb,
  integer, integer, text, text, text, jsonb
) from public;

grant execute on function public.complete_analysis_atomic(
  uuid, uuid, text, text, text,
  integer, integer, integer,
  text, text, jsonb, jsonb, text, integer,
  jsonb, jsonb, jsonb, text, jsonb,
  integer, integer, text, text, text, jsonb
) to service_role;
