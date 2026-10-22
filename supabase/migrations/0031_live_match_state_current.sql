-- 0031_live_match_state_current.sql
-- One current live row per match. Not an event log.
-- There is no platform_events table. Raw unknown payloads stay in
-- unmapped_live_events. Structured notes stay in ops_events.

alter table public.live_match_state
  add column if not exists occurred_at timestamptz;

comment on table public.live_match_state is
  'One current live projection per match. Replaced in place. Not an event log and not an official result.';

comment on column public.live_match_state.phase is
  'Live status: in_play, suspended, or provisional_final.';

comment on column public.live_match_state.score_text is
  'Captured set text. Comma-separated N-N sets.';

comment on column public.live_match_state.points_text is
  'Captured game text, or null.';

comment on column public.live_match_state.serving_side is
  'a or b on the match sides. Null when no server id was captured.';

comment on column public.live_match_state.provisional_winner_ref is
  'Player ref from a terminal live frame. Not matches.winner_player_id.';

comment on column public.live_match_state.observed_at is
  'When MatchRead received the frame.';

comment on column public.live_match_state.occurred_at is
  'Provider updatedAt when that key was present. Null when it was not. Not the receipt time.';

comment on column public.live_match_state.sequence is
  'Thin ordering fact for this current row, with sequence_source and source. Not a stats feed.';

drop function if exists public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz
);

create or replace function public.upsert_live_match_state(
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
  p_observed_at timestamptz,
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

  select * into prev
    from public.live_match_state
   where match_id = p_match_id;

  if not found then
    insert into public.live_match_state (
      match_id, tournament_id, public_ref, phase, score_text, points_text,
      serving_side, provisional_winner_ref, sequence, sequence_source,
      frame_key, source, observed_at, occurred_at
    ) values (
      p_match_id, p_tournament_id, p_public_ref, p_phase, p_score_text, p_points_text,
      p_serving_side, p_provisional_winner_ref, p_sequence, p_sequence_source,
      p_frame_key, p_source, p_observed_at, p_occurred_at
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
         score_text = p_score_text,
         points_text = p_points_text,
         serving_side = p_serving_side,
         provisional_winner_ref = p_provisional_winner_ref,
         sequence = p_sequence,
         sequence_source = p_sequence_source,
         frame_key = p_frame_key,
         source = p_source,
         observed_at = p_observed_at,
         occurred_at = p_occurred_at,
         updated_at = now()
   where match_id = p_match_id;
  return 'applied';
end;
$$;

comment on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz
) is
  'Replaces the current live row when the sequence is newer. Does not append and does not update matches.';

revoke all on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz
) to service_role;
