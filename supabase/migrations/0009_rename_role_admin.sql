-- =====================================================================
-- Commitforce — Rename the seed admin role from 'Administrateur' to
-- 'admin'. The role is identified by is_admin = true; the name is just
-- the human label, but the trigger and any historical SQL references
-- the literal, so we update both.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rename the row, merging into a pre-existing 'admin' if one was
--    created manually.
-- ---------------------------------------------------------------------
do $$
declare
  administrateur_id uuid;
  admin_id          uuid;
begin
  select id into administrateur_id from public.roles where name = 'Administrateur';
  select id into admin_id          from public.roles where name = 'admin';

  if administrateur_id is null then
    -- Nothing to rename. If there is an 'admin' row, make sure it is
    -- flagged as the system admin so the trigger and seeders work.
    if admin_id is not null then
      update public.roles
        set is_admin = true, is_system = true
        where id = admin_id;
    end if;
    return;
  end if;

  if admin_id is not null and admin_id <> administrateur_id then
    -- Both names exist as separate rows. Merge: move every reference
    -- onto the existing 'admin' row, then delete the duplicate.
    update public.users          set role_id = admin_id where role_id = administrateur_id;
    update public.role_permissions
      set role_id = admin_id
      where role_id = administrateur_id
        and (admin_id, page, action) not in (
          select role_id, page, action from public.role_permissions where role_id = admin_id
        );
    delete from public.role_permissions where role_id = administrateur_id;
    delete from public.roles            where id      = administrateur_id;

    update public.roles
      set is_admin = true, is_system = true
      where id = admin_id;
  else
    -- Plain rename.
    update public.roles
      set name = 'admin', is_admin = true, is_system = true
      where id = administrateur_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Refresh handle_new_user() to look up the renamed seed.
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
    select id into assigned_role_id from public.roles where name = 'admin';
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
