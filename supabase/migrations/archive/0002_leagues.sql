-- 0002_leagues.sql
-- Phase 2: leagues, membership, invites, RLS, grants, and create/join RPCs.
-- Fresh install: run after 0001_init.sql (profiles must exist).
-- Idempotent: safe to re-run in SQL Editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  format text not null check (format in ('single', 'season')),
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  -- Fixture label until tournaments reference table exists (Phase 3+)
  tournament_label text,
  commissioner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint leagues_single_needs_tournament check (
    format = 'season' or tournament_label is not null
  )
);

create table if not exists public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member'
    check (role in ('commissioner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index if not exists league_members_user_id_idx
  on public.league_members (user_id);

create table if not exists public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists league_invites_league_id_idx
  on public.league_invites (league_id);

-- ---------------------------------------------------------------------------
-- Privileges (required when applying via SQL Editor)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert, update on public.leagues to authenticated;
grant select, insert on public.league_members to authenticated;
grant select, insert, update on public.league_invites to authenticated;
grant select, insert, update on public.profiles to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (security definer — keep search_path fixed)
-- ---------------------------------------------------------------------------

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_league_commissioner(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = auth.uid()
      and m.role = 'commissioner'
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
revoke all on function public.is_league_commissioner(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.is_league_commissioner(uuid) to authenticated;

-- Invite preview for /join/[token] (signed-out readable)
create or replace function public.get_invite_preview(p_token text)
returns table (
  token text,
  league_id uuid,
  league_slug text,
  league_name text,
  format text,
  visibility text,
  tournament_label text,
  member_count bigint,
  revoked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.token,
    l.id,
    l.slug,
    l.name,
    l.format,
    l.visibility,
    l.tournament_label,
    (select count(*)::bigint from public.league_members m where m.league_id = l.id),
    (i.revoked_at is not null)
  from public.league_invites i
  join public.leagues l on l.id = i.league_id
  where i.token = p_token
  limit 1;
$$;

revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- Join via invite (authenticated)
create or replace function public.join_league_with_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid;
  v_revoked timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select i.league_id, i.revoked_at
    into v_league_id, v_revoked
  from public.league_invites i
  where i.token = p_token;

  if v_league_id is null then
    raise exception 'invalid invite';
  end if;

  if v_revoked is not null then
    raise exception 'invite revoked';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (v_league_id, auth.uid(), 'member')
  on conflict (league_id, user_id) do nothing;

  return v_league_id;
end;
$$;

revoke all on function public.join_league_with_token(text) from public;
grant execute on function public.join_league_with_token(text) to authenticated;

-- Ensure a profile row exists for the signed-in user
create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.profiles (id)
  values (auth.uid())
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.ensure_profile() from public;
grant execute on function public.ensure_profile() to authenticated;

-- Atomic create: league + commissioner membership + invite
-- DROP required when return columns change (id/slug → league_id/league_slug)
drop function if exists public.create_league(text, text, text, text, text);

create or replace function public.create_league(
  p_name text,
  p_slug text,
  p_format text,
  p_visibility text,
  p_tournament_label text
)
returns table (league_id uuid, league_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_league_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Give your league a name.';
  end if;

  if p_format not in ('single', 'season') then
    raise exception 'Choose a format.';
  end if;

  if p_visibility not in ('private', 'public') then
    raise exception 'Choose who can see it.';
  end if;

  if p_format = 'single'
     and (p_tournament_label is null or length(trim(p_tournament_label)) = 0) then
    raise exception 'Pick a tournament.';
  end if;

  insert into public.profiles (id)
  values (v_uid)
  on conflict (id) do nothing;

  insert into public.leagues as l (
    slug,
    name,
    format,
    visibility,
    tournament_label,
    commissioner_id
  )
  values (
    p_slug,
    trim(p_name),
    p_format,
    p_visibility,
    case when p_format = 'single' then trim(p_tournament_label) else null end,
    v_uid
  )
  returning l.id into v_league_id;

  insert into public.league_members (league_id, user_id, role)
  values (v_league_id, v_uid, 'commissioner');

  insert into public.league_invites (league_id, created_by)
  values (v_league_id, v_uid);

  league_id := v_league_id;
  league_slug := p_slug;
  return next;
end;
$$;

revoke all on function public.create_league(text, text, text, text, text) from public;
grant execute on function public.create_league(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_invites enable row level security;

drop policy if exists "leagues_select_member" on public.leagues;
create policy "leagues_select_member"
  on public.leagues for select
  to authenticated
  using (public.is_league_member(id));

drop policy if exists "leagues_insert_commissioner" on public.leagues;
create policy "leagues_insert_commissioner"
  on public.leagues for insert
  to authenticated
  with check (commissioner_id = auth.uid());

drop policy if exists "leagues_update_commissioner" on public.leagues;
create policy "leagues_update_commissioner"
  on public.leagues for update
  to authenticated
  using (public.is_league_commissioner(id))
  with check (public.is_league_commissioner(id));

drop policy if exists "members_select_same_league" on public.league_members;
create policy "members_select_same_league"
  on public.league_members for select
  to authenticated
  using (public.is_league_member(league_id));

drop policy if exists "members_insert_self_commissioner" on public.league_members;
create policy "members_insert_self_commissioner"
  on public.league_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      role = 'commissioner'
      or public.is_league_commissioner(league_id)
    )
  );

-- Preferred create/join paths: create_league / join_league_with_token (security definer).

drop policy if exists "invites_select_commissioner" on public.league_invites;
create policy "invites_select_commissioner"
  on public.league_invites for select
  to authenticated
  using (public.is_league_commissioner(league_id));

drop policy if exists "invites_insert_commissioner" on public.league_invites;
create policy "invites_insert_commissioner"
  on public.league_invites for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_league_commissioner(league_id)
  );

drop policy if exists "invites_update_commissioner" on public.league_invites;
create policy "invites_update_commissioner"
  on public.league_invites for update
  to authenticated
  using (public.is_league_commissioner(league_id))
  with check (public.is_league_commissioner(league_id));
