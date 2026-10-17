-- matches.session is day, night, or null.
-- Catalog checks use pg_catalog. matches has no slate_date, so the
-- planned (tournament_id, slate_date, session) index is not created.
-- The tournament/round index already covers match lookup.
-- Run: npx supabase test db

begin;

select plan(9);

select ok(
  exists (
    select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'matches'
       and a.attname = 'session'
       and a.attnum > 0
       and not a.attisdropped
       and not a.attnotnull
       and a.atttypid = 'text'::regtype
  ),
  'matches.session exists and null is allowed'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'matches'
       and c.conname = 'matches_session_check'
       and pg_get_constraintdef(c.oid) like '%session IS NULL%'
       and pg_get_constraintdef(c.oid) like '%day%'
       and pg_get_constraintdef(c.oid) like '%night%'
       and pg_get_constraintdef(c.oid) not like '%unknown%'
  ),
  'session is constrained to day, night, or null'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class idx on idx.oid = i.indexrelid
      join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
      join pg_catalog.pg_namespace n on n.oid = tbl.relnamespace
     where n.nspname = 'public'
       and tbl.relname = 'matches'
       and idx.relname = 'matches_tournament_round_idx'
  )
  and not exists (
    select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'matches'
       and a.attname = 'slate_date'
       and a.attnum > 0
       and not a.attisdropped
  ),
  'tournament round index remains; there is no slate_date column to index'
);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-session', 'Session Fixture', 'atp', '2026-08-10', '2026-08-16',
  'force_off', false
);

insert into public.players (provider_id, last_name)
values ('pgtap-session-a', 'Adler'), ('pgtap-session-b', 'Berg');

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id
)
select t.id, 0, 0, a.id, b.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-session-a'
  join public.players b on b.provider_id = 'pgtap-session-b'
 where t.slug = 'pgtap-session';

insert into public.matches (
  tournament_id, round, index_in_round, session,
  side_a_player_id, side_b_player_id
)
select t.id, 0, 1, 'day', a.id, b.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-session-a'
  join public.players b on b.provider_id = 'pgtap-session-b'
 where t.slug = 'pgtap-session';

insert into public.matches (
  tournament_id, round, index_in_round, session,
  side_a_player_id, side_b_player_id
)
select t.id, 0, 2, 'night', a.id, b.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-session-a'
  join public.players b on b.provider_id = 'pgtap-session-b'
 where t.slug = 'pgtap-session';

select ok(
  (
    select m.session is null
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-session'
       and m.index_in_round = 0
  ),
  'a match with no session is stored null'
);

select results_eq(
  $$select m.session
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-session'
       and m.index_in_round in (1, 2)
     order by m.index_in_round$$,
  $$values ('day'::text), ('night'::text)$$,
  'day and night are stored'
);

select throws_ok(
  $$insert into public.matches (
      tournament_id, round, index_in_round, session,
      side_a_player_id, side_b_player_id
    )
    select t.id, 0, 3, 'afternoon', a.id, b.id
      from public.tournaments t
      join public.players a on a.provider_id = 'pgtap-session-a'
      join public.players b on b.provider_id = 'pgtap-session-b'
     where t.slug = 'pgtap-session'$$,
  '23514',
  null,
  'an invalid session value is rejected'
);

select throws_ok(
  $$insert into public.matches (
      tournament_id, round, index_in_round, session,
      side_a_player_id, side_b_player_id
    )
    select t.id, 0, 4, 'unknown', a.id, b.id
      from public.tournaments t
      join public.players a on a.provider_id = 'pgtap-session-a'
      join public.players b on b.provider_id = 'pgtap-session-b'
     where t.slug = 'pgtap-session'$$,
  '23514',
  null,
  'unknown is not a stored session'
);

select results_eq(
  $$select m.index_in_round, m.session
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-session'
     order by m.index_in_round$$,
  $$values (0, null::text), (1, 'day'::text), (2, 'night'::text)$$,
  'existing rows stay valid after rejected session writes'
);

select ok(
  not exists (
    select 1
      from public.matches
     where session is not null
       and session not in ('day', 'night')
  ),
  'every stored session is day, night, or null'
);

select * from finish();

rollback;
