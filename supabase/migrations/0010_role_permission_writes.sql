-- =====================================================================
-- Commitforce — Honour role_permissions on writes.
--
-- Migration 0008 collapsed the role enum into a binary is_admin flag
-- and made every write policy admin-only. The role_permissions table
-- (page, action) was already wired into templates_read but never into
-- the write paths, so a non-admin role granted "templates.create"
-- still hit "new row violates row-level security policy" on insert.
--
-- This migration adds a has_permission(page, action) helper and
-- rewrites the affected write policies to allow either admins or
-- callers whose role has the matching grant.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Helper: does the calling user's role have (page, action)?
-- ---------------------------------------------------------------------
create or replace function public.has_permission(p_page text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.role_permissions rp
    join public.users u on u.role_id = rp.role_id
    where u.user_id = auth.uid()
      and rp.page = p_page
      and rp.action = p_action
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Rewrite write policies to honour role_permissions.
-- ---------------------------------------------------------------------
do $$
begin
  -- templates: write/update/delete gated by templates.{create,update,delete}
  if to_regclass('public.templates') is not null then
    drop policy if exists templates_write on public.templates;
    create policy templates_write on public.templates for insert
      with check (
        public.is_admin()
        or public.has_permission('templates', 'create')
      );

    drop policy if exists templates_update on public.templates;
    create policy templates_update on public.templates for update
      using (
        public.is_admin()
        or public.has_permission('templates', 'update')
      )
      with check (
        public.is_admin()
        or public.has_permission('templates', 'update')
      );

    drop policy if exists templates_delete on public.templates;
    create policy templates_delete on public.templates for delete
      using (
        public.is_admin()
        or public.has_permission('templates', 'delete')
      );
  end if;

  -- template_variables: tied to the templates page (no separate UI page).
  if to_regclass('public.template_variables') is not null then
    drop policy if exists tv_write on public.template_variables;
    create policy tv_write on public.template_variables for all
      using (
        public.is_admin()
        or public.has_permission('templates', 'update')
      )
      with check (
        public.is_admin()
        or public.has_permission('templates', 'update')
      );
  end if;

  -- clients: split the old "for all" policy so each action is gated
  -- by the matching grant.
  if to_regclass('public.clients') is not null then
    drop policy if exists clients_write on public.clients;

    drop policy if exists clients_insert on public.clients;
    create policy clients_insert on public.clients for insert
      with check (
        public.is_admin()
        or public.has_permission('clients', 'create')
      );

    drop policy if exists clients_update on public.clients;
    create policy clients_update on public.clients for update
      using (
        public.is_admin()
        or public.has_permission('clients', 'update')
      )
      with check (
        public.is_admin()
        or public.has_permission('clients', 'update')
      );

    drop policy if exists clients_delete on public.clients;
    create policy clients_delete on public.clients for delete
      using (
        public.is_admin()
        or public.has_permission('clients', 'delete')
      );
  end if;

  -- documents: delete was admin-only; allow the row's creator and
  -- holders of documents.delete to remove their own work too.
  if to_regclass('public.documents') is not null then
    drop policy if exists documents_delete on public.documents;
    create policy documents_delete on public.documents for delete
      using (
        public.is_admin()
        or public.has_permission('documents', 'delete')
        or created_by = auth.uid()
      );
  end if;

  -- archived_uploads: split the "for all" policy. SELECT keeps the
  -- existing "own rows" fallback (archived_uploads_self_read) and
  -- adds an archives.read grant; writes use archives.{create,update,delete}.
  if to_regclass('public.archived_uploads') is not null then
    drop policy if exists archived_uploads_admin_all on public.archived_uploads;

    drop policy if exists archived_uploads_read on public.archived_uploads;
    create policy archived_uploads_read on public.archived_uploads for select
      using (
        public.is_admin()
        or public.has_permission('archives', 'read')
        or created_by = auth.uid()
      );

    drop policy if exists archived_uploads_insert on public.archived_uploads;
    create policy archived_uploads_insert on public.archived_uploads for insert
      with check (
        (
          public.is_admin()
          or public.has_permission('archives', 'create')
        )
        and created_by = auth.uid()
      );

    drop policy if exists archived_uploads_update on public.archived_uploads;
    create policy archived_uploads_update on public.archived_uploads for update
      using (
        public.is_admin()
        or public.has_permission('archives', 'update')
        or created_by = auth.uid()
      )
      with check (
        public.is_admin()
        or public.has_permission('archives', 'update')
        or created_by = auth.uid()
      );

    drop policy if exists archived_uploads_delete on public.archived_uploads;
    create policy archived_uploads_delete on public.archived_uploads for delete
      using (
        public.is_admin()
        or public.has_permission('archives', 'delete')
      );

    -- The old self-read policy is now redundant with archived_uploads_read.
    drop policy if exists archived_uploads_self_read on public.archived_uploads;
  end if;
end $$;
