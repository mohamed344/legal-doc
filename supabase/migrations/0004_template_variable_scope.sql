-- =====================================================================
-- Commitforce — template_variables: scope (per_row | batch)
-- =====================================================================
-- Distinguishes variables that vary per generated document (scanned from
-- uploaded data sources) from variables that are fixed across a whole
-- bulk-generation batch (entered once in the review form).

alter table public.template_variables
  add column if not exists scope text not null default 'per_row'
  check (scope in ('per_row', 'batch'));

create index if not exists template_variables_scope_idx
  on public.template_variables(template_id, scope);
