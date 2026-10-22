-- (tour, live-list id) maps to an internal match.
-- Authenticated may read the provider key. match_id stays on service_role.
-- Run: npx supabase test db

begin;

select plan(16);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-pem', 'Map Fixture', 'atp', '2026-08-10', '2026-08-16',
  'force_off', false
);

insert into public.players (provider_id, last_name)
values ('pgtap-pem-a', 'Adler'), ('pgtap-pem-b', 'Berg');

insert into public.matches (
  tournament_id, round, index_in_round, side_a_player_id, side_b_player_id
)
select t.id, 0, 0, a.id, b.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-pem-a'
  join public.players b on b.provider_id = 'pgtap-pem-b'
 where t.slug = 'pgtap-pem';

insert into public.provider_event_map (tour, provider_event_id, match_id)
select 'atp', 'evt-live-1', m.id
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
 where t.slug = 'pgtap-pem';

select ok(
  exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'provider_event_map'
       and indexname = 'provider_event_map_match_id_idx'
  ),
  'match_id is indexed'
);

select throws_ok(
  $$insert into public.provider_event_map (tour, provider_event_id, match_id)
    select 'atp', 'evt-live-1', m.id
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-pem'$$,
  '23505',
  null,
  'tour and provider_event_id are unique together'
);

select lives_ok(
  $$insert into public.provider_event_map (tour, provider_event_id, match_id)
    select 'wta', 'evt-live-1', m.id
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-pem'$$,
  'the same live id may exist on the other tour'
);

select throws_ok(
  $$insert into public.provider_event_map (tour, provider_event_id, match_id)
    select 'other', 'evt-live-2', m.id
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-pem'$$,
  '23514',
  null,
  'tour is atp or wta'
);

select ok(
  has_table_privilege('anon', 'public.provider_event_map', 'select') is false,
  'anon cannot read the map'
);
select ok(
  has_column_privilege(
    'authenticated', 'public.provider_event_map', 'match_id', 'select'
  ) is false,
  'authenticated cannot read match_id'
);
select ok(
  has_column_privilege(
    'authenticated', 'public.provider_event_map', 'tour', 'select'
  ),
  'authenticated can read tour'
);
select ok(
  has_table_privilege('authenticated', 'public.provider_event_map', 'insert') is false,
  'authenticated cannot write the map'
);
select ok(
  has_table_privilege('service_role', 'public.provider_event_map', 'insert'),
  'service_role can write the map'
);

set local role service_role;

select lives_ok(
  $$insert into public.provider_event_map (tour, provider_event_id, match_id)
    select 'atp', 'evt-live-svc', m.id
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-pem'$$,
  'service_role insert succeeds'
);

select is(
  (
    select pem.match_id::text
      from public.provider_event_map pem
     where pem.tour = 'atp'
       and pem.provider_event_id = 'evt-live-1'
  ),
  (
    select m.id::text
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-pem'
  ),
  'tour and provider_event_id resolve one match'
);

select is(
  (
    select count(*)::int
      from public.provider_event_map
     where tour = 'atp'
       and provider_event_id = 'evt-missing'
  ),
  0,
  'an unknown provider event id returns no match'
);

reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$insert into public.provider_event_map (tour, provider_event_id, match_id)
    select 'atp', 'evt-live-anon', m.id
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-pem'$$,
  '42501',
  null,
  'anon cannot insert a map row'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  $$insert into public.provider_event_map (tour, provider_event_id, match_id)
    select 'atp', 'evt-live-auth', m.id
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-pem'$$,
  '42501',
  null,
  'a signed-in user cannot insert a map row'
);

select throws_ok(
  $$select match_id from public.provider_event_map$$,
  '42501',
  null,
  'a signed-in read of match_id is denied'
);

select is(
  (select count(*)::int from public.provider_event_map where tour = 'atp'),
  2,
  'a signed-in read can count rows by tour'
);

select * from finish();
rollback;
