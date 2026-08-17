-- 0008_member_invite_rpcs.sql
-- Kick / leave / reissue invite. No seed data.

create or replace function public.kick_league_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot kick self';
  end if;
  if exists (
    select 1 from public.leagues where id = p_league_id and owner_id = p_user_id
  ) then
    raise exception 'cannot kick commissioner';
  end if;
  delete from public.members
   where league_id = p_league_id and user_id = p_user_id;
  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists (
    select 1 from public.leagues where id = p_league_id and owner_id = auth.uid()
  ) then
    raise exception 'commissioner cannot leave';
  end if;
  delete from public.members
   where league_id = p_league_id and user_id = auth.uid();
  if not found then
    raise exception 'not a member';
  end if;
end;
$$;

create or replace function public.reissue_invite(p_league_id uuid)
returns public.invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invites;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner';
  end if;

  update public.invites
     set revoked_at = now()
   where league_id = p_league_id
     and revoked_at is null;

  insert into public.invites (league_id, token, created_by)
  values (p_league_id, encode(extensions.gen_random_bytes(16), 'hex'), auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.kick_league_member(uuid, uuid) from public;
revoke all on function public.leave_league(uuid) from public;
revoke all on function public.reissue_invite(uuid) from public;
grant execute on function public.kick_league_member(uuid, uuid) to authenticated;
grant execute on function public.leave_league(uuid) to authenticated;
grant execute on function public.reissue_invite(uuid) to authenticated;
