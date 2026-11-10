-- Migrations 0047 and 0048: service-only settlement RPCs, founder-only ops reads,
-- the guarded client telemetry sink, and no client bracket writes
-- (fix list P0-1, P0-2, P0-3).
-- Run: npx supabase test db

begin;

select plan(24);

-- P0-1: browser roles cannot execute the service RPCs -----------------------
select ok(not has_function_privilege('anon', 'public.claim_settlement(uuid, text, uuid, uuid)', 'execute'),
  'anon cannot execute claim_settlement');
select ok(not has_function_privilege('authenticated', 'public.claim_settlement(uuid, text, uuid, uuid)', 'execute'),
  'authenticated cannot execute claim_settlement');
select ok(not has_function_privilege('anon', 'public.unwind_settlement_parent(uuid)', 'execute'),
  'anon cannot execute unwind_settlement_parent');
select ok(not has_function_privilege('authenticated', 'public.unwind_settlement_parent(uuid)', 'execute'),
  'authenticated cannot execute unwind_settlement_parent');
select ok(not has_function_privilege('anon', 'public.refresh_lock_at(uuid)', 'execute'),
  'anon cannot execute refresh_lock_at');
select ok(not has_function_privilege('authenticated', 'public.refresh_lock_at(uuid)', 'execute'),
  'authenticated cannot execute refresh_lock_at');
select ok(has_function_privilege('service_role', 'public.claim_settlement(uuid, text, uuid, uuid)', 'execute'),
  'service_role keeps claim_settlement');
select ok(has_function_privilege('service_role', 'public.refresh_lock_at(uuid)', 'execute'),
  'service_role keeps refresh_lock_at');

-- P0-2: table privileges -----------------------------------------------------
select ok(not has_table_privilege('anon', 'public.ops_events', 'insert'), 'anon cannot insert ops_events');
select ok(not has_table_privilege('authenticated', 'public.ops_events', 'insert'), 'authenticated cannot insert ops_events');
select ok(not has_table_privilege('anon', 'public.ops_events', 'select'), 'anon cannot read ops_events');
select ok(not has_table_privilege('authenticated', 'public.founders', 'select'), 'founders is not readable by clients');

-- P0-3: no client writes to brackets or picks --------------------------------
select ok(not has_table_privilege('authenticated', 'public.brackets', 'update'),
  'authenticated cannot update brackets');
select ok(not has_table_privilege('authenticated', 'public.picks', 'insert'),
  'authenticated cannot insert picks');

-- Fixtures ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'pgtap-founder@example.test'),
  ('00000000-0000-0000-0000-0000000f0002', 'pgtap-player@example.test');
insert into public.founders (user_id) values ('00000000-0000-0000-0000-0000000f0001');
insert into public.ops_events (kind, name, payload)
  values ('integrity', 'publish_blocked', '{"slug":"pgtap-ops"}');

-- Anon telemetry sink --------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok(
  $$select public.log_client_event('error', 'pgtap_client_error', '{"message":"boom"}')$$,
  'anon can log a client error');
select throws_ok(
  $$select public.log_client_event('integrity', 'pgtap_x', '{}')$$,
  '22023', 'invalid kind', 'kind is limited to error and event');
select throws_ok(
  $$select public.log_client_event('event', 'publish_blocked', '{}')$$,
  '42501', 'reserved name', 'pipeline integrity names are refused');
select throws_ok(
  $$select public.log_client_event('event', 'pgtap_big', jsonb_build_object('x', repeat('a', 5000)))$$,
  '22023', 'payload too large', 'payload is capped');
select throws_ok(
  $$insert into public.ops_events (kind, name) values ('integrity', 'publish_blocked')$$,
  '42501', null, 'anon cannot insert directly');

-- Non-founder reads nothing -------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000f0002"}', true);

select ok(not public.is_founder(), 'player is not a founder');
select is((select count(*)::int from public.ops_events), 0, 'player reads no ops rows');

-- Founder reads everything ---------------------------------------------------------
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000f0001"}', true);

select ok(public.is_founder(), 'founder is a founder');
select ok(
  (select count(*) from public.ops_events where name = 'publish_blocked' and payload->>'slug' = 'pgtap-ops') = 1,
  'founder reads pipeline rows');

reset role;
select is(
  (select payload->>'origin' from public.ops_events where name = 'pgtap_client_error'),
  'client',
  'client rows are stamped origin = client');

select * from finish();
rollback;
