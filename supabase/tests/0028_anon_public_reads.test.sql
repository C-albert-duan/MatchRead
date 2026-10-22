-- 0028 — anon CAN read tournament / seat / player facts for the public bracket.
-- Run: npx supabase test db
-- Role under test: anon (not table owner).
-- Tables match migrations/0002 (slug, seats) — not pre-0002 draw tables.

begin;
select plan(6);

insert into public.tournaments (
  slug, name, tour, surface, starts_on, ends_on, venue_tz, draw_size, published_at
) values (
  'pgtap-anon-2026', 'pgTAP Anon Draw', 'atp', 'hard',
  '2026-08-13', '2026-08-16', 'UTC', 2, '2026-08-12 12:00:00+00'
);

insert into public.players (provider_id, last_name, country_code)
values ('pgtap-a', 'Alpha', 'USA'), ('pgtap-b', 'Beta', 'ESP');

insert into public.seats (tournament_id, position, kind, player_id)
select t.id, 0, 'player', a.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-a'
 where t.slug = 'pgtap-anon-2026';

insert into public.seats (tournament_id, position, kind, player_id)
select t.id, 1, 'player', b.id
  from public.tournaments t
  join public.players b on b.provider_id = 'pgtap-b'
 where t.slug = 'pgtap-anon-2026';

select ok(
  has_table_privilege('anon', 'public.tournaments', 'select'),
  'anon GRANT select on tournaments'
);
select ok(
  has_table_privilege('anon', 'public.seats', 'select'),
  'anon GRANT select on seats'
);
select ok(
  has_table_privilege('anon', 'public.players', 'select'),
  'anon GRANT select on players'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select ok(
  (select count(*) from public.tournaments where slug = 'pgtap-anon-2026') = 1,
  'anon can read tournament rows'
);
select ok(
  (
    select count(*)
      from public.seats s
      join public.tournaments t on t.id = s.tournament_id
     where t.slug = 'pgtap-anon-2026'
  ) = 2,
  'anon can read seat rows for the official bracket'
);
select ok(
  (
    select count(*)
      from public.players p
     where p.provider_id in ('pgtap-a', 'pgtap-b')
  ) = 2,
  'anon can read player rows'
);

select * from finish();
rollback;
