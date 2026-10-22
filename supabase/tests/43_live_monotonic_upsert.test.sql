-- A later receipt does not move the live row backward.
-- Run: npx supabase test db

begin;

select plan(4);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-live-order', 'Live Order Fixture', 'atp', '2026-10-09', '2026-10-10',
  'force_off', false
);

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 0 from public.tournaments where slug = 'pgtap-live-order';

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-order'),
    (select id from public.tournaments where slug = 'pgtap-live-order'),
    'pgtap-live-order-r0',
    'in_play',
    '6-4',
    '15-0',
    'a',
    null,
    100,
    'updatedAt',
    'frame-clock',
    'rest',
    '2026-10-09 18:00:02+00',
    '2026-10-09 18:00:01+00'
  ),
  'applied',
  'the first provider clock is stored'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-order'),
    (select id from public.tournaments where slug = 'pgtap-live-order'),
    'pgtap-live-order-r0',
    'in_play',
    '0-0',
    '0-0',
    'b',
    null,
    500,
    'updatedAt',
    'frame-late-receipt',
    'rest',
    '2026-10-09 19:00:00+00',
    '2026-10-09 18:00:00+00'
  ),
  'ignored',
  'a higher sequence and a later receipt do not pass an older clock'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-order'),
    (select id from public.tournaments where slug = 'pgtap-live-order'),
    'pgtap-live-order-r0',
    'provisional_final',
    '6-0,6-0',
    null,
    null,
    'p-a',
    900,
    'updatedAt',
    'frame-equal-clock',
    'rest',
    '2026-10-09 19:30:00+00',
    '2026-10-09 18:00:01+00'
  ),
  'ignored',
  'an equal provider clock is a no-op'
);

select results_eq(
  $$select score_text, points_text, serving_side, phase, occurred_at, received_at
      from public.live_match_state s
      join public.tournaments t on t.id = s.tournament_id
     where t.slug = 'pgtap-live-order'$$,
  $$values (
      '6-4'::text,
      '15-0'::text,
      'a'::text,
      'in_play'::text,
      '2026-10-09 18:00:01+00'::timestamptz,
      '2026-10-09 18:00:02+00'::timestamptz
    )$$,
  'the stored clock, score, and receipt stay'
);

select * from finish();
rollback;
