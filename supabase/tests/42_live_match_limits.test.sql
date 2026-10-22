-- Live ingestion does not write an official match column.
-- matches has no status column, so status = 'live' is not a transition.
-- Run: npx supabase test db

begin;

select plan(3);

select ok(
  not exists (
    select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'matches'
       and a.attname = 'status'
       and a.attnum > 0
       and not a.attisdropped
  ),
  'matches has no status column'
);

select ok(
  not exists (
    select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'matches'
       and a.attname = 'winner_side'
       and a.attnum > 0
       and not a.attisdropped
  ),
  'matches has no winner_side column'
);

select ok(
  not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'upsert_live_match_state'
       and pg_get_functiondef(p.oid) ilike '%update public.matches%'
  ),
  'the live upsert does not write matches'
);

select * from finish();
rollback;
