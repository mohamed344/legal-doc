-- =====================================================================
-- Assign document file numbers on UPDATE too (not just INSERT), and
-- backfill any rows that still have no number.
--
-- The existing public.assign_document_number() function already early-
-- returns when new.file_number is not null, so re-firing it on UPDATE
-- only ever touches rows whose number is still null.
-- =====================================================================

drop trigger if exists trg_assign_document_number on public.documents;
create trigger trg_assign_document_number
  before insert or update on public.documents
  for each row execute function public.assign_document_number();

-- ---------------------------------------------------------------------
-- One-time backfill of any documents still missing a number, then reseed
-- the per-year counters. Idempotent: only file_number-null rows change,
-- and the counter reseed keeps the greatest sequence per year.
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
