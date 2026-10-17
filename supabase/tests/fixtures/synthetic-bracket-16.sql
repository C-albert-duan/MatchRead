-- Deterministic 16-player bracket for replay tests.
-- Not a migration. Not eligible for the public calendar.
-- The pgTAP runner only mounts supabase/tests, so
-- supabase/tests/fixtures/synthetic-bracket-16.sql is the same script.
-- That copy is included by 31_match_structure.test.sql. It is not a plan.
-- Do not apply either file to the live calendar.
-- Included only after \set matchread_synthetic. A direct pg_prove run
-- records a plan and does not insert.

\if :{?matchread_synthetic}
insert into public.tournaments (
  slug, name, tour, surface, starts_on, ends_on, venue_tz,
  draw_size, provider_id, published_at, product_override,
  ingestion_enabled, tier
) values (
  'syn-16', 'Synthetic Bracket', 'atp', 'hard',
  '2026-08-10', '2026-08-16', 'UTC',
  16, 'syn-16', '2026-08-09 12:00:00+00', 'force_off',
  false, 'other'
);

do $$
declare
  v_t uuid;
  v_p uuid[] := array[]::uuid[];
  v_names text[] := array[
    'Alden', 'Berg', 'Costa', 'Dahl', 'Ellis', 'Frost', 'Greco', 'Holm',
    'Ivers', 'Jung', 'Klein', 'Lange', 'Mora', 'Niles', 'Ortega', 'Pell'
  ];
  i int;
  r int;
  n int;
  v_id uuid;
  v_a uuid;
  v_b uuid;
  v_winner uuid;
  v_at timestamptz;
  v_has_time boolean;
  v_session text;
  v_court text;
  v_score text;
  v_kind text;
  v_settled timestamptz;
begin
  if array_length(v_names, 1) <> 16 then
    raise exception 'synthetic 16-draw needs 16 names';
  end if;

  select id into v_t from public.tournaments where slug = 'syn-16';

  for i in 1..16 loop
    insert into public.players (provider_id, last_name, country_code)
    values ('syn16-p' || lpad(i::text, 2, '0'), v_names[i], 'XXX')
    returning id into v_id;
    v_p[i] := v_id;
    insert into public.seats (tournament_id, position, kind, player_id)
    values (v_t, i - 1, 'player', v_id);
  end loop;

  for r in 0..3 loop
      n := (8 / power(2, r))::int;
    for i in 0..(n - 1) loop
      v_a := null;
      v_b := null;
      v_winner := null;
      v_at := null;
      v_has_time := false;
      v_session := null;
      v_court := null;
      v_score := null;
      v_kind := null;
      v_settled := null;

      if r = 0 then
        v_a := v_p[i * 2 + 1];
        v_b := v_p[i * 2 + 2];
      end if;

      if r = 0 and i = 0 then
        v_winner := v_a;
        v_at := '2026-08-10 14:00:00+00';
        v_has_time := true;
        v_session := 'day';
        v_court := 'Court 1';
        v_score := '6-4 6-3';
        v_kind := 'played';
        v_settled := v_at;
      elsif r = 0 and i = 1 then
        v_winner := v_b;
        v_at := '2026-08-10 02:00:00+00';
        v_has_time := true;
        v_session := 'night';
        v_court := 'Court 2';
        v_score := '7-5 6-2';
        v_kind := 'played';
        v_settled := v_at;
      elsif r = 0 and i = 2 then
        v_at := '2026-08-11 12:00:00+00';
        v_has_time := false;
      elsif r = 1 and i = 0 then
        v_a := v_p[1];
        v_b := v_p[4];
      end if;

      insert into public.matches (
        tournament_id, round, index_in_round, external_ref,
        side_a_player_id, side_b_player_id, winner_player_id,
        scheduled_at, has_time, session, court,
        official_score, fact_kind, settled_at, voided
      ) values (
        v_t, r, i, 'syn16-r' || r::text || '-m' || i::text,
        v_a, v_b, v_winner,
        v_at, v_has_time, v_session, v_court,
        v_score, v_kind, v_settled, false
      );
    end loop;
  end loop;
end $$;
\else
begin;
select plan(1);
select ok(true, 'synthetic bracket fixture is included by the structure test');
select * from finish();
rollback;
\endif
