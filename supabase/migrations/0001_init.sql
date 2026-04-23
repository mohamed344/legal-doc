-- =====================================================================
-- Commitforce — Initial schema
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'avocat', 'employe');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_status as enum ('brouillon', 'valide', 'facture');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('brouillon', 'envoyee', 'payee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type variable_type as enum ('text', 'date', 'number', 'select', 'checkbox');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- users (1-1 with auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  avatar_url text,
  last_login_at timestamptz,
  role user_role not null default 'employe',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists users_user_id_idx on public.users(user_id);
create index if not exists users_role_idx on public.users(role);
create index if not exists users_email_idx on public.users(email);

-- Auto-create user on signup. First user is promoted to admin.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Role helper for RLS
create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------
-- templates + variables
-- ---------------------------------------------------------------------
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  body_html text,
  body_json jsonb,
  default_price numeric(12,2),
  is_archived boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists templates_created_by_idx on public.templates(created_by);
create index if not exists templates_category_idx on public.templates(category);
create index if not exists templates_archived_idx on public.templates(is_archived);

create table if not exists public.template_variables (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  key text not null,
  label text not null,
  type variable_type not null default 'text',
  options text[],
  category text,
  required boolean not null default false,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, key)
);
create index if not exists template_variables_template_idx on public.template_variables(template_id);

-- ---------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_created_by_idx on public.clients(created_by);
create index if not exists clients_name_trgm_idx on public.clients using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  status document_status not null default 'brouillon',
  filled_data jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_template_idx on public.documents(template_id);
create index if not exists documents_client_idx on public.documents(client_id);
create index if not exists documents_status_idx on public.documents(status);
create index if not exists documents_created_at_idx on public.documents(created_at desc);

create table if not exists public.document_activity (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists document_activity_doc_idx on public.document_activity(document_id);

-- ---------------------------------------------------------------------
-- invoices + lines
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  status invoice_status not null default 'brouillon',
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  issued_at date not null default current_date,
  due_at date,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_client_idx on public.invoices(client_id);
create index if not exists invoices_status_idx on public.invoices(status);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  document_id uuid references public.documents(id) on delete set null,
  qty numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) generated always as (qty * unit_price) stored
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines(invoice_id);

-- ---------------------------------------------------------------------
-- employee_permissions
-- ---------------------------------------------------------------------
create table if not exists public.employee_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  can_create boolean not null default true,
  can_edit boolean not null default false,
  unique (user_id, template_id)
);

-- ---------------------------------------------------------------------
-- activity_log
-- ---------------------------------------------------------------------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_user_idx on public.activity_log(user_id);
create index if not exists activity_log_entity_idx on public.activity_log(entity, entity_id);
create index if not exists activity_log_created_at_idx on public.activity_log(created_at desc);

-- ---------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  for t in select unnest(array['users','templates','clients','documents','invoices']) loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute procedure public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.templates enable row level security;
alter table public.template_variables enable row level security;
alter table public.clients enable row level security;
alter table public.documents enable row level security;
alter table public.document_activity enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.employee_permissions enable row level security;
alter table public.activity_log enable row level security;

-- users: users see their row; admins see all
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users for select
  using (auth.uid() = user_id or public.current_role() = 'admin');

drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- templates: all authenticated can read; avocat+admin can write; employe filtered by permissions (read)
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

-- template_variables: follow parent template
drop policy if exists tv_read on public.template_variables;
create policy tv_read on public.template_variables for select
  using (exists (select 1 from public.templates t where t.id = template_id));

drop policy if exists tv_write on public.template_variables;
create policy tv_write on public.template_variables for all
  using (public.current_role() in ('admin', 'avocat'))
  with check (public.current_role() in ('admin', 'avocat'));

-- clients: avocat+admin full; employe read only
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select
  using (public.current_role() in ('admin', 'avocat', 'employe'));

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all
  using (public.current_role() in ('admin', 'avocat'))
  with check (public.current_role() in ('admin', 'avocat'));

-- documents: all roles read; employe can create; avocat+admin full
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select using (true);

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert
  with check (public.current_role() in ('admin', 'avocat', 'employe') and created_by = auth.uid());

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update
  using (public.current_role() in ('admin', 'avocat') or created_by = auth.uid());

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete
  using (public.current_role() in ('admin', 'avocat'));

-- document_activity: insert by any authenticated; read by admin/avocat
drop policy if exists da_read on public.document_activity;
create policy da_read on public.document_activity for select using (true);

drop policy if exists da_insert on public.document_activity;
create policy da_insert on public.document_activity for insert
  with check (auth.uid() is not null);

-- invoices + lines: avocat+admin only
drop policy if exists invoices_all on public.invoices;
create policy invoices_all on public.invoices for all
  using (public.current_role() in ('admin', 'avocat'))
  with check (public.current_role() in ('admin', 'avocat'));

drop policy if exists invoice_lines_all on public.invoice_lines;
create policy invoice_lines_all on public.invoice_lines for all
  using (public.current_role() in ('admin', 'avocat'))
  with check (public.current_role() in ('admin', 'avocat'));

-- employee_permissions: admin only
drop policy if exists ep_admin on public.employee_permissions;
create policy ep_admin on public.employee_permissions for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- activity_log: insert by auth; read by admin/avocat
drop policy if exists al_insert on public.activity_log;
create policy al_insert on public.activity_log for insert with check (auth.uid() is not null);

drop policy if exists al_read on public.activity_log;
create policy al_read on public.activity_log for select
  using (public.current_role() in ('admin', 'avocat'));

-- ---------------------------------------------------------------------
-- Storage buckets (uncomment to create via SQL, or create via dashboard)
-- ---------------------------------------------------------------------
-- insert into storage.buckets (id, name, public) values
--   ('template-imports', 'template-imports', false),
--   ('invoice-exports', 'invoice-exports', false),
--   ('document-outputs', 'document-outputs', false)
-- on conflict (id) do nothing;
