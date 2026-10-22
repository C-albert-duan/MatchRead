-- 0032_live_state_semantics.sql
-- Canonical live values. The raw provider object stays out of this row.

alter table public.live_match_state
  rename column observed_at to received_at;

alter table public.live_match_state
  add column flag text,
  add column stats jsonb;

alter table public.live_match_state
  drop constraint if exists live_match_state_flag_check;
alter table public.live_match_state
  add constraint live_match_state_flag_check
  check (flag is null or flag in ('live', 'provisional'));

alter table public.live_match_state
  drop constraint if exists live_match_state_sets_check;
alter table public.live_match_state
  add constraint live_match_state_sets_check
  check (
    score_text is null
    or score_text ~ '^([0-9]+-[0-9]+)(,[0-9]+-[0-9]+)*$'
  );

alter table public.live_match_state
  drop constraint if exists live_match_state_game_check;
alter table public.live_match_state
  add constraint live_match_state_game_check
  check (
    points_text is null
    or points_text ~ '^(0|15|30|40|AD)-(0|15|30|40|AD)$'
  );

alter table public.live_match_state
  drop constraint if exists live_match_state_stats_check;
alter table public.live_match_state
  add constraint live_match_state_stats_check
  check (
    stats is null
    or (
      jsonb_typeof(stats) = 'object'
      and not (stats ?| array['payload', 'score', 'points', 'player1', 'player2', 'indicator', 'matchId'])
    )
  );

comment on column public.live_match_state.phase is
  'Live-facing status: in_play, suspended, or provisional_final.';
comment on column public.live_match_state.score_text is
  'Canonical set text, N-N parts. Not the provider field name.';
comment on column public.live_match_state.points_text is
  'Game points as 0, 15, 30, 40, or AD on each side.';
comment on column public.live_match_state.serving_side is
  'a, b, or null. Not the provider indicator.';
comment on column public.live_match_state.flag is
  'live or provisional, derived from phase. Null when that mark is not derived. Not an eligibility tier.';
comment on column public.live_match_state.provisional_winner_ref is
  'Temporary live winner ref. Not matches.winner_player_id and not winner_side.';
comment on column public.live_match_state.occurred_at is
  'Provider updatedAt. Used as the order when sequence_source is updatedAt.';
comment on column public.live_match_state.received_at is
  'When MatchRead received the frame. Not the provider clock.';
comment on column public.live_match_state.stats is
  'Thin facts only. Not the raw provider payload.';

drop function if exists public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz
);

create function public.upsert_live_match_state(
  p_match_id uuid,
  p_tournament_id uuid,
  p_public_ref text,
  p_phase text,
  p_score_text text,
  p_points_text text,
  p_serving_side text,
  p_provisional_winner_ref text,
  p_sequence bigint,
  p_sequence_source text,
  p_frame_key text,
  p_source text,
  p_received_at timestamptz,
  p_occurred_at timestamptz default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prev public.live_match_state%rowtype;
  rank_prev int;
  rank_next int;
  v_sets text;
  v_game text;
  v_flag text;
  v_occurred timestamptz;
begin
  if p_phase not in ('in_play', 'suspended', 'provisional_final') then
    return 'ignored';
  end if;
  if p_sequence_source not in ('seq', 'updatedAt', 'receivedAt') then
    return 'ignored';
  end if;
  if p_source not in ('rest', 'socket', 'replay') then
    return 'ignored';
  end if;
  if p_serving_side is not null and p_serving_side not in ('a', 'b') then
    return 'ignored';
  end if;
  if p_sequence_source = 'updatedAt' and p_occurred_at is null then
    return 'ignored';
  end if;

  v_sets := case
    when p_score_text ~ '^([0-9]+-[0-9]+)(,[0-9]+-[0-9]+)*$' then p_score_text
    else null
  end;
  v_game := case
    when p_points_text ~ '^(0|15|30|40|AD)-(0|15|30|40|AD)$' then p_points_text
    else null
  end;
  v_flag := case p_phase
    when 'in_play' then 'live'
    when 'provisional_final' then 'provisional'
    else null
  end;
  v_occurred := case
    when p_sequence_source = 'updatedAt' then p_occurred_at
    else null
  end;

  select * into prev
    from public.live_match_state
   where match_id = p_match_id;

  if not found then
    insert into public.live_match_state (
      match_id, tournament_id, public_ref, phase, score_text, points_text,
      serving_side, provisional_winner_ref, flag, stats, sequence, sequence_source,
      frame_key, source, received_at, occurred_at
    ) values (
      p_match_id, p_tournament_id, p_public_ref, p_phase, v_sets, v_game,
      p_serving_side, p_provisional_winner_ref, v_flag, null, p_sequence, p_sequence_source,
      p_frame_key, p_source, p_received_at, v_occurred
    );
    return 'applied';
  end if;

  rank_prev := case prev.sequence_source
    when 'seq' then 3
    when 'updatedAt' then 2
    else 1
  end;
  rank_next := case p_sequence_source
    when 'seq' then 3
    when 'updatedAt' then 2
    else 1
  end;
  if prev.sequence_source is distinct from p_sequence_source or rank_prev <> rank_next then
    return 'ignored';
  end if;
  if p_sequence < prev.sequence then
    return 'ignored';
  end if;
  if p_sequence = prev.sequence then
    if p_frame_key = prev.frame_key then
      return 'duplicate';
    end if;
    return 'ignored';
  end if;

  update public.live_match_state
     set tournament_id = p_tournament_id,
         public_ref = p_public_ref,
         phase = p_phase,
         score_text = v_sets,
         points_text = v_game,
         serving_side = p_serving_side,
         provisional_winner_ref = p_provisional_winner_ref,
         flag = v_flag,
         stats = null,
         sequence = p_sequence,
         sequence_source = p_sequence_source,
         frame_key = p_frame_key,
         source = p_source,
         received_at = p_received_at,
         occurred_at = v_occurred,
         updated_at = now()
   where match_id = p_match_id;
  return 'applied';
end;
$$;

comment on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz
) is
  'Replaces the current live row. Provider order is occurred_at. Receipt is received_at. Does not update matches.';

revoke all on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz
) to service_role;
