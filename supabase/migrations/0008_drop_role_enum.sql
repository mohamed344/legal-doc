-- =====================================================================
-- Commitforce — Drop the user_role enum, make public.roles the single
-- source of truth for who someone is. users.role_id is now the only
-- role pointer; users.role and the user_role enum are removed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mark which roles are administrative
-- ---------------------------------------------------------------------
alter table public.roles
  add column if not exists is_admin boolean not null default false;

-- Re-assert seed roles and flip the admin flag.
insert into public.roles (name, is_system, is_admin)
values
  ('Administrateur', true, true),
  ('Employé',        true, false)
on conflict (name) do update
  set is_system = excluded.is_system,
      is_admin  = excluded.is_admin;

-- ---------------------------------------------------------------------
-- 2. Backfill users.role_id from the legacy enum so nothing is null
--    before we make it required. The 'role' column may already be gone
--    from a partial earlier run, so guard the admin backfill.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'role'
  ) then
    execute $sql$
      update public.users u
      set role_id = r.id
      from public.roles r
      where u.role_id is null
        and u.role::text = 'admin'
        and r.name = 'Administrateur'
    $sql$;
  end if;
end $$;

update public.users u
set role_id = r.id
from public.roles r
where u.role_id is null
  and r.name = 'Employé';

-- ---------------------------------------------------------------------
-- 3. Drop every RLS policy that references current_role() so we can
--    drop the function and the column it depends on.
-- ---------------------------------------------------------------------
do $$
declare
  drop_pairs text[][] := array[
    array['users_self_read',              'public.users'],
    array['users_admin_all',              'public.users'],
    array['templates_read',               'public.templates'],
    array['templates_write',              'public.templates'],
    array['templates_update',             'public.templates'],
    array['templates_delete',             'public.templates'],
    array['tv_write',                     'public.template_variables'],
    array['clients_read',                 'public.clients'],
    array['clients_write',                'public.clients'],
    array['documents_insert',             'public.documents'],
    array['documents_update',             'public.documents'],
    array['documents_delete',             'public.documents'],
    array['invoices_all',                 'public.invoices'],
    array['invoice_lines_all',            'public.invoice_lines'],
    array['ep_admin',                     'public.employee_permissions'],
    array['al_read',                      'public.activity_log'],
    array['archived_uploads_admin_all',   'public.archived_uploads'],
    array['roles_admin_write',            'public.roles'],
    array['role_permissions_admin_write', 'public.role_permissions'],
    array['document_imports_select',      'storage.objects'],
    array['document_imports_delete',      'storage.objects']
  ];
  pair text[];
begin
  foreach pair slice 1 in array drop_pairs loop
    if to_regclass(pair[2]) is not null then
      execute format('drop policy if exists %I on %s', pair[1], pair[2]);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Drop the legacy column and the enum type. handle_new_user()
--    references the column, so refresh it first to release the
--    dependency.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count int;
  assigned_role_id uuid;
begin
  select count(*) into existing_count from public.users;
  if existing_count = 0 then
    select id into assigned_role_id from public.roles where name = 'Administrateur';
  else
    select id into assigned_role_id from public.roles where name = 'Employé';
  end if;

  insert into public.users (user_id, full_name, email, role_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    assigned_role_id
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop function if exists public.current_role();

alter table public.users alter column role_id set not null;
alter table public.users drop column if exists role;

drop index if exists public.users_role_idx;
drop type if exists user_role;

-- ---------------------------------------------------------------------
-- 5. New helpers. is_admin() is the workhorse for RLS; current_role()
--    is kept (returning text now) for any caller that wants the role
--    name as a string.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(r.is_admin, false)
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.name
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.user_id = auth.uid()
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 6. Recreate RLS policies using is_admin().
--    Avocat is folded into "non-admin" since the enum value no longer
--    exists; non-admin write paths that previously relied on it are
--    now admin-only.
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('public.users') is not null then
    drop policy if exists users_self_read on public.users;
    create policy users_self_read on public.users for select
      using (auth.uid() = user_id or public.is_admin());

    drop policy if exists users_admin_all on public.users;
    create policy users_admin_all on public.users for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if to_regclass('public.templates') is not null then
    drop policy if exists templates_read on public.templates;
    if to_regclass('public.role_permissions') is not null
       and to_regclass('public.employee_permissions') is not null then
      create policy templates_read on public.templates for select
        using (
          public.is_admin()
          or exists (
            select 1
            from public.role_permissions rp
            join public.users u on u.role_id = rp.role_id
            where u.user_id = auth.uid()
              and rp.page = 'templates'
              and rp.action = 'read'
          )
          or exists (
            select 1 from public.employee_permissions ep
            join public.users u on u.id = ep.user_id
            where u.user_id = auth.uid() and ep.template_id = templates.id
          )
        );
    else
      create policy templates_read on public.templates for select
        using (public.is_admin());
    end if;

    drop policy if exists templates_write on public.templates;
    create policy templates_write on public.templates for insert
      with check (public.is_admin());

    drop policy if exists templates_update on public.templates;
    create policy templates_update on public.templates for update
      using (public.is_admin())
      with check (public.is_admin());

    drop policy if exists templates_delete on public.templates;
    create policy templates_delete on public.templates for delete
      using (public.is_admin());
  end if;

  if to_regclass('public.template_variables') is not null then
    drop policy if exists tv_write on public.template_variables;
    create policy tv_write on public.template_variables for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if to_regclass('public.clients') is not null then
    drop policy if exists clients_read on public.clients;
    create policy clients_read on public.clients for select
      using (auth.role() = 'authenticated');

    drop policy if exists clients_write on public.clients;
    create policy clients_write on public.clients for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if to_regclass('public.documents') is not null then
    drop policy if exists documents_insert on public.documents;
    create policy documents_insert on public.documents for insert
      with check (auth.role() = 'authenticated' and created_by = auth.uid());

    drop policy if exists documents_update on public.documents;
    create policy documents_update on public.documents for update
      using (public.is_admin() or created_by = auth.uid());

    drop policy if exists documents_delete on public.documents;
    create policy documents_delete on public.documents for delete
      using (public.is_admin());
  end if;

  if to_regclass('public.invoices') is not null then
    drop policy if exists invoices_all on public.invoices;
    create policy invoices_all on public.invoices for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if to_regclass('public.invoice_lines') is not null then
    drop policy if exists invoice_lines_all on public.invoice_lines;
    create policy invoice_lines_all on public.invoice_lines for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if to_regclass('public.employee_permissions') is not null then
    drop policy if exists ep_admin on public.employee_permissions;
    create policy ep_admin on public.employee_permissions for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if to_regclass('public.activity_log') is not null then
    drop policy if exists al_read on public.activity_log;
    create policy al_read on public.activity_log for select
      using (public.is_admin());
  end if;

  if to_regclass('public.archived_uploads') is not null then
    drop policy if exists archived_uploads_admin_all on public.archived_uploads;
    create policy archived_uploads_admin_all on public.archived_uploads for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if to_regclass('public.roles') is not null then
    drop policy if exists roles_admin_write on public.roles;
    create policy roles_admin_write on public.roles for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if to_regclass('public.role_permissions') is not null then
    drop policy if exists role_permissions_admin_write on public.role_permissions;
    create policy role_permissions_admin_write on public.role_permissions for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if to_regclass('storage.objects') is not null then
    drop policy if exists document_imports_select on storage.objects;
    create policy document_imports_select on storage.objects for select
      using (
        bucket_id = 'document-imports'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_admin()
        )
      );

    drop policy if exists document_imports_delete on storage.objects;
    create policy document_imports_delete on storage.objects for delete
      using (
        bucket_id = 'document-imports'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_admin()
        )
      );
  end if;
end $$;
