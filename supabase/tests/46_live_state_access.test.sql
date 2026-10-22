-- live_match_state access, keys, indexes, and phase.
-- Browser roles are anon and authenticated. This runner does not assume
-- the authenticator role. Policies, grants, keys, and indexes are read
-- from pg_catalog. The three roles are set directly, as in
-- 40_live_state_rls.test.sql.
-- Run: npx supabase test db

begin;

select plan(42);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-live-access', 'Live Access Fixture', 'atp', '2026-10-09', '2026-10-10',
  'force_off', false
);

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 0 from public.tournaments where slug = 'pgtap-live-access';

insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 1 from public.tournaments where slug = 'pgtap-live-access';

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-access' and m.index_in_round = 0),
    (select id from public.tournaments where slug = 'pgtap-live-access'),
    'pgtap-live-access-r0',
    'in_play',
    '6-3',
    '40-15',
    null,
    null,
    1,
    'receivedAt',
    'frame-access',
    'rest',
    '2026-10-09 18:00:00+00',
    null
  ),
  'applied',
  'owner seeds one in-play row'
);

select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.live_match_state'::regclass),
  'row security is on'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_policy
     where polrelid = 'public.live_match_state'::regclass
       and polname = 'live_match_state_select'
       and polcmd = 'r'
       and polroles = array[
         (select oid from pg_catalog.pg_roles where rolname = 'anon'),
         (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
       ]::oid[]
  ),
  'anon and authenticated have the select policy'
);

select ok(
  not exists (
    select 1
      from pg_catalog.pg_policy
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
  and has_table_privilege('authenticated', 'public.live_match_state', 'select')
  and not has_table_privilege('authenticated', 'public.live_match_state', 'insert')
  and not has_table_privilege('authenticated', 'public.live_match_state', 'update')
  and not has_table_privilege('authenticated', 'public.live_match_state', 'delete')
  and has_table_privilege('service_role', 'public.live_match_state', 'select')
  and has_table_privilege('service_role', 'public.live_match_state', 'insert')
  and has_table_privilege('service_role', 'public.live_match_state', 'update')
  and has_table_privilege('service_role', 'public.live_match_state', 'delete'),
  'grants are public read and service write'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.upsert_live_match_state(uuid,uuid,text,text,text,text,text,text,bigint,text,text,text,timestamptz,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.upsert_live_match_state(uuid,uuid,text,text,text,text,text,text,bigint,text,text,text,timestamptz,timestamptz)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.upsert_live_match_state(uuid,uuid,text,text,text,text,text,text,bigint,text,text,text,timestamptz,timestamptz)',
    'execute'
  ),
  'only service_role may call the live writer'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
      join pg_catalog.pg_namespace n on n.oid = tbl.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = tbl.oid and a.attnum = i.indkey[0]
     where n.nspname = 'public'
       and tbl.relname = 'live_match_state'
       and i.indisprimary
       and i.indnkeyatts = 1
       and a.attname = 'match_id'
  ),
  'primary key is match_id'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
      join pg_catalog.pg_namespace n on n.oid = tbl.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = tbl.oid and a.attnum = i.indkey[0]
     where n.nspname = 'public'
       and tbl.relname = 'live_match_state'
       and i.indisunique
       and not i.indisprimary
       and i.indnkeyatts = 1
       and a.attname = 'public_ref'
  ),
  'public_ref is unique'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class idx on idx.oid = i.indexrelid
      join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
      join pg_catalog.pg_namespace n on n.oid = tbl.relnamespace
     where n.nspname = 'public'
       and tbl.relname = 'live_match_state'
       and idx.relname = 'live_match_state_tournament_phase_idx'
       and not i.indisunique
  ),
  'tournament and phase index exists'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class idx on idx.oid = i.indexrelid
      join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
      join pg_catalog.pg_namespace n on n.oid = tbl.relnamespace
     where n.nspname = 'public'
       and tbl.relname = 'live_match_state'
       and idx.relname = 'live_match_state_flag_idx'
       and pg_get_expr(i.indpred, i.indrelid) ilike '%flag IS NOT NULL%'
  ),
  'flag index exists'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'live_match_state'
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%phase%'
       and pg_get_constraintdef(c.oid) like '%in_play%'
       and pg_get_constraintdef(c.oid) like '%suspended%'
       and pg_get_constraintdef(c.oid) like '%provisional_final%'
  ),
  'phase is in_play, suspended, or provisional_final'
);

select ok(
  not exists (
    select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'live_match_state'
       and a.attname = 'status'
       and a.attnum > 0
       and not a.attisdropped
  ),
  'live status is phase, not a status column'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select score_text from public.live_match_state where public_ref = 'pgtap-live-access-r0'),
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
      'pgtap-live-access-anon',
      'in_play', 1, 'receivedAt', 'k', 'rest', '2026-10-09 18:00:00+00'
    )$$,
  '42501',
  null,
  'anon cannot insert'
);

select throws_ok(
  $$update public.live_match_state set score_text = '6-0' where public_ref = 'pgtap-live-access-r0'$$,
  '42501',
  null,
  'anon cannot update'
);

select throws_ok(
  $$delete from public.live_match_state where public_ref = 'pgtap-live-access-r0'$$,
  '42501',
  null,
  'anon cannot delete'
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
  (select score_text from public.live_match_state where public_ref = 'pgtap-live-access-r0'),
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
      'pgtap-live-access-auth',
      'in_play', 1, 'receivedAt', 'k', 'rest', '2026-10-09 18:00:00+00'
    )$$,
  '42501',
  null,
  'a signed-in user cannot insert'
);

select throws_ok(
  $$update public.live_match_state set score_text = '6-0' where public_ref = 'pgtap-live-access-r0'$$,
  '42501',
  null,
  'a signed-in user cannot update'
);

select throws_ok(
  $$delete from public.live_match_state where public_ref = 'pgtap-live-access-r0'$$,
  '42501',
  null,
  'a signed-in user cannot delete'
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
    select m.id, t.id, 'pgtap-live-access-r1', 'in_play', '6-4', '15-0',
           1, 'receivedAt', 'frame-access-1', 'rest', '2026-10-09 18:02:00+00', 'live'
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-live-access'
       and m.index_in_round = 1$$,
  'service_role can insert'
);

select lives_ok(
  $$update public.live_match_state
       set score_text = '6-1'
     where public_ref = 'pgtap-live-access-r1'$$,
  'service_role can update'
);

select is(
  (select score_text from public.live_match_state where public_ref = 'pgtap-live-access-r1'),
  '6-1',
  'service_role update is stored'
);

select lives_ok(
  $$delete from public.live_match_state where public_ref = 'pgtap-live-access-r1'$$,
  'service_role can delete'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select score_text from public.live_match_state where public_ref = 'pgtap-live-access-r0'),
  '6-3',
  'anon still reads the row service_role left in place'
);

select is(
  (select count(*)::int from public.live_match_state where public_ref = 'pgtap-live-access-r1'),
  0,
  'anon sees the row service_role deleted'
);

reset role;

select throws_ok(
  $$insert into public.live_match_state (
      match_id, tournament_id, public_ref, phase, sequence, sequence_source,
      frame_key, source, received_at
    )
    select m.id, t.id, 'pgtap-live-access-dup', 'in_play', 9, 'receivedAt',
           'dup', 'rest', '2026-10-09 18:00:00+00'
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-live-access'
       and m.index_in_round = 0$$,
  '23505',
  null,
  'match_id rejects a second row'
);

select throws_ok(
  $$insert into public.live_match_state (
      match_id, tournament_id, public_ref, phase, sequence, sequence_source,
      frame_key, source, received_at
    )
    select m.id, t.id, 'pgtap-live-access-r0', 'in_play', 9, 'receivedAt',
           'dup-ref', 'rest', '2026-10-09 18:00:00+00'
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-live-access'
       and m.index_in_round = 1$$,
  '23505',
  null,
  'public_ref rejects a second row'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-access' and m.index_in_round = 0),
    (select id from public.tournaments where slug = 'pgtap-live-access'),
    'pgtap-live-access-r0',
    'finished',
    '6-0',
    '0-0',
    null,
    null,
    9,
    'receivedAt',
    'frame-finished',
    'rest',
    '2026-10-09 18:09:00+00',
    null
  ),
  'ignored',
  'a phase outside the three live statuses is ignored'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-access' and m.index_in_round = 0),
    (select id from public.tournaments where slug = 'pgtap-live-access'),
    'pgtap-live-access-r0',
    'in_play',
    '6-0',
    '0-0',
    null,
    null,
    9,
    'receivedAt',
    'frame-wire',
    'wire',
    '2026-10-09 18:09:00+00',
    null
  ),
  'ignored',
  'a source outside rest, socket, and replay is ignored'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-access' and m.index_in_round = 0),
    (select id from public.tournaments where slug = 'pgtap-live-access'),
    'pgtap-live-access-r0',
    'in_play',
    '6-0',
    '0-0',
    null,
    null,
    9,
    'clock',
    'frame-clock',
    'rest',
    '2026-10-09 18:09:00+00',
    null
  ),
  'ignored',
  'a sequence source outside seq, updatedAt, and receivedAt is ignored'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-access' and m.index_in_round = 0),
    (select id from public.tournaments where slug = 'pgtap-live-access'),
    'pgtap-live-access-r0',
    'in_play',
    '6-0',
    '0-0',
    'x',
    null,
    9,
    'receivedAt',
    'frame-serve',
    'rest',
    '2026-10-09 18:09:00+00',
    null
  ),
  'ignored',
  'a serving side outside a and b is ignored'
);

select results_eq(
  $$select phase, score_text, points_text, flag, sequence
      from public.live_match_state
     where public_ref = 'pgtap-live-access-r0'$$,
  $$values ('in_play'::text, '6-3'::text, '40-15'::text, 'live'::text, 1::bigint)$$,
  'rejected statuses leave the in-play row in place'
);

select throws_ok(
  $$update public.live_match_state
       set phase = 'finished'
     where public_ref = 'pgtap-live-access-r0'$$,
  '23514',
  null,
  'a direct write cannot store a phase outside the three live statuses'
);

select throws_ok(
  $$update public.live_match_state
       set flag = 'stale'
     where public_ref = 'pgtap-live-access-r0'$$,
  '23514',
  null,
  'flag stays live, provisional, or null'
);

select throws_ok(
  $$update public.live_match_state
       set source = 'wire'
     where public_ref = 'pgtap-live-access-r0'$$,
  '23514',
  null,
  'source stays rest, socket, or replay'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-access' and m.index_in_round = 0),
    (select id from public.tournaments where slug = 'pgtap-live-access'),
    'pgtap-live-access-r0',
    'suspended',
    '6-4',
    '30-30',
    null,
    null,
    2,
    'receivedAt',
    'frame-suspended',
    'rest',
    '2026-10-09 18:10:00+00',
    null
  ),
  'applied',
  'suspended is stored'
);

select is(
  (select flag from public.live_match_state where public_ref = 'pgtap-live-access-r0'),
  null,
  'suspended has no flag'
);

select is(
  public.upsert_live_match_state(
    (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id where t.slug = 'pgtap-live-access' and m.index_in_round = 0),
    (select id from public.tournaments where slug = 'pgtap-live-access'),
    'pgtap-live-access-r0',
    'provisional_final',
    '6-4,6-2',
    null,
    null,
    null,
    3,
    'receivedAt',
    'frame-final',
    'replay',
    '2026-10-09 18:20:00+00',
    null
  ),
  'applied',
  'provisional_final is stored'
);

select is(
  (select flag from public.live_match_state where public_ref = 'pgtap-live-access-r0'),
  'provisional',
  'provisional_final sets the provisional flag'
);

select * from finish();
rollback;
