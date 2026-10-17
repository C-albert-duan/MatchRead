-- Public match ref, session, court, and the 16-player synthetic tree.
-- Run: npx supabase test db

begin;

select plan(16);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-m2', 'Structure Fixture', 'atp', '2026-08-10', '2026-08-16',
  'force_off', false
);

insert into public.players (provider_id, last_name)
values ('pgtap-m2-a', 'Adler'), ('pgtap-m2-b', 'Berg');

select throws_ok(
  $$insert into public.matches (
      tournament_id, round, index_in_round, session,
      side_a_player_id, side_b_player_id
    )
    select t.id, 0, 0, 'afternoon', a.id, b.id
      from public.tournaments t
      join public.players a on a.provider_id = 'pgtap-m2-a'
      join public.players b on b.provider_id = 'pgtap-m2-b'
     where t.slug = 'pgtap-m2'$$,
  '23514',
  null,
  'session rejects anything other than day or night'
);

select throws_ok(
  $$insert into public.matches (
      tournament_id, round, index_in_round, court,
      side_a_player_id, side_b_player_id
    )
    select t.id, 0, 0, '   ', a.id, b.id
      from public.tournaments t
      join public.players a on a.provider_id = 'pgtap-m2-a'
      join public.players b on b.provider_id = 'pgtap-m2-b'
     where t.slug = 'pgtap-m2'$$,
  '23514',
  null,
  'blank court is not a published court'
);

insert into public.matches (
  tournament_id, round, index_in_round, session, court, provider_match_id,
  side_a_player_id, side_b_player_id
)
select t.id, 0, 0, 'day', 'Court 1', '9001', a.id, b.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-m2-a'
  join public.players b on b.provider_id = 'pgtap-m2-b'
 where t.slug = 'pgtap-m2';

select is(
  (
    select m.external_ref
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-m2'
       and m.round = 0
       and m.index_in_round = 0
  ),
  'fx-9001',
  'provider match id becomes the public ref'
);

select is(
  (
    select m.external_ref = m.id::text
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-m2'
  ),
  false,
  'public ref is not the match uuid'
);

select is(
  (
    select m.session
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-m2'
  ),
  'day',
  'explicit day session is stored'
);

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id
)
select t.id, 0, 1, a.id, b.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-m2-a'
  join public.players b on b.provider_id = 'pgtap-m2-b'
 where t.slug = 'pgtap-m2';

select ok(
  (
    select m.session is null
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-m2'
       and m.round = 0
       and m.index_in_round = 1
  ),
  'a match with no session field stays null'
);

select is(
  (
    select m.scheduled_at is null
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-m2'
       and m.index_in_round = 1
  ),
  true,
  'missing start stays null'
);

select throws_ok(
  $$insert into public.matches (
      tournament_id, round, index_in_round, external_ref,
      side_a_player_id, side_b_player_id
    )
    select t.id, 1, 0, 'fx-9001', a.id, b.id
      from public.tournaments t
      join public.players a on a.provider_id = 'pgtap-m2-a'
      join public.players b on b.provider_id = 'pgtap-m2-b'
     where t.slug = 'pgtap-m2'$$,
  '23505',
  null,
  'public refs are unique'
);

select ok(
  not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'tournament_match_sheet'
       and column_name = 'id'
  ),
  'sheet view does not expose the match uuid'
);

\set matchread_synthetic 1
\ir fixtures/synthetic-bracket-16.sql

select is(
  (select count(*)::int from public.seats s
     join public.tournaments t on t.id = s.tournament_id
    where t.slug = 'syn-16'),
  16,
  'synthetic sheet has 16 seats'
);

select is(
  (select count(*)::int from public.matches m
     join public.tournaments t on t.id = m.tournament_id
    where t.slug = 'syn-16'),
  15,
  'synthetic sheet has 15 matches'
);

select is(
  (select count(*)::int from public.public_calendar where slug = 'syn-16'),
  0,
  'synthetic bracket stays off the public calendar'
);

select is(
  (
    select m.scheduled_at is null and m.session is null and m.court is null
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'syn-16'
       and m.external_ref = 'syn16-r0-m3'
  ),
  true,
  'a match with no published start stays TBA'
);

select is(
  (
    select m.has_time
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'syn-16'
       and m.external_ref = 'syn16-r0-m2'
  ),
  false,
  'a date-only row is not a clock'
);

select is(
  (
    select m.session = 'day' and m.court = 'Court 1' and m.winner_player_id is not null
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'syn-16'
       and m.external_ref = 'syn16-r0-m0'
  ),
  true,
  'day session and court are stored on the settled match'
);

select results_eq(
  $$select pa.last_name, pb.last_name, m.winner_player_id is null
      from public.tournament_match_sheet m
      join public.players pa on pa.id = m.side_a_player_id
      join public.players pb on pb.id = m.side_b_player_id
     where m.tournament_ref = 'syn-16'
       and m.external_ref = 'syn16-r1-m0'$$,
  $$values ('Alden'::text, 'Dahl'::text, true)$$,
  'parent sides are the stored players and the parent is not marked won'
);

select * from finish();

rollback;
