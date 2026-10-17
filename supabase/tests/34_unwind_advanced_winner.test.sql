-- A changed child winner clears the parent side it advanced.
-- The claim still names that player after the match column is cleared.
-- A parent that already has its own winner keeps its side.

begin;

select plan(7);

insert into public.tournaments (
  slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled
) values (
  'pgtap-unwind', 'Unwind Fixture', 'atp', '2026-08-10', '2026-08-16',
  'force_off', false
);

insert into public.players (provider_id, last_name)
values ('pgtap-unwind-a', 'Adler'), ('pgtap-unwind-b', 'Berg');

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id, winner_player_id, settled_at
)
select t.id, 0, 0, a.id, b.id, a.id, '2026-08-10 12:00:00+00'
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
  join public.players b on b.provider_id = 'pgtap-unwind-b'
 where t.slug = 'pgtap-unwind';

insert into public.matches (
  tournament_id, round, index_in_round, side_a_player_id
)
select t.id, 1, 0, a.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
 where t.slug = 'pgtap-unwind';

insert into public.settlement_claims (match_id, outcome, winner_player_id)
select m.id, 'winner', m.winner_player_id
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
 where t.slug = 'pgtap-unwind'
   and m.round = 0
   and m.index_in_round = 0;

alter table public.matches disable trigger matches_unwind_advanced_winner;

update public.matches m
   set winner_player_id = null,
       voided = true
  from public.tournaments t
 where t.id = m.tournament_id
   and t.slug = 'pgtap-unwind'
   and m.round = 0
   and m.index_in_round = 0;

select is(
  (
    select p.side_a_player_id is not null
      from public.matches p
      join public.tournaments t on t.id = p.tournament_id
     where t.slug = 'pgtap-unwind'
       and p.round = 1
       and p.index_in_round = 0
  ),
  true,
  'clearing the child winner without the trigger leaves the parent side'
);

select is(
  (
    select public.claim_settlement(m.id, 'void', null, null)
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
     where t.slug = 'pgtap-unwind'
       and m.round = 0
       and m.index_in_round = 0
  ),
  'replaced',
  'a void claim replaces the stored winner'
);

select is(
  (
    select p.side_a_player_id
      from public.matches p
      join public.tournaments t on t.id = p.tournament_id
     where t.slug = 'pgtap-unwind'
       and p.round = 1
       and p.index_in_round = 0
  ),
  null,
  'the claim winner is removed from the parent after the match column is null'
);

alter table public.matches enable trigger matches_unwind_advanced_winner;

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id, winner_player_id, settled_at
)
select t.id, 0, 2, a.id, b.id, a.id, '2026-08-10 12:00:00+00'
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
  join public.players b on b.provider_id = 'pgtap-unwind-b'
 where t.slug = 'pgtap-unwind';

insert into public.matches (
  tournament_id, round, index_in_round, side_a_player_id
)
select t.id, 1, 1, a.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
 where t.slug = 'pgtap-unwind';

update public.matches m
   set winner_player_id = null,
       voided = true
  from public.tournaments t
 where t.id = m.tournament_id
   and t.slug = 'pgtap-unwind'
   and m.round = 0
   and m.index_in_round = 2;

select is(
  (
    select p.side_a_player_id
      from public.matches p
      join public.tournaments t on t.id = p.tournament_id
     where t.slug = 'pgtap-unwind'
       and p.round = 1
       and p.index_in_round = 1
  ),
  null,
  'any winner update clears the unsettled parent side'
);

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id, winner_player_id, settled_at
)
select t.id, 0, 4, a.id, b.id, a.id, '2026-08-10 12:00:00+00'
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
  join public.players b on b.provider_id = 'pgtap-unwind-b'
 where t.slug = 'pgtap-unwind';

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id, winner_player_id, settled_at
)
select t.id, 1, 2, a.id, b.id, a.id, '2026-08-11 12:00:00+00'
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
  join public.players b on b.provider_id = 'pgtap-unwind-b'
 where t.slug = 'pgtap-unwind';

update public.matches m
   set winner_player_id = null,
       voided = true
  from public.tournaments t
 where t.id = m.tournament_id
   and t.slug = 'pgtap-unwind'
   and m.round = 0
   and m.index_in_round = 4;

select is(
  (
    select p.side_a_player_id = a.id
      from public.matches p
      join public.tournaments t on t.id = p.tournament_id
      join public.players a on a.provider_id = 'pgtap-unwind-a'
     where t.slug = 'pgtap-unwind'
       and p.round = 1
       and p.index_in_round = 2
  ),
  true,
  'a parent that already has its own winner keeps the side'
);

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id, winner_player_id, settled_at
)
select t.id, 0, 6, a.id, b.id, a.id, '2026-08-10 12:00:00+00'
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
  join public.players b on b.provider_id = 'pgtap-unwind-b'
 where t.slug = 'pgtap-unwind';

insert into public.matches (
  tournament_id, round, index_in_round, side_a_player_id
)
select t.id, 1, 3, a.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
 where t.slug = 'pgtap-unwind';

update public.matches m
   set winner_player_id = a.id
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
 where t.id = m.tournament_id
   and t.slug = 'pgtap-unwind'
   and m.round = 0
   and m.index_in_round = 6;

select is(
  (
    select p.side_a_player_id = a.id
      from public.matches p
      join public.tournaments t on t.id = p.tournament_id
      join public.players a on a.provider_id = 'pgtap-unwind-a'
     where t.slug = 'pgtap-unwind'
       and p.round = 1
       and p.index_in_round = 3
  ),
  true,
  'writing the same winner leaves the parent side'
);

insert into public.matches (
  tournament_id, round, index_in_round,
  side_a_player_id, side_b_player_id, winner_player_id, settled_at
)
select t.id, 0, 1, a.id, b.id, b.id, '2026-08-10 12:00:00+00'
  from public.tournaments t
  join public.players a on a.provider_id = 'pgtap-unwind-a'
  join public.players b on b.provider_id = 'pgtap-unwind-b'
 where t.slug = 'pgtap-unwind';

update public.matches p
   set side_b_player_id = b.id
  from public.tournaments t
  join public.players b on b.provider_id = 'pgtap-unwind-b'
 where t.id = p.tournament_id
   and t.slug = 'pgtap-unwind'
   and p.round = 1
   and p.index_in_round = 0;

update public.matches m
   set winner_player_id = null,
       voided = true
  from public.tournaments t
 where t.id = m.tournament_id
   and t.slug = 'pgtap-unwind'
   and m.round = 0
   and m.index_in_round = 1;

select is(
  (
    select p.side_b_player_id
      from public.matches p
      join public.tournaments t on t.id = p.tournament_id
     where t.slug = 'pgtap-unwind'
       and p.round = 1
       and p.index_in_round = 0
  ),
  null,
  'an odd child clears the parent b side'
);

select * from finish();
rollback;
