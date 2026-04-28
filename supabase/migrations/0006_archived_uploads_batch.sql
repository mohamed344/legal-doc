-- =====================================================================
-- Commitforce — archived_uploads.batch_id
-- Adds a nullable batch_id so multiple files uploaded together under one
-- "archive name" can be tracked as a single group.
-- Existing rows stay batch_id IS NULL and continue to render as flat rows.
-- =====================================================================

alter table public.archived_uploads add column if not exists batch_id uuid;

create index if not exists archived_uploads_batch_idx
  on public.archived_uploads(batch_id)
  where batch_id is not null;
