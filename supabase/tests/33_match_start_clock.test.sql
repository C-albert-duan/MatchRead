-- scheduled_at is the start. There is no starts_at column.
-- UTC midnight is not a kickoff. A real clock and a date-only noon stay valid.
-- Run: npx supabase test db

begin;

select plan(5);

select ok(
  not exists (
    select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'matches'
       and a.attname = 'starts_at'
       and a.attnum > 0
       and not a.attisdropped
  ),
  'matches has scheduled_at, not starts_at'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'matches'
       and c.conname = 'matches_has_time_not_midnight_check'
  ),
  'a UTC midnight stamp cannot be stored as a kickoff'
);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-start', 'Start Fixture', 'atp', '2026-08-10', '2026-08-16',
  'force_off', false
);

insert into public.matches (
  tournament_id, round, index_in_round, scheduled_at, has_time
)
select t.id, 0, 0, '2026-08-11T12:00:00Z', false
  from public.tournaments t
 where t.slug = 'pgtap-start';

insert into public.matches (
  tournament_id, round, index_in_round, scheduled_at, has_time
)
select t.id, 0, 1, '2026-08-11T12:10:00Z', true
  from public.tournaments t
 where t.slug = 'pgtap-start';

select ok(
  (
    select m.has_time is false
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-start'
       and m.index_in_round = 0
  ),
  'a date-only noon stamp stays untimed'
);

select ok(
  (
    select m.has_time is true
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-start'
       and m.index_in_round = 1
  ),
  'a published clock is stored'
);

select throws_ok(
  $$insert into public.matches (
      tournament_id, round, index_in_round, scheduled_at, has_time
    )
    select t.id, 0, 2, '2026-08-11T00:00:00Z', true
      from public.tournaments t
     where t.slug = 'pgtap-start'$$,
  '23514',
  null,
  'UTC midnight is not stored as an exact start'
);

select * from finish();

rollback;
