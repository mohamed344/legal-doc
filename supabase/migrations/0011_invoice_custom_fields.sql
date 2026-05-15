-- =====================================================================
-- Commitforce — User-defined custom fields on invoices.
--
-- Each entry in custom_fields has the shape:
--   { id, label, value, type: 'text'|'number'|'date',
--     display: 'inline'|'block'|'table' }
-- Stored in declared order; UI renders inline fields side-by-side,
-- block fields stacked, and table fields as a 2-column key/value table.
-- =====================================================================

alter table public.invoices
  add column if not exists custom_fields jsonb not null default '[]'::jsonb;
