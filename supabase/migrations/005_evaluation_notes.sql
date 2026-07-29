-- Test / evaluation: optional human notes on an analysis run.
-- Nullable so existing rows and the Stage 2 pipeline remain unchanged.

alter table public.analyses
  add column if not exists evaluation_notes text;

comment on column public.analyses.evaluation_notes is
  'Optional free-text notes for analysis evaluation / review (nullable).';
