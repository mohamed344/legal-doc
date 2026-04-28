-- =====================================================================
-- Commitforce — Custom roles with page/action permission grants
-- =====================================================================
-- Adds named roles that bundle permissions across the app's pages
-- (templates, documents, clients, …) and actions (read/create/update/delete).
-- Admins assign one role to each employee. The legacy
-- public.employee_permissions table is left in place because the
-- templates_read RLS policy in migration 0003 still references it.
-- Future cleanup: rewrite that policy to OR in role_permissions, then
-- drop employee_permissions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_system boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists roles_name_idx on public.roles(name);

-- ---------------------------------------------------------------------
-- role_permissions  (page x action grants per role)
-- ---------------------------------------------------------------------
-- The page/action enums are kept as text + CHECK so they can stay in
-- lockstep with src/lib/permissions.ts without ALTER TYPE migrations.
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  page text not null check (page in (
    'templates','documents','clients','invoices','employees',
    'settings','ai_import','upload','archives'
  )),
  action text not null check (action in ('read','create','update','delete')),
  primary key (role_id, page, action)
);

create index if not exists role_permissions_role_id_idx on public.role_permissions(role_id);

-- ---------------------------------------------------------------------
-- users.role_id
-- ---------------------------------------------------------------------
alter table public.users
  add column if not exists role_id uuid null references public.roles(id) on delete set null;

create index if not exists users_role_id_idx on public.users(role_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select
  using (auth.role() = 'authenticated');

drop policy if exists roles_admin_write on public.roles;
create policy roles_admin_write on public.roles for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select
  using (auth.role() = 'authenticated');

drop policy if exists role_permissions_admin_write on public.role_permissions;
create policy role_permissions_admin_write on public.role_permissions for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ---------------------------------------------------------------------
-- Seed system roles
-- ---------------------------------------------------------------------
insert into public.roles (name, is_system)
values ('Administrateur', true), ('Employé', true)
on conflict (name) do nothing;
