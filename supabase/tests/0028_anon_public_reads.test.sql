-- 0028 — anon CAN read tournament / draw / seat data needed for the public bracket.
-- Run: npx supabase test db
-- Role under test: anon (not table owner).

begin;
select plan(6);

insert into public.tournaments (ref, name, surface, starts_on, draw_size, venue_tz)
values ('pgtap-anon-2026', 'pgTAP Anon Draw', 'hard', '2026-08-13', 2, 'UTC');

insert into public.draws (tournament_id)
select id from public.tournaments where ref = 'pgtap-anon-2026';

insert into public.draw_seats (draw_id, position, player_ref, last_name, country_code, is_bye)
select d.id, 0, 'pgtap-a', 'Alpha', 'USA', false
  from public.draws d
  join public.tournaments t on t.id = d.tournament_id
 where t.ref = 'pgtap-anon-2026';

insert into public.draw_seats (draw_id, position, player_ref, last_name, country_code, is_bye)
select d.id, 1, 'pgtap-b', 'Beta', 'ESP', false
  from public.draws d
  join public.tournaments t on t.id = d.tournament_id
 where t.ref = 'pgtap-anon-2026';

select ok(
  has_table_privilege('anon', 'public.tournaments', 'select'),
  'anon GRANT select on tournaments'
);
select ok(
  has_table_privilege('anon', 'public.draws', 'select'),
  'anon GRANT select on draws'
);
select ok(
  has_table_privilege('anon', 'public.draw_seats', 'select'),
  'anon GRANT select on draw_seats'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select ok(
  (select count(*) from public.tournaments where ref = 'pgtap-anon-2026') = 1,
  'anon can read tournament rows'
);
select ok(
  (
    select count(*)
      from public.draws d
      join public.tournaments t on t.id = d.tournament_id
     where t.ref = 'pgtap-anon-2026'
  ) = 1,
  'anon can read draw rows'
);
select ok(
  (
    select count(*)
      from public.draw_seats s
      join public.draws d on d.id = s.draw_id
      join public.tournaments t on t.id = d.tournament_id
     where t.ref = 'pgtap-anon-2026'
  ) = 2,
  'anon can read seat rows for the official bracket'
);

select * from finish();
rollback;
