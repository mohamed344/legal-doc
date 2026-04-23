-- =====================================================================
-- Commitforce — Storage bucket + archive columns
-- =====================================================================

-- ---------------------------------------------------------------------
-- Archive flag on documents
-- ---------------------------------------------------------------------
alter table public.documents
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;
create index if not exists documents_archived_idx on public.documents(is_archived);

-- ---------------------------------------------------------------------
-- Archive flag on invoices
-- ---------------------------------------------------------------------
alter table public.invoices
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;
create index if not exists invoices_archived_idx on public.invoices(is_archived);

-- ---------------------------------------------------------------------
-- Storage bucket for uploaded files used by the AI prefill flow
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('document-imports', 'document-imports', false)
on conflict (id) do nothing;

-- Authenticated users may upload into their own uid-prefixed folder.
drop policy if exists document_imports_insert on storage.objects;
create policy document_imports_insert on storage.objects for insert
  with check (
    bucket_id = 'document-imports'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own uploads; admins can read any.
drop policy if exists document_imports_select on storage.objects;
create policy document_imports_select on storage.objects for select
  using (
    bucket_id = 'document-imports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_role() = 'admin'
    )
  );

drop policy if exists document_imports_delete on storage.objects;
create policy document_imports_delete on storage.objects for delete
  using (
    bucket_id = 'document-imports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_role() = 'admin'
    )
  );
