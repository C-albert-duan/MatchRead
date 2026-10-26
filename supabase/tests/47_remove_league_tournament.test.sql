-- remove_league_tournament refuses instead of cascading into brackets.
-- Commissioner only; refused when picks are locked, when brackets exist,
-- and for a league's last tournament. Absent rows are a no-op.

begin;

select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c001', 'pgtap-remove-commish@example.test'),
  ('00000000-0000-0000-0000-00000000c002', 'pgtap-remove-member@example.test');

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000c001', 'Commish'),
  ('00000000-0000-0000-0000-00000000c002', 'Member')
on conflict (id) do nothing;

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, tier, ingestion_enabled
) values
  ('pgtap-remove-open', 'Open Event', 'atp', '2026-11-02', '2026-11-08', 'tour_250', false),
  ('pgtap-remove-bracket', 'Bracket Event', 'atp', '2026-11-09', '2026-11-15', 'tour_250', false),
  ('pgtap-remove-locked', 'Locked Event', 'atp', '2026-11-16', '2026-11-22', 'tour_250', false),
  ('pgtap-remove-spare', 'Spare Event', 'atp', '2026-11-23', '2026-11-29', 'tour_250', false);

insert into public.leagues (id, owner_id, slug, name, format) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001',
   'pgtap-remove-season', 'Season League', 'season'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c001',
   'pgtap-remove-one', 'One Event League', 'season');

insert into public.members (league_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', 'commissioner'),
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c002', 'member'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c001', 'commissioner');

insert into public.league_tournaments (league_id, tournament_id, locked_at)
select '00000000-0000-0000-0000-00000000a001', t.id,
       case when t.slug = 'pgtap-remove-locked' then now() end
  from public.tournaments t
 where t.slug like 'pgtap-remove-%';

insert into public.league_tournaments (league_id, tournament_id)
select '00000000-0000-0000-0000-00000000a002', t.id
  from public.tournaments t
 where t.slug = 'pgtap-remove-spare';

insert into public.brackets (league_id, tournament_id, user_id)
select '00000000-0000-0000-0000-00000000a001', t.id,
       '00000000-0000-0000-0000-00000000c002'
  from public.tournaments t
 where t.slug = 'pgtap-remove-bracket';

create temp table ids on commit drop as
select
  (select id from public.tournaments where slug = 'pgtap-remove-open') as open_id,
  (select id from public.tournaments where slug = 'pgtap-remove-bracket') as bracket_id,
  (select id from public.tournaments where slug = 'pgtap-remove-locked') as locked_id,
  (select id from public.tournaments where slug = 'pgtap-remove-spare') as spare_id;
grant select on ids to authenticated;

set local role authenticated;

-- Member
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000c002"}', true);

select throws_ok(
  $$select public.remove_league_tournament(
      '00000000-0000-0000-0000-00000000a001', (select open_id from ids))$$,
  '42501',
  'Not commissioner',
  'a member cannot remove a tournament'
);

-- Commissioner
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000c001"}', true);

select throws_ok(
  $$select public.remove_league_tournament(
      '00000000-0000-0000-0000-00000000a001', (select locked_id from ids))$$,
  'P0001',
  'tournament locked',
  'a locked tournament cannot be removed'
);

select throws_ok(
  $$select public.remove_league_tournament(
      '00000000-0000-0000-0000-00000000a001', (select bracket_id from ids))$$,
  'P0001',
  'league tournament has brackets',
  'a tournament with member brackets cannot be removed'
);

select throws_ok(
  $$select public.remove_league_tournament(
      '00000000-0000-0000-0000-00000000a002', (select spare_id from ids))$$,
  'P0001',
  'last tournament',
  'the last tournament of a league cannot be removed'
);

select lives_ok(
  $$select public.remove_league_tournament(
      '00000000-0000-0000-0000-00000000a001', (select open_id from ids))$$,
  'the commissioner removes an open tournament with no brackets'
);

select lives_ok(
  $$select public.remove_league_tournament(
      '00000000-0000-0000-0000-00000000a001', (select open_id from ids))$$,
  'removing it again is a no-op'
);

reset role;

select is(
  (select count(*)::int from public.league_tournaments lt, ids
    where lt.league_id = '00000000-0000-0000-0000-00000000a001'
      and lt.tournament_id = ids.open_id),
  0,
  'the open tournament left the schedule'
);

select is(
  (select count(*)::int from public.brackets b, ids
    where b.league_id = '00000000-0000-0000-0000-00000000a001'
      and b.tournament_id = ids.bracket_id),
  1,
  'the refused removal kept the member bracket'
);

select is(
  (select count(*)::int from public.league_tournaments
    where league_id = '00000000-0000-0000-0000-00000000a001'),
  3,
  'refused removals left the other three rows'
);

select is(
  (select count(*)::int from public.league_tournaments
    where league_id = '00000000-0000-0000-0000-00000000a002'),
  1,
  'the one-event league keeps its tournament'
);

select * from finish();
rollback;
