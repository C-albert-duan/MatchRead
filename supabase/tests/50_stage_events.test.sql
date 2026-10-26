-- stage_events: a user writes and reads only their own rows; anon writes
-- nothing; the rate function returns aggregates only.

begin;

select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e501', 'pgtap-stage-a@example.test'),
  ('00000000-0000-0000-0000-00000000e502', 'pgtap-stage-b@example.test');

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000e501', 'Stage A'),
  ('00000000-0000-0000-0000-00000000e502', 'Stage B')
on conflict (id) do nothing;

insert into public.stage_events (user_id, state, at) values
  ('00000000-0000-0000-0000-00000000e502', 'morning', '2026-10-26 09:05:00+00'),
  ('00000000-0000-0000-0000-00000000e502', 'live', '2026-10-26 09:40:00+00'),
  ('00000000-0000-0000-0000-00000000e502', 'next', '2026-10-26 09:55:00+00');

select throws_ok(
  $$insert into public.stage_events (user_id, state)
    values ('00000000-0000-0000-0000-00000000e501', 'sideways')$$,
  '23514',
  null,
  'an unknown state is rejected'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000e501"}', true);

select lives_ok(
  $$insert into public.stage_events (state, match_ref) values ('live', 'syn16-r0-m0')$$,
  'a user records their own state change'
);

select is(
  (select user_id from public.stage_events where match_ref = 'syn16-r0-m0'),
  '00000000-0000-0000-0000-00000000e501'::uuid,
  'user_id defaults to the caller'
);

select throws_ok(
  $$insert into public.stage_events (user_id, state)
    values ('00000000-0000-0000-0000-00000000e502', 'live')$$,
  '42501',
  null,
  'a user cannot write a row for someone else'
);

select is(
  (select count(*)::int from public.stage_events),
  1,
  'a user reads only their own rows'
);

select throws_ok(
  $$delete from public.stage_events$$,
  '42501',
  null,
  'a user cannot delete stage events, even their own'
);

select results_eq(
  $$select events::int, users::int, max_per_user_hour::int
      from public.stage_event_rates('2026-10-26 00:00:00+00')$$,
  $$values (4, 2, 3)$$,
  'rates are aggregates across users'
);

select results_eq(
  $$select events::int, users::int, max_per_user_hour::int
      from public.stage_event_rates('2099-01-01 00:00:00+00')$$,
  $$values (0, 0, 0)$$,
  'an empty window reports zeros, not nulls'
);

reset role;
set local role anon;

select throws_ok(
  $$insert into public.stage_events (state) values ('live')$$,
  '42501',
  null,
  'anon cannot write stage events'
);

select throws_ok(
  $$select * from public.stage_event_rates(now() - interval '1 day')$$,
  '42501',
  null,
  'anon cannot read stage rates'
);

select * from finish();
rollback;
