-- Public live scores. Browser roles may read. Only service_role may write.
-- Run: npx supabase test db

begin;

select plan(19);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-live-rls', 'Live RLS Fixture', 'atp', '2026-10-09', '2026-10-10',
  'force_off', false
);

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 0 from public.tournaments where slug = 'pgtap-live-rls';

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 1 from public.tournaments where slug = 'pgtap-live-rls';

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-rls' and m.index_in_round = 0),
    (select id from public.tournaments where slug = 'pgtap-live-rls'),
    'pgtap-live-rls-r0',
    'in_play',
    '6-3',
    '40-15',
    null,
    null,
    1,
    'receivedAt',
    'frame-rls',
    'rest',
    '2026-10-09 18:00:00+00',
    null
  ),
  'applied',
  'owner seeds one public score'
);

select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.live_match_state'::regclass),
  'row security is on'
);

select ok(
  exists (
    select 1
      from pg_policy
     where polrelid = 'public.live_match_state'::regclass
       and polname = 'live_match_state_select'
       and polcmd = 'r'
       and polroles = array[
         (select oid from pg_roles where rolname = 'anon'),
         (select oid from pg_roles where rolname = 'authenticated')
       ]::oid[]
  ),
  'anon and authenticated may select'
);

select ok(
  not exists (
    select 1
      from pg_policy
     where polrelid = 'public.live_match_state'::regclass
       and polcmd in ('a', 'w', 'd', '*')
  ),
  'there is no write policy'
);

select ok(
  has_table_privilege('anon', 'public.live_match_state', 'select')
  and not has_table_privilege('anon', 'public.live_match_state', 'insert')
  and not has_table_privilege('anon', 'public.live_match_state', 'update')
  and not has_table_privilege('anon', 'public.live_match_state', 'delete')
  and not has_table_privilege('anon', 'public.live_match_state', 'truncate')
  and has_table_privilege('authenticated', 'public.live_match_state', 'select')
  and not has_table_privilege('authenticated', 'public.live_match_state', 'insert')
  and not has_table_privilege('authenticated', 'public.live_match_state', 'update')
  and not has_table_privilege('authenticated', 'public.live_match_state', 'delete')
  and not has_table_privilege('authenticated', 'public.live_match_state', 'truncate')
  and has_table_privilege('service_role', 'public.live_match_state', 'insert')
  and has_table_privilege('service_role', 'public.live_match_state', 'update')
  and has_table_privilege('service_role', 'public.live_match_state', 'delete'),
  'grants match public read and service write'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select score_text from public.live_match_state where public_ref = 'pgtap-live-rls-r0'),
  '6-3',
  'anon can read a live score'
);

select throws_ok(
  $$insert into public.live_match_state (
      match_id, tournament_id, public_ref, phase, sequence, sequence_source,
      frame_key, source, received_at
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      'pgtap-live-rls-anon',
      'in_play', 1, 'receivedAt', 'k', 'rest', '2026-10-09 18:00:00+00'
    )$$,
  '42501',
  null,
  'anon cannot insert'
);

select throws_ok(
  $$update public.live_match_state set score_text = '6-0' where public_ref = 'pgtap-live-rls-r0'$$,
  '42501',
  null,
  'anon cannot update'
);

select throws_ok(
  $$delete from public.live_match_state where public_ref = 'pgtap-live-rls-r0'$$,
  '42501',
  null,
  'anon cannot delete'
);

select throws_ok(
  $$truncate public.live_match_state$$,
  '42501',
  null,
  'anon cannot truncate'
);

select throws_ok(
  $$select public.upsert_live_match_state(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      'nope', 'in_play', null, null, null, null,
      1, 'receivedAt', 'k', 'rest', '2026-10-09 18:00:00+00', null
    )$$,
  '42501',
  null,
  'anon cannot call the live writer'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select is(
  (select score_text from public.live_match_state where public_ref = 'pgtap-live-rls-r0'),
  '6-3',
  'a signed-in user can read a live score'
);

select throws_ok(
  $$insert into public.live_match_state (
      match_id, tournament_id, public_ref, phase, sequence, sequence_source,
      frame_key, source, received_at
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      'pgtap-live-rls-auth',
      'in_play', 1, 'receivedAt', 'k', 'rest', '2026-10-09 18:00:00+00'
    )$$,
  '42501',
  null,
  'a signed-in user cannot insert'
);

select throws_ok(
  $$update public.live_match_state set score_text = '6-0' where public_ref = 'pgtap-live-rls-r0'$$,
  '42501',
  null,
  'a signed-in user cannot update'
);

select throws_ok(
  $$delete from public.live_match_state where public_ref = 'pgtap-live-rls-r0'$$,
  '42501',
  null,
  'a signed-in user cannot delete'
);

select throws_ok(
  $$truncate public.live_match_state$$,
  '42501',
  null,
  'a signed-in user cannot truncate'
);

select throws_ok(
  $$select public.upsert_live_match_state(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      'nope', 'in_play', null, null, null, null,
      1, 'receivedAt', 'k', 'rest', '2026-10-09 18:00:00+00', null
    )$$,
  '42501',
  null,
  'a signed-in user cannot call the live writer'
);

reset role;
set local role service_role;

select lives_ok(
  $$insert into public.live_match_state (
      match_id, tournament_id, public_ref, phase, score_text, points_text,
      sequence, sequence_source, frame_key, source, received_at, flag
    )
    select m.id, t.id, 'pgtap-live-rls-r1', 'in_play', '6-4', '15-0',
           1, 'receivedAt', 'frame-rls-1', 'rest', '2026-10-09 18:02:00+00', 'live'
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-live-rls'
       and m.index_in_round = 1$$,
  'service_role can insert a live score'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select score_text from public.live_match_state where public_ref = 'pgtap-live-rls-r1'),
  '6-4',
  'anon can read a score written by service_role'
);

select * from finish();
rollback;
