-- 0012: League + member CRUD — delete grants, RLS, and clear RPCs.
-- Idempotent.

grant delete on public.leagues to authenticated;
grant delete on public.league_members to authenticated;

drop policy if exists "leagues_delete_commissioner" on public.leagues;
create policy "leagues_delete_commissioner"
  on public.leagues for delete
  to authenticated
  using (public.is_league_commissioner(id));

drop policy if exists "members_delete_self_or_commissioner" on public.league_members;
create policy "members_delete_self_or_commissioner"
  on public.league_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_league_commissioner(league_id)
      and role = 'member'
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs (security definer) — clear errors for the app
-- ---------------------------------------------------------------------------

create or replace function public.update_league(
  p_league_id uuid,
  p_name text,
  p_visibility text
)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.leagues;
  v_name text := trim(p_name);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'not commissioner';
  end if;
  if v_name is null or length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'invalid name';
  end if;
  if p_visibility not in ('private', 'public') then
    raise exception 'invalid visibility';
  end if;

  update public.leagues
     set name = v_name,
         visibility = p_visibility
   where id = p_league_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'league not found';
  end if;
  return v_row;
end;
$$;

revoke all on function public.update_league(uuid, text, text) from public;
grant execute on function public.update_league(uuid, text, text) to authenticated;

create or replace function public.delete_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'not commissioner';
  end if;

  delete from public.leagues where id = p_league_id;
  if not found then
    raise exception 'league not found';
  end if;
end;
$$;

revoke all on function public.delete_league(uuid) from public;
grant execute on function public.delete_league(uuid) to authenticated;

create or replace function public.kick_league_member(
  p_league_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'not commissioner';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot kick self';
  end if;

  select role into v_role
    from public.league_members
   where league_id = p_league_id
     and user_id = p_user_id;

  if v_role is null then
    raise exception 'member not found';
  end if;
  if v_role = 'commissioner' then
    raise exception 'cannot kick commissioner';
  end if;

  delete from public.league_members
   where league_id = p_league_id
     and user_id = p_user_id;
end;
$$;

revoke all on function public.kick_league_member(uuid, uuid) from public;
grant execute on function public.kick_league_member(uuid, uuid) to authenticated;

create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select role into v_role
    from public.league_members
   where league_id = p_league_id
     and user_id = auth.uid();

  if v_role is null then
    raise exception 'not a member';
  end if;
  if v_role = 'commissioner' then
    raise exception 'commissioner cannot leave';
  end if;

  delete from public.league_members
   where league_id = p_league_id
     and user_id = auth.uid();
end;
$$;

revoke all on function public.leave_league(uuid) from public;
grant execute on function public.leave_league(uuid) to authenticated;
