-- Canonical sets, game strings, flag, and provider order.
-- Run: npx supabase test db

begin;

select plan(9);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-live-sem', 'Live Semantics Fixture', 'atp', '2026-10-09', '2026-10-10',
  'force_off', false
);

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 0 from public.tournaments where slug = 'pgtap-live-sem';

select ok(
  not exists (
    select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'live_match_state'
       and a.attname = 'winner_side'
       and a.attnum > 0
       and not a.attisdropped
  ),
  'the live row has no winner_side'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-sem'),
    (select id from public.tournaments where slug = 'pgtap-live-sem'),
    'pgtap-live-sem-r0',
    'in_play',
    '6-4,3-3',
    '40-AD',
    null,
    null,
    1000,
    'updatedAt',
    'frame-a',
    'rest',
    '2026-10-09 18:01:00+00',
    '2026-10-09 18:00:01+00'
  ),
  'applied',
  'a provider-ordered frame is stored'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-sem'),
    (select id from public.tournaments where slug = 'pgtap-live-sem'),
    'pgtap-live-sem-r0',
    'in_play',
    '6-4,6-2',
    '0-0',
    null,
    null,
    500,
    'updatedAt',
    'frame-old',
    'rest',
    '2026-10-09 18:05:00+00',
    '2026-10-09 18:00:00+00'
  ),
  'ignored',
  'an earlier provider clock does not replace the row'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-sem'),
    (select id from public.tournaments where slug = 'pgtap-live-sem'),
    'pgtap-live-sem-r0',
    'in_play',
    '0-0',
    '15-0',
    null,
    null,
    2000,
    'receivedAt',
    'frame-receipt',
    'rest',
    '2026-10-09 19:00:00+00',
    null
  ),
  'ignored',
  'receipt time does not override provider order'
);

select results_eq(
  $$select score_text, points_text, flag, stats is null, received_at = '2026-10-09 18:01:00+00'::timestamptz
      from public.live_match_state s
      join public.tournaments t on t.id = s.tournament_id
     where t.slug = 'pgtap-live-sem'$$,
  $$values ('6-4,3-3'::text, '40-AD'::text, 'live'::text, true, true)$$,
  'sets, game strings, flag, and empty stats stay on the first frame'
);

select throws_ok(
  $$update public.live_match_state
       set points_text = '3-2'
     where public_ref = 'pgtap-live-sem-r0'$$,
  '23514',
  null,
  'a non-point game value is rejected'
);

select throws_ok(
  $$update public.live_match_state
       set stats = '{"payload":{"score":"6-0"}}'::jsonb
     where public_ref = 'pgtap-live-sem-r0'$$,
  '23514',
  null,
  'stats cannot hold the raw provider payload'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-sem'),
    (select id from public.tournaments where slug = 'pgtap-live-sem'),
    'pgtap-live-sem-r0',
    'provisional_final',
    '6-4,6-2',
    null,
    null,
    'p-a',
    3000,
    'updatedAt',
    'frame-final',
    'rest',
    '2026-10-09 18:10:00+00',
    '2026-10-09 18:09:00+00'
  ),
  'applied',
  'a later provider clock replaces the current row'
);

select is(
  (
    select flag
      from public.live_match_state s
      join public.tournaments t on t.id = s.tournament_id
     where t.slug = 'pgtap-live-sem'
  ),
  'provisional',
  'a provisional final derives the provisional flag'
);

select * from finish();
rollback;
