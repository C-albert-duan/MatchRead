-- A season league covers every tournament, but create_league schedules none.
-- The first save in a season league adds the schedule row, so the bracket
-- saves and submits. A single league still refuses a tournament it lacks.

begin;

select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d001', 'pgtap-season-save@example.test');

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000d001', 'Season Saver')
on conflict (id) do nothing;

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, tier, draw_size, ingestion_enabled
) values
  ('pgtap-season-save', 'Season Save Event', 'atp', '2026-11-02', '2026-11-08', 'tour_250', 2, false),
  ('pgtap-season-single', 'Single League Event', 'atp', '2026-11-09', '2026-11-15', 'tour_250', 2, false);

insert into public.players (provider_id, last_name)
values ('pgtap-season-a', 'Ames'), ('pgtap-season-b', 'Brook');

insert into public.matches (
  tournament_id, round, index_in_round, side_a_player_id, side_b_player_id
)
select t.id, 0, 0, a.id, b.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-season-a'
  join public.players b on b.provider_id = 'pgtap-season-b'
 where t.slug = 'pgtap-season-save';

create temp table ids on commit drop as
select
  (select id from public.tournaments where slug = 'pgtap-season-save') as event_id,
  (select id from public.tournaments where slug = 'pgtap-season-single') as single_event_id,
  (select m.id from public.matches m
     join public.tournaments t on t.id = m.tournament_id
    where t.slug = 'pgtap-season-save') as match_id,
  (select id from public.players where provider_id = 'pgtap-season-a') as player_id;
grant select on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000d001"}', true);

select public.create_league('pgTAP Season Save', 'season', null, 'private', false);
select public.create_league('pgTAP Single Save', 'single',
  (select single_event_id from ids), 'private', false);

select is(
  (select count(*)::int from public.league_tournaments lt
     join public.leagues l on l.id = lt.league_id
    where l.name = 'pgTAP Season Save'),
  0,
  'a new season league starts with no scheduled tournaments'
);

select lives_ok(
  $$select public.save_picks(
      (select id from public.leagues where name = 'pgTAP Season Save'),
      (select event_id from ids),
      jsonb_build_array(jsonb_build_object(
        'match_id', (select match_id from ids),
        'player_id', (select player_id from ids))))$$,
  'the first save in a season league succeeds'
);

select is(
  (select count(*)::int from public.league_tournaments lt
     join public.leagues l on l.id = lt.league_id, ids
    where l.name = 'pgTAP Season Save'
      and lt.tournament_id = ids.event_id),
  1,
  'the save added the tournament to the season schedule'
);

select lives_ok(
  $$select public.save_picks(
      (select id from public.leagues where name = 'pgTAP Season Save'),
      (select event_id from ids),
      '[]'::jsonb)$$,
  'a second save reuses the schedule row'
);

select lives_ok(
  $$select public.submit_bracket(
      (select id from public.leagues where name = 'pgTAP Season Save'),
      (select event_id from ids))$$,
  'the season league bracket submits'
);

select isnt(
  (select b.submitted_at from public.brackets b
     join public.leagues l on l.id = b.league_id, ids
    where l.name = 'pgTAP Season Save'
      and b.tournament_id = ids.event_id),
  null,
  'the submitted bracket has submitted_at'
);

select throws_ok(
  $$select public.save_picks(
      (select id from public.leagues where name = 'pgTAP Single Save'),
      (select event_id from ids),
      '[]'::jsonb)$$,
  'P0001',
  'League does not include this tournament',
  'a single league refuses a tournament it does not include'
);

select * from finish();
rollback;
