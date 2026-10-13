-- Scoreline fill against real matches rows.
-- official_score is the scoreline. The null-only update is the reconciliation
-- fill used by the results backfill. A contradictory later value must not land.
-- Run: npx supabase test db

begin;

select plan(12);

insert into public.tournaments (slug, name, tour, starts_on, ends_on)
values ('pgtap-scoreline', 'Scoreline Fixture', 'atp', '2026-08-12', '2026-08-13');

insert into public.players (provider_id, last_name)
values ('pgtap-score-a', 'Alpha'), ('pgtap-score-b', 'Beta');

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id, winner_player_id,
  settled_at, official_score, fact_kind
)
select t.id, 0, 0, a.id, b.id, a.id,
       '2026-08-12 12:00:00+00', null, null
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-score-a'
  join public.players b on b.provider_id = 'pgtap-score-b'
 where t.slug = 'pgtap-scoreline';

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id, winner_player_id,
  settled_at, official_score, fact_kind
)
select t.id, 0, 1, a.id, b.id, b.id,
       '2026-08-12 13:00:00+00', null, null
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-score-a'
  join public.players b on b.provider_id = 'pgtap-score-b'
 where t.slug = 'pgtap-scoreline';

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id, winner_player_id,
  settled_at, official_score, fact_kind
)
select t.id, 1, 0, a.id, b.id, a.id,
       '2026-08-12 14:00:00+00', '7-6(5) 6-4', 'played'
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-score-a'
  join public.players b on b.provider_id = 'pgtap-score-b'
 where t.slug = 'pgtap-scoreline';

-- Completed archive result fills a null scoreline. Winner is not part of the write.
update public.matches m
   set official_score = '6-4 6-2',
       fact_kind = 'played'
  from public.tournaments t
 where t.id = m.tournament_id
   and t.slug = 'pgtap-scoreline'
   and m.round = 0
   and m.index_in_round = 0
   and m.official_score is null;

select is(
  (
    select m.official_score
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 0
  ),
  '6-4 6-2',
  'completed result fills a null scoreline'
);

select is(
  (
    select m.fact_kind
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 0
  ),
  'played',
  'completed result records fact_kind played'
);

select ok(
  (
    select m.winner_player_id = a.id
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      join public.players a on a.provider_id = 'pgtap-score-a'
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 0
  ),
  'filling a scoreline does not change the settled winner'
);

select is(
  (
    select m.settled_at
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 0
  ),
  '2026-08-12 12:00:00+00'::timestamptz,
  'filling a scoreline does not change settled_at'
);

-- Second pass: same predicate, contradictory score and winner. Null guard matches nothing.
update public.matches m
   set official_score = '0-6 0-6',
       fact_kind = 'withdrawal',
       winner_player_id = b.id
  from public.tournaments t
  join public.players b on b.provider_id = 'pgtap-score-b'
 where t.id = m.tournament_id
   and t.slug = 'pgtap-scoreline'
   and m.round = 0
   and m.index_in_round = 0
   and m.official_score is null;

select is(
  (
    select m.official_score
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 0
  ),
  '6-4 6-2',
  'a second reconciliation pass leaves the scoreline'
);

select is(
  (
    select m.fact_kind
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 0
  ),
  'played',
  'a second reconciliation pass leaves fact_kind'
);

select ok(
  (
    select m.winner_player_id = a.id
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      join public.players a on a.provider_id = 'pgtap-score-a'
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 0
  ),
  'a second reconciliation pass does not change the settled winner'
);

select is(
  (
    select m.settled_at
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 0
  ),
  '2026-08-12 12:00:00+00'::timestamptz,
  'a second reconciliation pass does not change settled_at'
);

-- Retirement text is stored as published.
update public.matches m
   set official_score = '6-3 3-0 ret.',
       fact_kind = 'played'
  from public.tournaments t
 where t.id = m.tournament_id
   and t.slug = 'pgtap-scoreline'
   and m.round = 0
   and m.index_in_round = 1
   and m.official_score is null;

select is(
  (
    select m.official_score
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 1
  ),
  '6-3 3-0 ret.',
  'a retirement scoreline round-trips'
);

select ok(
  (
    select m.winner_player_id = b.id
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      join public.players b on b.provider_id = 'pgtap-score-b'
     where t.slug = 'pgtap-scoreline'
       and m.round = 0
       and m.index_in_round = 1
  ),
  'a retirement scoreline does not change the settled winner'
);

-- Already populated official result. Contradictory source uses the same null guard.
update public.matches m
   set official_score = '0-6 0-6',
       fact_kind = 'withdrawal',
       winner_player_id = b.id
  from public.tournaments t
  join public.players b on b.provider_id = 'pgtap-score-b'
 where t.id = m.tournament_id
   and t.slug = 'pgtap-scoreline'
   and m.round = 1
   and m.index_in_round = 0
   and m.official_score is null;

select is(
  (
    select m.official_score
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-scoreline'
       and m.round = 1
       and m.index_in_round = 0
  ),
  '7-6(5) 6-4',
  'a stored official scoreline is not replaced by a contradictory source'
);

select ok(
  (
    select m.winner_player_id = a.id and m.fact_kind = 'played'
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      join public.players a on a.provider_id = 'pgtap-score-a'
     where t.slug = 'pgtap-scoreline'
       and m.round = 1
       and m.index_in_round = 0
  ),
  'a contradictory source does not change the settled winner or fact class'
);

select * from finish();
rollback;
