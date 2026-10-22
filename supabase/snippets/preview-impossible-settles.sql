-- Read-only. Settled later-round matches that cannot have been played yet:
-- a stored feeder is still undecided, or the published start is in the future.
-- Before the bindResultsByPlayerPair feeder guard, a player's own result could
-- bind to the next round while its other side was still empty (t-atp-21358).
-- Review this list before running repair-impossible-settles.sql.

select
  t.slug,
  m.round,
  m.index_in_round,
  m.external_ref,
  w.last_name as winner,
  a.last_name as side_a,
  b.last_name as side_b,
  m.settled_at,
  case when m.has_time then m.scheduled_at end as starts_at,
  fa.id is not null and fa.winner_player_id is null and not fa.voided as feeder_a_undecided,
  fb.id is not null and fb.winner_player_id is null and not fb.voided as feeder_b_undecided,
  (select count(*) from public.picks p where p.match_id = m.id) as picks_on_match
from public.matches m
join public.tournaments t on t.id = m.tournament_id
left join public.matches fa
  on fa.tournament_id = m.tournament_id
 and fa.round = m.round - 1
 and fa.index_in_round = m.index_in_round * 2
left join public.matches fb
  on fb.tournament_id = m.tournament_id
 and fb.round = m.round - 1
 and fb.index_in_round = m.index_in_round * 2 + 1
left join public.players w on w.id = m.winner_player_id
left join public.players a on a.id = m.side_a_player_id
left join public.players b on b.id = m.side_b_player_id
where m.round > 0
  and m.winner_player_id is not null
  and not m.voided
  and (
    (fa.id is not null and fa.winner_player_id is null and not fa.voided)
    or (fb.id is not null and fb.winner_player_id is null and not fb.voided)
    or (m.has_time and m.scheduled_at > now())
  )
order by t.slug, m.round desc, m.index_in_round;
