-- 0029 — anon CANNOT read another user's predictions or private bracket selections.
-- Run: npx supabase test db
-- Role under test: anon (not table owner).

begin;
select plan(4);

select ok(
  not has_table_privilege('anon', 'public.brackets', 'select'),
  'anon has no GRANT select on brackets'
);
select ok(
  not has_table_privilege('anon', 'public.bracket_snapshots', 'select'),
  'anon has no GRANT select on bracket_snapshots'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  'select count(*) from public.brackets',
  '42501',
  'anon SELECT on brackets is rejected'
);
select throws_ok(
  'select count(*) from public.bracket_snapshots',
  '42501',
  'anon SELECT on bracket_snapshots is rejected'
);

select * from finish();
rollback;
