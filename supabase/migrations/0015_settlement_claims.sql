-- 0015_settlement_claims.sql
-- Sprint Directive 2.1 §2.3: idempotent settlement at the match boundary.

create table if not exists public.settlement_claims (
  match_id uuid primary key references public.matches (id) on delete cascade,
  outcome text not null
    check (outcome in ('winner', 'void')),
  winner_player_id uuid references public.players (id) on delete restrict,
  claimed_at timestamptz not null default now(),
  run_id uuid references public.sync_repair_runs (id) on delete set null,
  check (
    (outcome = 'void' and winner_player_id is null)
    or (outcome = 'winner' and winner_player_id is not null)
  )
);

comment on table public.settlement_claims is
  'One settlement claim per match. Replay-safe; conflict unwinds parent advance.';

create index if not exists settlement_claims_run_idx
  on public.settlement_claims (run_id);

alter table public.settlement_claims enable row level security;

drop policy if exists settlement_claims_select_auth on public.settlement_claims;
create policy settlement_claims_select_auth on public.settlement_claims
  for select to authenticated using (true);

grant select on table public.settlement_claims to authenticated;
revoke all on table public.settlement_claims from anon;

-- Clear a prior parent-side write when a claim is replaced.
create or replace function public.unwind_settlement_parent(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches%rowtype;
  parent_round int;
  parent_index int;
  parent_col text;
  prior uuid;
begin
  select * into m from public.matches where id = p_match;
  if not found then
    return;
  end if;
  if m.winner_player_id is null then
    return;
  end if;

  parent_round := m.round + 1;
  parent_index := m.index_in_round / 2;
  parent_col := case when m.index_in_round % 2 = 0
    then 'side_a_player_id' else 'side_b_player_id' end;

  execute format(
    'select %I from public.matches
      where tournament_id = $1 and round = $2 and index_in_round = $3',
    parent_col
  )
  into prior
  using m.tournament_id, parent_round, parent_index;

  if prior is not distinct from m.winner_player_id then
    execute format(
      'update public.matches set %I = null
        where tournament_id = $1 and round = $2 and index_in_round = $3
          and winner_player_id is null',
      parent_col
    )
    using m.tournament_id, parent_round, parent_index;
  end if;
end;
$$;

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

  select * into existing from public.settlement_claims where match_id = p_match;
  if not found then
    insert into public.settlement_claims (
      match_id, outcome, winner_player_id, claimed_at, run_id
    ) values (
      p_match, p_outcome, p_winner, now(), p_run
    );
    return 'claimed';
  end if;

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

revoke all on function public.claim_settlement(uuid, text, uuid, uuid) from public;
revoke all on function public.unwind_settlement_parent(uuid) from public;
grant execute on function public.claim_settlement(uuid, text, uuid, uuid) to service_role;
grant execute on function public.unwind_settlement_parent(uuid) to service_role;
