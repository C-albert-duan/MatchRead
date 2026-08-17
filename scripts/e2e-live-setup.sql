-- Seed a temporary 8-draw for live Playwright (not a real Tour event).
-- Ref prefix e2e- is hidden from the public calendar and wiped by cleanup.

do $$
declare
  v_ref text := 'e2e-live-checklist';
  v_tid uuid;
  v_did uuid;
  v_lock timestamptz := now() + interval '7 days';
begin
  delete from public.leagues
   where tournament_id in (select id from public.tournaments where ref = v_ref)
      or tournament_label ilike 'E2E Live Checklist%'
      or slug like 'e2e-%';
  delete from public.tournaments where ref = v_ref;

  insert into public.tournaments (
    ref, name, surface, starts_on, ends_on, lock_at, draw_size, venue_tz, tour
  ) values (
    v_ref,
    'E2E Live Checklist (temporary)',
    'hard',
    (now() at time zone 'utc')::date,
    (now() at time zone 'utc')::date + 7,
    v_lock,
    8,
    'America/New_York',
    'atp'
  )
  returning id into v_tid;

  insert into public.draws (tournament_id)
  values (v_tid)
  returning id into v_did;

  -- Official-shaped seats: named players + no fiction prefixes (p-N).
  insert into public.draw_seats (
    draw_id, position, player_ref, last_name, seed, country_code, is_bye, seat_kind, entry_status
  ) values
    (v_did, 0, 'e2e-sinner',   'Sinner',   1,    'ITA', false, 'player', null),
    (v_did, 1, 'e2e-bye-1',    'Bye',      null, 'XXX', true,  'bye',    null),
    (v_did, 2, 'e2e-alcaraz',  'Alcaraz',  2,    'ESP', false, 'player', null),
    (v_did, 3, 'e2e-rune',     'Rune',    null, 'DEN', false, 'player', null),
    (v_did, 4, 'e2e-medvedev', 'Medvedev', 3,    'RUS', false, 'player', null),
    (v_did, 5, 'e2e-bye-5',    'Bye',      null, 'XXX', true,  'bye',    null),
    (v_did, 6, 'e2e-zverev',   'Zverev',   4,    'GER', false, 'player', null),
    (v_did, 7, 'e2e-ruud',     'Ruud',     null, 'NOR', false, 'player', null);

  raise notice 'seeded % id=% lock_at=%', v_ref, v_tid, v_lock;
end $$;
