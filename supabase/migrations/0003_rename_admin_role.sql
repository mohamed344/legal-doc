-- =====================================================================
-- Commitforce — Rename role value 'administrateur' -> 'admin'
-- =====================================================================

alter type user_role rename value 'administrateur' to 'admin';

-- ---------------------------------------------------------------------
-- Refresh handle_new_user with new literal.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count int;
  assigned_role user_role;
begin
  select count(*) into existing_count from public.users;
  assigned_role := case when existing_count = 0 then 'admin' else 'employe' end;

  insert into public.users (user_id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    assigned_role
  )
  on conflict (user_id) do nothing;
  return new;
end; $$;

-- ---------------------------------------------------------------------
-- Refresh policies that reference the old literal.
-- ---------------------------------------------------------------------
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users for select
  using (auth.uid() = user_id or public.current_role() = 'admin');

drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists templates_read on public.templates;
create policy templates_read on public.templates for select
  using (
    public.current_role() in ('admin', 'avocat')
    or (public.current_role() = 'employe' and exists (
      select 1 from public.employee_permissions ep
      join public.users u on u.id = ep.user_id
      where u.user_id = auth.uid() and ep.template_id = templates.id
    ))
  );

drop policy if exists templates_write on public.templates;
create policy templates_write on public.templates for insert
  with check (public.current_role() in ('admin', 'avocat'));

drop policy if exists templates_update on public.templates;
create policy templates_update on public.templates for update
  using (public.current_role() in ('admin', 'avocat'))
  with check (public.current_role() in ('admin', 'avocat'));

drop policy if exists templates_delete on public.templates;
create policy templates_delete on public.templates for delete
  using (public.current_role() = 'admin');

drop policy if exists tv_write on public.template_variables;
create policy tv_write on public.template_variables for all
  using (public.current_role() in ('admin', 'avocat'))
  with check (public.current_role() in ('admin', 'avocat'));

drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select
  using (public.current_role() in ('admin', 'avocat', 'employe'));

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all
  using (public.current_role() in ('admin', 'avocat'))
  with check (public.current_role() in ('admin', 'avocat'));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert
  with check (public.current_role() in ('admin', 'avocat', 'employe') and created_by = auth.uid());

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update
  using (public.current_role() in ('admin', 'avocat') or created_by = auth.uid());

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete
  using (public.current_role() in ('admin', 'avocat'));

drop policy if exists invoices_all on public.invoices;
create policy invoices_all on public.invoices for all
  using (public.current_role() in ('admin', 'avocat'))
  with check (public.current_role() in ('admin', 'avocat'));

drop policy if exists invoice_lines_all on public.invoice_lines;
create policy invoice_lines_all on public.invoice_lines for all
  using (public.current_role() in ('admin', 'avocat'))
  with check (public.current_role() in ('admin', 'avocat'));

drop policy if exists ep_admin on public.employee_permissions;
create policy ep_admin on public.employee_permissions for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists al_read on public.activity_log;
create policy al_read on public.activity_log for select
  using (public.current_role() in ('admin', 'avocat'));

-- Storage policies (from 0002)
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
