-- 0002_tournaments_players_seats.sql
-- Tennis facts: calendar, people, official field. No seed data.

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tour text not null check (tour in ('atp', 'wta')),
  surface text,
  starts_on date not null,
  ends_on date not null,
  venue_tz text,
  draw_size int check (draw_size is null or draw_size in (2, 4, 8, 16, 32, 64, 128)),
  provider_id text unique,
  published_at timestamptz,
  lock_at timestamptz,
  created_at timestamptz not null default now(),
  unique (name, tour),
  check (ends_on >= starts_on)
);

comment on table public.tournaments is 'Tennis fact: calendar event + publish/lock. Empty until sync.';
comment on column public.tournaments.slug is 'URL id (was ref).';
comment on column public.tournaments.published_at is 'Null = draw pending; set when official seats are published.';
comment on column public.tournaments.lock_at is 'Platform first timed R0 ball.';

create table public.players (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null unique,
  last_name text not null,
  country_code text,
  created_at timestamptz not null default now(),
  check (length(trim(last_name)) > 0),
  check (last_name !~* '^player\s*\d+$'),
  check (last_name !~* '^p-\d+$')
);

comment on table public.players is 'Tennis fact: real people from the provider. No fictional names.';

create table public.seats (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  position int not null check (position >= 0),
  kind text not null check (kind in ('player', 'bye', 'tbd')),
  player_id uuid references public.players (id) on delete restrict,
  seed int check (seed is null or seed > 0),
  entry text check (entry is null or entry in ('wc', 'pr')),
  tbd_label text,
  primary key (tournament_id, position),
  check (
    (kind = 'player' and player_id is not null and tbd_label is null)
    or (kind = 'bye' and player_id is null and tbd_label is null)
    or (kind = 'tbd' and player_id is null and tbd_label is not null)
  )
);

comment on table public.seats is 'Tennis fact: official main-draw sheet in slot order.';

create index seats_player_id_idx on public.seats (player_id) where player_id is not null;
create index tournaments_starts_on_idx on public.tournaments (starts_on);

-- Official draw: seat count matches draw_size; every seat is player|bye|tbd (enforced by CHECKs).
create or replace function public.draw_is_official(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournaments t
    where t.id = p_tournament_id
      and t.draw_size is not null
      and t.published_at is not null
      and (
        select count(*) from public.seats s where s.tournament_id = t.id
      ) = t.draw_size
  );
$$;

revoke all on function public.draw_is_official(uuid) from public;
grant execute on function public.draw_is_official(uuid) to anon, authenticated, service_role;

alter table public.tournaments enable row level security;
alter table public.players enable row level security;
alter table public.seats enable row level security;

create policy tournaments_select_all on public.tournaments for select using (true);
create policy players_select_all on public.players for select using (true);
create policy seats_select_all on public.seats for select using (true);

grant select on table public.tournaments to anon, authenticated;
grant select on table public.players to anon, authenticated;
grant select on table public.seats to anon, authenticated;

-- Writes are service_role / security definer only (no grants to anon/authenticated).
revoke insert, update, delete on table public.tournaments from anon, authenticated;
revoke insert, update, delete on table public.players from anon, authenticated;
revoke insert, update, delete on table public.seats from anon, authenticated;
