-- Custom league schedules: the opt-in, Add, Remove, the picker and the
-- delete guard. Brackets stay per league and are never written here.

begin;

select plan(24);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e001', 'pgtap-schedule-commish@example.test'),
  ('00000000-0000-0000-0000-00000000e002', 'pgtap-schedule-member@example.test');

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000e001', 'Commish'),
  ('00000000-0000-0000-0000-00000000e002', 'Member')
on conflict (id) do nothing;

-- Relative dates so the suite does not age out.
insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, tier, ingestion_enabled
) values
  ('pgtap-sched-a', 'Event A', 'atp', current_date + 10, current_date + 16, 'tour_250', false),
  ('pgtap-sched-b', 'Event B', 'atp', current_date + 20, current_date + 26, 'tour_250', false),
  ('pgtap-sched-c', 'Event C', 'wta', current_date + 30, current_date + 36, 'tour_250', false),
  ('pgtap-sched-past', 'Past Event', 'atp', current_date - 20, current_date - 14, 'tour_250', false);

insert into public.leagues (id, owner_id, slug, name, format) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001',
   'pgtap-sched-custom', 'Custom League', 'season'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e001',
   'pgtap-sched-all', 'All League', 'season'),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e001',
   'pgtap-sched-single', 'Single League', 'single');

insert into public.members (league_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001', 'commissioner'),
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002', 'member'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e001', 'commissioner'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e002', 'member'),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e001', 'commissioner');

-- The past event already carries a member bracket in the custom league
-- (made before the switch); A sits on the other two leagues' schedules.
insert into public.league_tournaments (league_id, tournament_id)
select l.id, t.id
  from public.tournaments t, (values
    ('00000000-0000-0000-0000-00000000f001'::uuid, 'pgtap-sched-past'),
    ('00000000-0000-0000-0000-00000000f002'::uuid, 'pgtap-sched-a'),
    ('00000000-0000-0000-0000-00000000f003'::uuid, 'pgtap-sched-a')
  ) as l(id, slug)
 where t.slug = l.slug;

insert into public.brackets (league_id, tournament_id, user_id)
select '00000000-0000-0000-0000-00000000f001', t.id, '00000000-0000-0000-0000-00000000e002'
  from public.tournaments t where t.slug = 'pgtap-sched-past';

create temp table ids on commit drop as
select
  (select id from public.tournaments where slug = 'pgtap-sched-a') as a_id,
  (select id from public.tournaments where slug = 'pgtap-sched-b') as b_id,
  (select id from public.tournaments where slug = 'pgtap-sched-c') as c_id,
  (select id from public.tournaments where slug = 'pgtap-sched-past') as past_id,
  (select count(*)::int from public.brackets) as brackets_before;
grant select on ids to authenticated;

create temp table r (k text primary key, v jsonb) on commit drop;
grant select, insert on r to authenticated;

set local role authenticated;

-- Member -------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000e002"}', true);

select throws_ok(
  $$select public.enable_custom_schedule('00000000-0000-0000-0000-00000000f001')$$,
  '42501', 'Not commissioner',
  'a member cannot switch the league to a custom schedule'
);

select throws_ok(
  $$select public.add_league_tournament(
      '00000000-0000-0000-0000-00000000f001', (select b_id from ids))$$,
  '42501', 'Not commissioner',
  'a member cannot add a tournament'
);

select throws_ok(
  $$select * from public.league_schedule_candidates('00000000-0000-0000-0000-00000000f001')$$,
  '42501', 'Not commissioner',
  'a member cannot read the picker'
);

select throws_ok(
  $$insert into public.league_tournaments (league_id, tournament_id)
    values ('00000000-0000-0000-0000-00000000f002', (select b_id from ids))$$,
  '42501', null,
  'a direct insert into the schedule is denied'
);

-- Commissioner ---------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000e001"}', true);

select throws_ok(
  $$select public.add_league_tournament(
      '00000000-0000-0000-0000-00000000f002', (select b_id from ids))$$,
  'P0001', 'schedule not custom',
  'an all-tournaments season league takes no Add until it opts in'
);

select throws_ok(
  $$select public.add_league_tournament(
      '00000000-0000-0000-0000-00000000f003', (select b_id from ids))$$,
  'P0001', 'single tournament league',
  'a single league refuses Add'
);

select throws_ok(
  $$select public.enable_custom_schedule('00000000-0000-0000-0000-00000000f003')$$,
  'P0001', 'single tournament league',
  'a single league cannot opt in'
);

insert into r values ('enable',
  public.enable_custom_schedule('00000000-0000-0000-0000-00000000f001'));
insert into r values ('enable_again',
  public.enable_custom_schedule('00000000-0000-0000-0000-00000000f001'));

select is((select v->>'status' from r where k = 'enable'), 'custom',
  'the commissioner opts in');
select is((select v->>'status' from r where k = 'enable_again'), 'already_custom',
  'opting in again is a no-op');

select ok(
  (select count(*) = 3 from public.league_tournaments lt, ids
    where lt.league_id = '00000000-0000-0000-0000-00000000f001'
      and lt.tournament_id in (ids.a_id, ids.b_id, ids.c_id)),
  'the switch seeds every event members can still enter'
);

select ok(
  exists (select 1 from public.league_tournaments lt, ids
           where lt.league_id = '00000000-0000-0000-0000-00000000f001'
             and lt.tournament_id = ids.past_id),
  'the switch keeps the row a member bracket hangs from'
);

insert into r values ('remove_b',
  public.remove_league_tournament('00000000-0000-0000-0000-00000000f001', (select b_id from ids)));
insert into r values ('remove_b_again',
  public.remove_league_tournament('00000000-0000-0000-0000-00000000f001', (select b_id from ids)));

select is((select v->>'status' from r where k = 'remove_b'), 'removed',
  'the commissioner removes an open tournament');
select is((select v->>'status' from r where k = 'remove_b_again'), 'not_on_schedule',
  'a repeat Remove is a no-op');

select ok(
  exists (select 1 from public.league_schedule_candidates('00000000-0000-0000-0000-00000000f001') c, ids
           where c.tournament_id = ids.b_id)
  and not exists (select 1 from public.league_schedule_candidates('00000000-0000-0000-0000-00000000f001') c, ids
           where c.tournament_id in (ids.a_id, ids.past_id)),
  'the picker lists the removed event and hides scheduled and finished ones'
);

insert into r values ('add_b',
  public.add_league_tournament('00000000-0000-0000-0000-00000000f001', (select b_id from ids)));
insert into r values ('add_b_again',
  public.add_league_tournament('00000000-0000-0000-0000-00000000f001', (select b_id from ids)));

select is((select v->>'status' from r where k = 'add_b'), 'added',
  'the commissioner adds an open tournament');
select is((select v->>'status' from r where k = 'add_b_again'), 'already_added',
  'a repeat Add is a success, not a second row');

select throws_ok(
  $$select public.add_league_tournament(
      '00000000-0000-0000-0000-00000000f001', gen_random_uuid())$$,
  'P0002', 'tournament not found',
  'an unknown tournament is not found'
);

-- The past event is already on the schedule, so use a fresh finished one.
reset role;
insert into public.tournaments (slug, name, tour, starts_on, ends_on, tier, ingestion_enabled)
values ('pgtap-sched-past2', 'Past Two', 'atp', current_date - 40, current_date - 34, 'tour_250', false);
update public.league_tournaments lt set locked_at = now()
  from ids
 where lt.league_id = '00000000-0000-0000-0000-00000000f001' and lt.tournament_id = ids.c_id;
set local role authenticated;

select throws_ok(
  $$select public.add_league_tournament(
      '00000000-0000-0000-0000-00000000f001',
      (select id from public.tournaments where slug = 'pgtap-sched-past2'))$$,
  'P0001', 'tournament not schedulable',
  'a finished tournament cannot be added'
);

select throws_ok(
  $$select public.remove_league_tournament(
      '00000000-0000-0000-0000-00000000f001', (select c_id from ids))$$,
  'P0001', 'tournament locked',
  'a locked tournament cannot be removed'
);

-- A member cannot save a bracket for an event the custom league dropped.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000e002"}', true);

select throws_ok(
  $$select public.save_picks('00000000-0000-0000-0000-00000000f001',
      (select id from public.tournaments where slug = 'pgtap-sched-past2'), '[]'::jsonb)$$,
  'P0001', 'League does not include this tournament',
  'a custom league refuses a bracket for an unscheduled event'
);

-- The delete guard, for a path that skips the functions. Run as the table
-- owner with a client JWT, so RLS is out of the way and only the trigger acts.
reset role;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000e001"}', true);

select throws_ok(
  $$delete from public.league_tournaments lt using ids
     where lt.league_id = '00000000-0000-0000-0000-00000000f001'
       and lt.tournament_id = ids.past_id$$,
  'P0001', 'league tournament has brackets',
  'the delete guard refuses a row that brackets hang from'
);

set local role authenticated;
select lives_ok(
  $$select public.delete_league('00000000-0000-0000-0000-00000000f001')$$,
  'deleting the whole league still cascades through the guard'
);
reset role;

select is(
  (select count(*)::int from public.league_tournaments lt, ids
    where lt.league_id = '00000000-0000-0000-0000-00000000f002'
      and lt.tournament_id = ids.a_id),
  1,
  'another league''s schedule is untouched'
);

select is(
  (select count(*)::int from public.brackets) + 1,
  (select brackets_before from ids),
  'only the deleted league''s one bracket left; no schedule change wrote a bracket'
);

select * from finish();
rollback;
