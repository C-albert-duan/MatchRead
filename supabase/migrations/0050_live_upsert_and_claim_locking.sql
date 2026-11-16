-- 0050_live_upsert_and_claim_locking.sql
--
-- Fix list P2-3 and P2-5 (check/CODEBASE-FIX-LIST.md). Bodies are 0037
-- (upsert_live_match_state) and 0015 (claim_settlement) with only the
-- marked 0050 changes.
--
-- P2-3. upsert_live_match_state read the previous row without a lock, so two
-- writers (listener and cron, or two listener replicas) could both pass the
-- clock check and the older frame could win. A row first ordered by receipt
-- time also refused every later frame that carried a provider clock, so the
-- match froze. Now the row is claimed with insert ... on conflict, locked
-- with for update, and a receipt-ordered row upgrades to a provider order.
--
-- P2-5. claim_settlement did select-then-insert with no lock.

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

  -- 0050: claim the row, then lock it. Two writers for the same match used
  -- to read the same previous row and both pass the clock check, and two
  -- first frames raced on the insert.
  insert into public.live_match_state (
    match_id, tournament_id, public_ref, phase, score_text, points_text,
    serving_side, provisional_winner_ref, flag, stats, sequence, sequence_source,
    frame_key, source, received_at, occurred_at
  ) values (
    p_match_id, p_tournament_id, p_public_ref, p_phase, v_sets, v_game,
    p_serving_side, p_provisional_winner_ref, v_flag, null, p_sequence, p_sequence_source,
    p_frame_key, p_source, p_received_at, v_occurred
  )
  on conflict (match_id) do nothing;
  if found then
    return 'applied';
  end if;

  select * into prev
    from public.live_match_state
   where match_id = p_match_id
     for update;

  if prev.occurred_at is not null and v_occurred is not null then
    if v_occurred <= prev.occurred_at then
      return 'ignored';
    end if;
    v_clock_newer := true;
  end if;

  -- 0050: a row ordered by receipt time gives way to the first frame that
  -- carries a provider order (seq or updatedAt). Never the other way.
  if not v_clock_newer
     and prev.sequence_source = 'receivedAt'
     and p_sequence_source in ('seq', 'updatedAt') then
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

revoke all on function public.upsert_live_match_state(uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_live_match_state(uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz) to service_role;

create or replace function public.claim_settlement(
  p_match uuid,
  p_outcome text,
  p_winner uuid,
  p_run uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.settlement_claims%rowtype;
begin
  if p_outcome not in ('winner', 'void') then
    raise exception 'invalid settlement outcome';
  end if;
  if p_outcome = 'winner' and p_winner is null then
    raise exception 'winner required';
  end if;
  if p_outcome = 'void' and p_winner is not null then
    raise exception 'void cannot carry winner';
  end if;

  -- 0050: insert first; on conflict lock the existing claim. Two overlapping
  -- runs used to both see "no claim" and the second hit a key violation.
  insert into public.settlement_claims (
    match_id, outcome, winner_player_id, claimed_at, run_id
  ) values (
    p_match, p_outcome, p_winner, now(), p_run
  )
  on conflict (match_id) do nothing;
  if found then
    return 'claimed';
  end if;

  select * into existing
    from public.settlement_claims
   where match_id = p_match
     for update;

  if existing.outcome = p_outcome
     and existing.winner_player_id is not distinct from p_winner then
    return 'noop';
  end if;

  -- Conflicting claim: unwind prior parent write, then replace.
  perform public.unwind_settlement_parent(p_match);
  update public.settlement_claims
     set outcome = p_outcome,
         winner_player_id = p_winner,
         claimed_at = now(),
         run_id = p_run
   where match_id = p_match;
  return 'replaced';
end;
$$;

-- 0047 already limits claim_settlement to service_role; create or replace
-- keeps those grants.
