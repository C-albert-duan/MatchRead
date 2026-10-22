-- One current live row per match. A later frame replaces it.
-- Run: npx supabase test db

begin;

select plan(8);

select ok(
  to_regclass('public.live_events') is null,
  'the current live row is not a second live_events log'
);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-live-row', 'Live Row Fixture', 'atp', '2026-10-09', '2026-10-10',
  'force_off', false
);

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 0 from public.tournaments where slug = 'pgtap-live-row';

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-row'),
    (select id from public.tournaments where slug = 'pgtap-live-row'),
    'pgtap-live-row-r0',
    'in_play',
    '1-0',
    '15-0',
    null,
    null,
    1,
    'updatedAt',
    'frame-a',
    'replay',
    '2026-10-09 18:00:00+00',
    '2026-10-09 18:00:00+00'
  ),
  'applied',
  'the first frame creates the current row'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-row'),
    (select id from public.tournaments where slug = 'pgtap-live-row'),
    'pgtap-live-row-r0',
    'in_play',
    '6-4,3-3',
    '40-30',
    null,
    null,
    2,
    'updatedAt',
    'frame-b',
    'replay',
    '2026-10-09 18:01:00+00',
    '2026-10-09 18:00:40+00'
  ),
  'applied',
  'a later frame replaces that row'
);

select is(
  (
    select count(*)::int
      from public.live_match_state s
      join public.matches m on m.id = s.match_id
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-live-row'
  ),
  1,
  'the match still has one live row'
);

select is(
  (
    select s.score_text
      from public.live_match_state s
      join public.tournaments t on t.id = s.tournament_id
     where t.slug = 'pgtap-live-row'
  ),
  '6-4,3-3',
  'the current set text is the later frame'
);

select is(
  (
    select s.occurred_at
      from public.live_match_state s
      join public.tournaments t on t.id = s.tournament_id
     where t.slug = 'pgtap-live-row'
  ),
  '2026-10-09 18:00:40+00'::timestamptz,
  'occurred_at is the provider clock, not a second event row'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-row'),
    (select id from public.tournaments where slug = 'pgtap-live-row'),
    'pgtap-live-row-r0',
    'in_play',
    '6-4,3-3',
    '40-30',
    null,
    null,
    2,
    'updatedAt',
    'frame-b',
    'replay',
    '2026-10-09 18:02:00+00',
    '2026-10-09 18:00:40+00'
  ),
  'ignored',
  'an equal provider clock does not write again'
);

select is(
  (
    select m.winner_player_id is null and m.official_score is null
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-live-row'
  ),
  true,
  'a duplicate live frame does not write an official score'
);

select * from finish();
rollback;
