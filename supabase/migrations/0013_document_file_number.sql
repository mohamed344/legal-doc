-- =====================================================================
-- Document file numbers — per-year sequence "YEAR/0001" (رقم الملف)
-- Assigned atomically at insert time; resets each calendar year.
-- =====================================================================

alter table public.documents
  add column if not exists file_year int,
  add column if not exists file_seq int,
  add column if not exists file_number text;

create unique index if not exists documents_file_number_idx
  on public.documents(file_number);

-- Per-year counter. Only the security-definer trigger writes to it.
create table if not exists public.document_counters (
  year int primary key,
  last_seq int not null default 0
);
alter table public.document_counters enable row level security;

-- BEFORE INSERT: assign the next number for the current year, atomically.
create or replace function public.assign_document_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  y int;
  seq int;
begin
  if new.file_number is not null then
    return new;
  end if;

  y := extract(year from coalesce(new.created_at, now()))::int;

  insert into public.document_counters(year, last_seq)
  values (y, 1)
  on conflict (year) do update
    set last_seq = public.document_counters.last_seq + 1
  returning last_seq into seq;

  new.file_year := y;
  new.file_seq := seq;
  new.file_number := y || '/' || lpad(seq::text, 4, '0');
  return new;
end; $$;

drop trigger if exists trg_assign_document_number on public.documents;
create trigger trg_assign_document_number
  before insert on public.documents
  for each row execute function public.assign_document_number();

-- ---------------------------------------------------------------------
-- Backfill existing documents by creation order within each year, then
-- seed the counters so new inserts continue from the right number.
-- ---------------------------------------------------------------------
with ranked as (
  select
    id,
    extract(year from created_at)::int as y,
    row_number() over (
      partition by extract(year from created_at)
      order by created_at, id
    ) as rn
  from public.documents
  where file_number is null
)
update public.documents d
set file_year = r.y,
    file_seq = r.rn,
    file_number = r.y || '/' || lpad(r.rn::text, 4, '0')
from ranked r
where d.id = r.id;

insert into public.document_counters(year, last_seq)
select file_year, max(file_seq)
from public.documents
where file_year is not null
group by file_year
on conflict (year) do update
  set last_seq = greatest(public.document_counters.last_seq, excluded.last_seq);
