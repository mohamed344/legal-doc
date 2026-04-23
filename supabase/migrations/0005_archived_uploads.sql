-- =====================================================================
-- Commitforce — archived_uploads
-- Table holding manually uploaded legacy files archived via the archives
-- page. File bytes live in the existing document-imports storage bucket;
-- this row stores the metadata + extracted variables.
-- =====================================================================

create table if not exists public.archived_uploads (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.templates(id) on delete set null,
  name text not null,
  file_path text not null,
  file_name text not null,
  file_mime_type text,
  file_size integer,
  extracted_data jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  archived_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists archived_uploads_created_by_idx on public.archived_uploads(created_by);
create index if not exists archived_uploads_template_idx on public.archived_uploads(template_id);
create index if not exists archived_uploads_archived_at_idx on public.archived_uploads(archived_at desc);

alter table public.archived_uploads enable row level security;

drop policy if exists archived_uploads_admin_all on public.archived_uploads;
create policy archived_uploads_admin_all on public.archived_uploads for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists archived_uploads_self_read on public.archived_uploads;
create policy archived_uploads_self_read on public.archived_uploads for select
  using (created_by = auth.uid());
