-- 0030 — anon CANNOT read private league membership data.
-- Run: npx supabase test db
-- Role under test: anon (not table owner).
-- Product tables: leagues + members (migrations/0004), not legacy league_members.

begin;
select plan(4);

select ok(
  not has_table_privilege('anon', 'public.leagues', 'select'),
  'anon has no GRANT select on leagues'
);
select ok(
  not has_table_privilege('anon', 'public.members', 'select'),
  'anon has no GRANT select on members'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  'select count(*) from public.leagues',
  '42501',
  null,
  'anon SELECT on leagues is rejected'
);
select throws_ok(
  'select count(*) from public.members',
  '42501',
  null,
  'anon SELECT on members is rejected'
);

select * from finish();
rollback;
