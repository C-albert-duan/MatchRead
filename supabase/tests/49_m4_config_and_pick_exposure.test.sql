-- app_config: authenticated reads, nobody but the service role writes, and
-- the importance row keeps its shape. picks has the forward-exposure index.

begin;

select plan(8);

select has_table('public', 'app_config', 'app_config exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.app_config'::regclass),
  true,
  'app_config has row level security'
);

select is(
  (select count(*)::int from pg_indexes
    where schemaname = 'public' and tablename = 'picks'
      and indexname = 'picks_player_bracket_idx'),
  1,
  'picks has the (player_id, bracket_id) exposure index'
);

select throws_ok(
  $$insert into public.app_config (key, value)
    values ('importance', '{"criticalAtOrBelow": "zero", "importantAtOrBelow": 2}')
    on conflict (key) do update set value = excluded.value$$,
  '23514',
  null,
  'an importance value with a non-numeric threshold is rejected'
);

select throws_ok(
  $$update public.app_config set value = '{"criticalAtOrBelow": 0, "importantAtOrBelow": 9}'
     where key = 'importance'$$,
  '23514',
  null,
  'an importance threshold outside 0..6 is rejected'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e049', 'pgtap-config@example.test');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000e049"}', true);

select is(
  (select value from public.app_config where key = 'importance'),
  '{"criticalAtOrBelow": 0, "importantAtOrBelow": 2}'::jsonb,
  'an authenticated user reads the importance defaults'
);

select throws_ok(
  $$update public.app_config set value = '{"criticalAtOrBelow": 1, "importantAtOrBelow": 3}'
     where key = 'importance'$$,
  '42501',
  null,
  'an authenticated user cannot change server settings'
);

reset role;
set local role anon;

select throws_ok(
  $$select value from public.app_config$$,
  '42501',
  null,
  'anon cannot read server settings'
);

select * from finish();
rollback;
