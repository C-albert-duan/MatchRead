-- Decision: incoming.occurred_at = stored.occurred_at is a no-op.
-- A later network arrival does not replace an equivalent provider clock.
-- Run: npx supabase test db

begin;

select plan(3);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-live-equal', 'Live Equal Clock Fixture', 'atp', '2026-10-09', '2026-10-10',
  'force_off', false
);

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 0 from public.tournaments where slug = 'pgtap-live-equal';

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-equal'),
    (select id from public.tournaments where slug = 'pgtap-live-equal'),
    'pgtap-live-equal-r0',
    'in_play',
    '6-4',
    '30-0',
    'a',
    null,
    100,
    'updatedAt',
    'frame-equal-stored',
    'rest',
    '2026-10-09 18:00:02+00',
    '2026-10-09 18:00:01+00'
  ),
  'applied',
  'the stored provider clock is 18:00:01Z'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-equal'),
    (select id from public.tournaments where slug = 'pgtap-live-equal'),
    'pgtap-live-equal-r0',
    'provisional_final',
    '6-0,6-0',
    '40-AD',
    'b',
    'p-late',
    900,
    'updatedAt',
    'frame-equal-late',
    'socket',
    '2026-10-09 19:30:00+00',
    '2026-10-09 14:00:01-04'
  ),
  'ignored',
  'the same instant, written with another offset and a later receipt, is a no-op'
);

select results_eq(
  $$select phase, score_text, points_text, serving_side, provisional_winner_ref, flag,
           occurred_at, received_at
      from public.live_match_state s
      join public.tournaments t on t.id = s.tournament_id
     where t.slug = 'pgtap-live-equal'$$,
  $$values (
      'in_play'::text,
      '6-4'::text,
      '30-0'::text,
      'a'::text,
      null::text,
      'live'::text,
      '2026-10-09 18:00:01+00'::timestamptz,
      '2026-10-09 18:00:02+00'::timestamptz
    )$$,
  'equal chronology keeps the stored frame, including its earlier receipt'
);

select * from finish();
rollback;
