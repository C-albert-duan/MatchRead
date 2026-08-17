-- 0004_leagues.sql
-- Product: leagues, events, members, invites. No seed data.

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null unique,
  name text not null,
  format text not null check (format in ('single', 'season')),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  is_solo boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.leagues is 'Product: group owned by a profile.';

create table public.league_tournaments (
  league_id uuid not null references public.leagues (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete restrict,
  locked_at timestamptz,
  locked_by uuid references public.profiles (id) on delete set null,
  primary key (league_id, tournament_id)
);

comment on table public.league_tournaments is 'Product: events this league plays + per-event commissioner lock.';

create table public.members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('commissioner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

comment on table public.members is 'Product: who is in the league.';

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.invites is 'Product: shareable join token.';

create index league_tournaments_tournament_id_idx on public.league_tournaments (tournament_id);
create index members_user_id_idx on public.members (user_id);
create index invites_league_id_idx on public.invites (league_id);

-- Single-format leagues may have at most one tournament row.
create or replace function public.enforce_single_league_tournament()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_count int;
begin
  select format into v_format from public.leagues where id = new.league_id;
  if v_format = 'single' then
    select count(*) into v_count
      from public.league_tournaments
     where league_id = new.league_id
       and tournament_id is distinct from new.tournament_id;
    if v_count > 0 then
      raise exception 'single league may only include one tournament';
    end if;
  end if;
  return new;
end;
$$;

create trigger league_tournaments_single_guard
  before insert or update on public.league_tournaments
  for each row execute function public.enforce_single_league_tournament();

alter table public.leagues enable row level security;
alter table public.league_tournaments enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;

-- Helpers used by policies / RPCs
create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
     where league_id = p_league_id and user_id = auth.uid()
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
    select 1 from public.leagues l
     where l.id = p_league_id and l.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.members
     where league_id = p_league_id
       and user_id = auth.uid()
       and role = 'commissioner'
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
revoke all on function public.is_league_commissioner(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.is_league_commissioner(uuid) to authenticated;

create policy leagues_select_member on public.leagues
  for select using (public.is_league_member(id));

create policy league_tournaments_select_member on public.league_tournaments
  for select using (public.is_league_member(league_id));

create policy members_select_member on public.members
  for select using (public.is_league_member(league_id));

create policy invites_select_commissioner on public.invites
  for select using (public.is_league_commissioner(league_id));

grant select on table public.leagues to authenticated;
grant select on table public.league_tournaments to authenticated;
grant select on table public.members to authenticated;
grant select on table public.invites to authenticated;

revoke all on table public.leagues from anon;
revoke all on table public.league_tournaments from anon;
revoke all on table public.members from anon;
revoke all on table public.invites from anon;
