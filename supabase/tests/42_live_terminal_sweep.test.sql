-- Terminal live rows older than 24 hours are removed by the existing sync-facts job.
-- Run: npx supabase test db

begin;

select plan(8);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-live-sweep', 'Live Sweep Fixture', 'atp', '2026-10-09', '2026-10-10',
  'force_off', false
);

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, g
  from public.tournaments
  cross join generate_series(0, 3) as g
 where slug = 'pgtap-live-sweep';

select public.upsert_live_match_state(
  (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-sweep' and m.index_in_round = 0),
  (select id from public.tournaments where slug = 'pgtap-live-sweep'),
  'pgtap-live-sweep-old',
  'provisional_final',
  '6-4,6-3',
  null,
  null,
  null,
  1,
  'receivedAt',
  'old',
  'rest',
  '2026-10-08 18:00:00+00',
  null
);

select public.upsert_live_match_state(
  (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-sweep' and m.index_in_round = 1),
  (select id from public.tournaments where slug = 'pgtap-live-sweep'),
  'pgtap-live-sweep-fresh',
  'provisional_final',
  '7-5',
  null,
  null,
  null,
  1,
  'receivedAt',
  'fresh',
  'rest',
  now(),
  null
);

select public.upsert_live_match_state(
  (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-sweep' and m.index_in_round = 2),
  (select id from public.tournaments where slug = 'pgtap-live-sweep'),
  'pgtap-live-sweep-play',
  'in_play',
  '6-4,3-3',
  '40-15',
  null,
  null,
  1,
  'receivedAt',
  'play',
  'rest',
  '2026-10-08 18:00:00+00',
  null
);

select public.upsert_live_match_state(
  (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-sweep' and m.index_in_round = 3),
  (select id from public.tournaments where slug = 'pgtap-live-sweep'),
  'pgtap-live-sweep-hold',
  'suspended',
  '6-4',
  null,
  null,
  null,
  1,
  'receivedAt',
  'hold',
  'rest',
  '2026-10-08 18:00:00+00',
  null
);

update public.live_match_state
   set updated_at = now() - interval '25 hours'
 where public_ref in ('pgtap-live-sweep-old', 'pgtap-live-sweep-play', 'pgtap-live-sweep-hold');

select is(
  public.sweep_terminal_live_state(),
  1,
  'one terminal row older than a day is removed'
);

select is(
  (select count(*)::int from public.live_match_state where public_ref = 'pgtap-live-sweep-old'),
  0,
  'the old provisional final is gone'
);

select is(
  (select count(*)::int from public.live_match_state where public_ref = 'pgtap-live-sweep-fresh'),
  1,
  'a fresh provisional final stays'
);

select is(
  (select count(*)::int from public.live_match_state where public_ref = 'pgtap-live-sweep-play'),
  1,
  'an old in-play row stays'
);

select is(
  (select count(*)::int from public.live_match_state where public_ref = 'pgtap-live-sweep-hold'),
  1,
  'an old suspended row stays'
);

select is(
  (
    select count(*)::int
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-live-sweep'
       and m.winner_player_id is null
       and m.settled_at is null
  ),
  4,
  'the sweep does not settle matches'
);

set local role anon;

select throws_ok(
  $$select public.sweep_terminal_live_state()$$,
  '42501',
  null,
  'anon cannot sweep'
);

reset role;

select ok(
  position(
    'sweep_terminal_live_state'
    in pg_get_functiondef('public.invoke_sync_facts()'::regprocedure)
  ) > 0
  and not exists (
    select 1
      from cron.job
     where command ilike '%sweep_terminal_live_state%'
  ),
  'sync-facts cron calls the sweep and no new job does'
);

select * from finish();
rollback;
