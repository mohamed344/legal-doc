-- =====================================================================
-- Commitforce — Dynamic line-item columns for invoices.
--
-- invoices.line_columns: ordered list of column definitions for the
--   invoice's line table. Shape per entry:
--     { id, label, type: 'text'|'number', isTotal?: boolean }
--   A column with isTotal=true is computed per row as the sum of all
--   number columns that are NOT marked isTotal.
--
-- invoice_lines.values: per-row values keyed by column id (string).
--
-- When line_columns is empty, the invoice falls back to the legacy
-- description / qty / unit_price layout.
-- =====================================================================

alter table public.invoices
  add column if not exists line_columns jsonb not null default '[]'::jsonb;

alter table public.invoice_lines
  add column if not exists values jsonb not null default '{}'::jsonb;
