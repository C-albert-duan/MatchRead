-- 0009_display_names.sql
-- Display names on profiles (not auth identifiers). League mates can read names
-- for standings / highlights. Users set their own name via upsert / RPC.

-- League mates may read each other's profiles (display_name for standings).
drop policy if exists profiles_select_league_mates on public.profiles;
create policy profiles_select_league_mates on public.profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1
      from public.league_members me
      join public.league_members them
        on them.league_id = me.league_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );

-- Keep own-select for users not yet in a league (or drop redundant own-only).
-- profiles_select_own still allows self; league_mates overlaps — both OK.

create or replace function public.set_my_display_name(p_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'Display name is required';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 32 then
    raise exception 'Display name must be 2–32 characters';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), v_name)
  on conflict (id) do update
    set display_name = excluded.display_name
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_my_display_name(text) from public;
grant execute on function public.set_my_display_name(text) to authenticated;

-- ensure_profile may optionally set a name on first touch
drop function if exists public.ensure_profile();
drop function if exists public.ensure_profile(text);

create or replace function public.ensure_profile(p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_display_name), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), v_name)
  on conflict (id) do update
    set display_name = coalesce(v_name, public.profiles.display_name);
end;
$$;

revoke all on function public.ensure_profile(text) from public;
grant execute on function public.ensure_profile(text) to authenticated;
