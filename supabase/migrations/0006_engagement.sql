-- 0006_engagement.sql
-- Phase 6: pick confidence + save_bracket_picks extension.
-- Picks stay { matchKey: playerRef }; confidence is a separate jsonb map.
-- Idempotent: safe to re-run (same final RPC as 0003).

alter table public.brackets
  add column if not exists confidence jsonb not null default '{}'::jsonb;

-- Replace any older overloads with the final 4-arg signature.
drop function if exists public.save_bracket_picks(uuid, uuid, jsonb);
drop function if exists public.save_bracket_picks(uuid, uuid, jsonb, jsonb);

create or replace function public.save_bracket_picks(
  p_league_id uuid,
  p_tournament_id uuid,
  p_picks jsonb,
  p_confidence jsonb default null
)
returns public.brackets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.brackets;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_league_member(p_league_id) then
    raise exception 'not a member';
  end if;
  if public.tournament_is_locked(p_tournament_id) then
    raise exception 'tournament locked';
  end if;
  if p_picks is null or jsonb_typeof(p_picks) <> 'object' then
    raise exception 'invalid picks';
  end if;
  if p_confidence is not null and jsonb_typeof(p_confidence) <> 'object' then
    raise exception 'invalid confidence';
  end if;

  insert into public.brackets as b (
    league_id,
    tournament_id,
    user_id,
    picks,
    confidence,
    updated_at
  )
  values (
    p_league_id,
    p_tournament_id,
    v_uid,
    p_picks,
    coalesce(p_confidence, '{}'::jsonb),
    now()
  )
  on conflict (league_id, tournament_id, user_id)
  do update set
    picks = excluded.picks,
    confidence = case
      when p_confidence is null then b.confidence
      else excluded.confidence
    end,
    updated_at = now()
  where not public.tournament_is_locked(p_tournament_id)
  returning * into v_row;

  if v_row.id is null then
    raise exception 'tournament locked';
  end if;

  return v_row;
end;
$$;

revoke all on function public.save_bracket_picks(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.save_bracket_picks(uuid, uuid, jsonb, jsonb) to authenticated;
