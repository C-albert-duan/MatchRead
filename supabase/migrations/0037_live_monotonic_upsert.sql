-- 0037_live_monotonic_upsert.sql
-- A live row moves only when the provider clock is newer.
-- Receipt time is stored. It is not the order.

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
  v_clock_newer boolean := false;
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

  if prev.occurred_at is not null and v_occurred is not null then
    if v_occurred <= prev.occurred_at then
      return 'ignored';
    end if;
    v_clock_newer := true;
  end if;

  if not v_clock_newer then
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
  'Replaces the current live row only when occurred_at is newer. An equal or earlier provider clock is a no-op. received_at is receipt, not the order. Does not update matches.';

revoke all on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz
) to service_role;
