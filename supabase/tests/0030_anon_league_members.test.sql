-- 0030 — anon CANNOT read private league membership data.
-- Run: npx supabase test db
-- Role under test: anon (not table owner).

begin;
select plan(4);

select ok(
  not has_table_privilege('anon', 'public.league_members', 'select'),
  'anon has no GRANT select on league_members'
);
select ok(
  not has_table_privilege('anon', 'public.leagues', 'select'),
  'anon has no GRANT select on leagues'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  'select count(*) from public.league_members',
  '42501',
  'anon SELECT on league_members is rejected'
);
select throws_ok(
  'select count(*) from public.leagues',
  '42501',
  'anon SELECT on leagues is rejected'
);

select * from finish();
rollback;
