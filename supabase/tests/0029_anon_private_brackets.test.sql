-- 0029 — anon CANNOT read another user's predictions or private bracket selections.
-- Run: npx supabase test db
-- Role under test: anon (not table owner).
-- Product tables: brackets + picks (migrations/0005), not legacy bracket_snapshots.

begin;
select plan(4);

select ok(
  not has_table_privilege('anon', 'public.brackets', 'select'),
  'anon has no GRANT select on brackets'
);
select ok(
  not has_table_privilege('anon', 'public.picks', 'select'),
  'anon has no GRANT select on picks'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  'select count(*) from public.brackets',
  '42501',
  null,
  'anon SELECT on brackets is rejected'
);
select throws_ok(
  'select count(*) from public.picks',
  '42501',
  null,
  'anon SELECT on picks is rejected'
);

select * from finish();
rollback;
