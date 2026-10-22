-- Tournament plus phase, and one partial index for a set flag.
-- flag = 'live' uses that partial. A second live-only index would repeat it.

begin;

select plan(4);

select ok(
  exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'live_match_state'
       and indexname = 'live_match_state_tournament_phase_idx'
       and indexdef ilike '%(tournament_id, phase)%'
       and indexdef not ilike '%where%'
  ),
  'tournament and phase'
);

select ok(
  exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'live_match_state'
       and indexname = 'live_match_state_flag_idx'
       and indexdef ilike '%(flag, tournament_id)%'
       and indexdef ilike '%where (flag is not null)%'
  ),
  'flag partial covers live and provisional'
);

select ok(
  not exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'live_match_state'
       and indexname = 'live_match_state_tournament_idx'
  ),
  'tournament-only index is gone'
);

select ok(
  not exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'live_match_state'
       and indexdef ilike '%where (flag = ''live''%'
  ),
  'no separate live-only index'
);

select * from finish();
rollback;
