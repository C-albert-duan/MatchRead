-- I7: a stale or out-of-order frame cannot roll the stored live row backward.
-- Captured live rows have updatedAt and no seq, so an equal clock is a no-op.
-- Run: npx supabase test db

begin;

select plan(8);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-live-i7', 'Live Monotonic Fixture', 'atp', '2026-10-09', '2026-10-10',
  'force_off', false
);

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 0 from public.tournaments where slug = 'pgtap-live-i7';

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-i7'),
    (select id from public.tournaments where slug = 'pgtap-live-i7'),
    'pgtap-live-i7-r0',
    'in_play', '6-4', '15-0', 'a', null,
    1, 'updatedAt', 'frame-first', 'rest',
    '2026-10-09 18:00:01+00', '2026-10-09 18:00:00+00'
  ),
  'applied',
  'first frame inserts'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-i7'),
    (select id from public.tournaments where slug = 'pgtap-live-i7'),
    'pgtap-live-i7-r0',
    'in_play', '6-4,3-3', '30-0', 'b', null,
    2, 'updatedAt', 'frame-newer', 'rest',
    '2026-10-09 18:05:01+00', '2026-10-09 18:05:00+00'
  ),
  'applied',
  'newer frame updates'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-i7'),
    (select id from public.tournaments where slug = 'pgtap-live-i7'),
    'pgtap-live-i7-r0',
    'in_play', '0-0', '0-0', 'a', null,
    50, 'updatedAt', 'frame-older', 'socket',
    '2026-10-09 19:00:00+00', '2026-10-09 18:00:00+00'
  ),
  'ignored',
  'older frame does nothing'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-i7'),
    (select id from public.tournaments where slug = 'pgtap-live-i7'),
    'pgtap-live-i7-r0',
    'provisional_final', '6-0,6-0', null, null, 'p-late',
    90, 'updatedAt', 'frame-equal', 'socket',
    '2026-10-09 19:00:00+00', '2026-10-09 14:05:00-04'
  ),
  'ignored',
  'equal timestamp does nothing'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-i7'),
    (select id from public.tournaments where slug = 'pgtap-live-i7'),
    'pgtap-live-i7-r0',
    'in_play', '6-4', '15-0', 'a', null,
    1, 'updatedAt', 'frame-first', 'rest',
    '2026-10-09 19:10:00+00', '2026-10-09 18:00:00+00'
  ),
  'ignored',
  'replaying the first frame does nothing'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-i7'),
    (select id from public.tournaments where slug = 'pgtap-live-i7'),
    'pgtap-live-i7-r0',
    'in_play', '0-0', '0-0', 'a', null,
    50, 'updatedAt', 'frame-older', 'socket',
    '2026-10-09 19:11:00+00', '2026-10-09 18:00:00+00'
  ),
  'ignored',
  'replaying the older frame does nothing'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-i7'),
    (select id from public.tournaments where slug = 'pgtap-live-i7'),
    'pgtap-live-i7-r0',
    'in_play', '6-4,3-3', '40-AD', 'a', null,
    2, 'updatedAt', 'frame-newer-again', 'rest',
    '2026-10-09 19:12:00+00', '2026-10-09 18:05:00+00'
  ),
  'ignored',
  'replaying the current frame does nothing'
);

select results_eq(
  $$select phase, score_text, points_text, serving_side, occurred_at, received_at
      from public.live_match_state s
      join public.tournaments t on t.id = s.tournament_id
     where t.slug = 'pgtap-live-i7'$$,
  $$values (
      'in_play'::text,
      '6-4,3-3'::text,
      '30-0'::text,
      'b'::text,
      '2026-10-09 18:05:00+00'::timestamptz,
      '2026-10-09 18:05:01+00'::timestamptz
    )$$,
  'restart leaves the newer frame'
);

select * from finish();
rollback;
