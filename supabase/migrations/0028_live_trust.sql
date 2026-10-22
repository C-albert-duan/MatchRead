-- 0028_live_trust.sql
-- Read name for the socket map, and a monotonic live upsert.
-- The function writes live_match_state only. It does not update matches.

create or replace view public.provider_event_map
with (security_invoker = true) as
select
  id,
  tournament_id,
  match_id,
  pair_key,
  socket_event_id,
  status,
  confidence,
  method,
  mapped_at,
  expires_at
from public.event_map;

comment on view public.provider_event_map is
  'Read name for event_map. A fixture id is not a socket id. Writes stay on event_map.';

revoke all on table public.provider_event_map from public, anon;
grant select on table public.provider_event_map to authenticated;

alter table public.listener_health
  add column if not exists frames_disagreement bigint not null default 0;

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
  p_observed_at timestamptz
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
      frame_key, source, observed_at
    ) values (
      p_match_id, p_tournament_id, p_public_ref, p_phase, p_score_text, p_points_text,
      p_serving_side, p_provisional_winner_ref, p_sequence, p_sequence_source,
      p_frame_key, p_source, p_observed_at
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
         updated_at = now()
   where match_id = p_match_id;
  return 'applied';
end;
$$;

comment on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz
) is
  'Monotonic live projection write. Does not update matches.';

revoke all on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.upsert_live_match_state(
  uuid, uuid, text, text, text, text, text, text, bigint, text, text, text, timestamptz
) to service_role;
