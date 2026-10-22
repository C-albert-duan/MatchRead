-- 0033_live_state_indexes.sql
-- Filters that exist on this table: match_id (primary key), public_ref (unique),
-- and tournament_id. Live status is phase, not a status column. The in-play
-- mark is flag = 'live', which implies flag is not null, so one partial index
-- covers both. The tournament-only index is the left prefix of (tournament_id, phase).

drop index if exists public.live_match_state_tournament_idx;

create index live_match_state_tournament_phase_idx
  on public.live_match_state (tournament_id, phase);

create index live_match_state_flag_idx
  on public.live_match_state (flag, tournament_id)
  where flag is not null;
