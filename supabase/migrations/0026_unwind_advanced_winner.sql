-- A parent side is the stored child winner. Clear that side when the child
-- winner changes, using the claim when the match column was already cleared.

create or replace function public.unwind_settlement_parent(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches%rowtype;
  prior_winner uuid;
  parent_round int;
  parent_index int;
  parent_col text;
  prior uuid;
begin
  select * into m from public.matches where id = p_match;
  if not found then
    return;
  end if;

  -- The claim still names the player who was advanced after the match
  -- column has been cleared. A row with no claim uses the match winner.
  select c.winner_player_id
    into prior_winner
    from public.settlement_claims c
   where c.match_id = p_match;

  if prior_winner is null then
    prior_winner := m.winner_player_id;
  end if;
  if prior_winner is null then
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

  if prior is not distinct from prior_winner then
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

comment on function public.unwind_settlement_parent(uuid) is
  'Remove the advanced player from the parent side. The claim winner wins over the match column. A parent that already has its own winner is left in place.';

create or replace function public.matches_before_winner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.winner_player_id is not null
     and old.winner_player_id is distinct from new.winner_player_id then
    perform public.unwind_settlement_parent(old.id);
  end if;
  return new;
end;
$$;

comment on function public.matches_before_winner_change() is
  'Before a child winner changes, clear that player from the unsettled parent side.';

revoke all on function public.matches_before_winner_change() from public;

drop trigger if exists matches_unwind_advanced_winner on public.matches;
create trigger matches_unwind_advanced_winner
  before update of winner_player_id
  on public.matches
  for each row
  execute function public.matches_before_winner_change();
