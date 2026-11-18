-- Migration 0049: save_picks refuses foreign matches and unreachable players,
-- submit_bracket counts only this tournament's picks, and Remove refuses on
-- leagues that count every tournament (fix list P1-3, P1-7).
-- Run: npx supabase test db

begin;

select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a5301', 'pgtap-picks-commish@example.test'),
  ('00000000-0000-0000-0000-0000000a5302', 'pgtap-picks-member@example.test');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000a5301', 'Commish'),
  ('00000000-0000-0000-0000-0000000a5302', 'Member')
on conflict (id) do nothing;

-- T: a 4-draw with seats. U: another tournament with one match.
insert into public.tournaments (slug, name, tour, starts_on, ends_on, tier, draw_size, ingestion_enabled) values
  ('pgtap-picks-t', 'Picks T', 'atp', current_date + 10, current_date + 16, 'tour_250', 4, false),
  ('pgtap-picks-u', 'Picks U', 'atp', current_date + 10, current_date + 16, 'tour_250', 4, false);

insert into public.players (provider_id, last_name) values
  ('pgtap-picks-1', 'One'), ('pgtap-picks-2', 'Two'),
  ('pgtap-picks-3', 'Three'), ('pgtap-picks-4', 'Four');

insert into public.seats (tournament_id, position, kind, player_id)
select t.id, n - 1, 'player', p.id
  from public.tournaments t
  cross join generate_series(1, 4) n
  join public.players p on p.provider_id = 'pgtap-picks-' || n
 where t.slug = 'pgtap-picks-t';

insert into public.matches (tournament_id, round, index_in_round, side_a_player_id, side_b_player_id)
select t.id, 0, 0, (select id from public.players where provider_id = 'pgtap-picks-1'),
       (select id from public.players where provider_id = 'pgtap-picks-2')
  from public.tournaments t where t.slug = 'pgtap-picks-t';
insert into public.matches (tournament_id, round, index_in_round, side_a_player_id, side_b_player_id)
select t.id, 0, 1, (select id from public.players where provider_id = 'pgtap-picks-3'),
       (select id from public.players where provider_id = 'pgtap-picks-4')
  from public.tournaments t where t.slug = 'pgtap-picks-t';
insert into public.matches (tournament_id, round, index_in_round)
select t.id, 1, 0 from public.tournaments t where t.slug = 'pgtap-picks-t';
insert into public.matches (tournament_id, round, index_in_round)
select t.id, n, 0 from public.tournaments t cross join generate_series(0, 2) n
 where t.slug = 'pgtap-picks-u';

insert into public.leagues (id, owner_id, slug, name, format) values
  ('00000000-0000-0000-0000-0000000a53f1', '00000000-0000-0000-0000-0000000a5301',
   'pgtap-picks-all', 'All League', 'season'),
  ('00000000-0000-0000-0000-0000000a53f2', '00000000-0000-0000-0000-0000000a5301',
   'pgtap-picks-single', 'Single League', 'single');
insert into public.members (league_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000a53f1', '00000000-0000-0000-0000-0000000a5301', 'commissioner'),
  ('00000000-0000-0000-0000-0000000a53f1', '00000000-0000-0000-0000-0000000a5302', 'member'),
  ('00000000-0000-0000-0000-0000000a53f2', '00000000-0000-0000-0000-0000000a5301', 'commissioner');
insert into public.league_tournaments (league_id, tournament_id)
select '00000000-0000-0000-0000-0000000a53f2', id from public.tournaments where slug = 'pgtap-picks-t';

create temp table ids on commit drop as
select
  (select id from public.tournaments where slug = 'pgtap-picks-t') as t_id,
  (select id from public.tournaments where slug = 'pgtap-picks-u') as u_id,
  (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id
    where t.slug = 'pgtap-picks-t' and m.round = 0 and m.index_in_round = 0) as t_r0m0,
  (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id
    where t.slug = 'pgtap-picks-t' and m.round = 1) as t_final,
  (select m.id from public.matches m join public.tournaments t on t.id = m.tournament_id
    where t.slug = 'pgtap-picks-u' and m.round = 0) as u_match,
  (select id from public.players where provider_id = 'pgtap-picks-1') as p1,
  (select id from public.players where provider_id = 'pgtap-picks-3') as p3;
grant select on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000a5302"}', true);

-- P1-3: save_picks -------------------------------------------------------------
select lives_ok(
  $$select public.save_picks('00000000-0000-0000-0000-0000000a53f1', (select t_id from ids),
      jsonb_build_array(
        jsonb_build_object('match_id', (select t_r0m0 from ids), 'player_id', (select p1 from ids)),
        jsonb_build_object('match_id', (select t_final from ids), 'player_id', (select p3 from ids))))$$,
  'a valid round-1 and final pick save');

select throws_ok(
  $$select public.save_picks('00000000-0000-0000-0000-0000000a53f1', (select t_id from ids),
      jsonb_build_array(jsonb_build_object('match_id', (select u_match from ids), 'player_id', (select p1 from ids))))$$,
  'P0001', 'invalid pick', 'a match from another tournament is refused');

select throws_ok(
  $$select public.save_picks('00000000-0000-0000-0000-0000000a53f1', (select t_id from ids),
      jsonb_build_array(jsonb_build_object('match_id', (select t_r0m0 from ids), 'player_id', (select p3 from ids))))$$,
  'P0001', 'invalid pick', 'a player outside the match''s half is refused');

select throws_ok(
  $$select public.save_picks('00000000-0000-0000-0000-0000000a53f1', (select t_id from ids),
      jsonb_build_array(jsonb_build_object('match_id', (select t_r0m0 from ids), 'player_id', gen_random_uuid())))$$,
  'P0001', 'invalid pick', 'an unknown player is refused');

-- P1-3: submit_bracket ignores padded picks --------------------------------------
-- Pad the bracket the way an old save_picks allowed: two picks on U's matches.
reset role;
insert into public.picks (bracket_id, match_id, player_id)
select b.id, m.id, (select p1 from ids)
  from public.brackets b, public.matches m, ids
 where b.league_id = '00000000-0000-0000-0000-0000000a53f1'
   and b.tournament_id = ids.t_id
   and m.tournament_id = ids.u_id and m.round in (1, 2);
set local role authenticated;

select is(
  (select count(*)::int from public.picks p join public.brackets b on b.id = p.bracket_id, ids
    where b.tournament_id = ids.t_id and b.league_id = '00000000-0000-0000-0000-0000000a53f1'),
  4, 'the bracket holds 2 real and 2 padded picks');

select throws_ok(
  $$select public.submit_bracket('00000000-0000-0000-0000-0000000a53f1', (select t_id from ids))$$,
  'P0001', 'Incomplete bracket', 'padded picks do not complete a 3-match bracket');

-- P1-7: Remove ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000a5301"}', true);

select throws_ok(
  $$select public.remove_league_tournament('00000000-0000-0000-0000-0000000a53f1', (select t_id from ids))$$,
  'P0001', 'schedule not custom', 'Remove refuses on a league that counts every tournament');

select throws_ok(
  $$select public.remove_league_tournament('00000000-0000-0000-0000-0000000a53f2', (select t_id from ids))$$,
  'P0001', 'single tournament league', 'Remove refuses on a single-tournament league');

select ok(
  exists (select 1 from public.league_tournaments lt, ids
           where lt.league_id = '00000000-0000-0000-0000-0000000a53f1' and lt.tournament_id = ids.t_id),
  'the all-tournaments league keeps its row');

select * from finish();
rollback;
