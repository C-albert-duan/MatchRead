-- 0014_dual_tour.sql
-- ATP + WTA on the same calendar week. Store tour on tournament rows.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Schema: tour + uniqueness
-- ---------------------------------------------------------------------------

alter table public.tournaments
  add column if not exists tour text;

update public.tournaments
   set tour = 'atp'
 where tour is null;

alter table public.tournaments
  alter column tour set default 'atp';

alter table public.tournaments
  alter column tour set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'tournaments_tour_check'
       and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments
      add constraint tournaments_tour_check
      check (tour in ('atp', 'wta'));
  end if;
end $$;

comment on column public.tournaments.tour is
  'ATP or WTA. Required for provider paths and calendar identity.';

-- Same display name may appear once per tour (e.g. dual US Open rows).
do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'tournaments_name_key'
       and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments drop constraint tournaments_name_key;
  end if;
end $$;

create unique index if not exists tournaments_name_tour_uidx
  on public.tournaments (name, tour);

-- Provider season ids are tour-scoped (same numeric id must not collide across tours).
drop index if exists public.tournaments_provider_tournament_id_uidx;

create unique index if not exists tournaments_provider_tournament_tour_uidx
  on public.tournaments (provider_tournament_id, tour)
  where provider_tournament_id is not null;

-- ---------------------------------------------------------------------------
-- Montreal (ATP) — existing uso-2026 row
-- ---------------------------------------------------------------------------

update public.tournaments
   set tour = 'atp',
       name = 'National Bank Open Montreal 2026',
       provider_tournament_id = coalesce(provider_tournament_id, '21346'),
       surface = 'hard',
       starts_on = coalesce(starts_on, '2026-08-03'),
       lock_at = coalesce(lock_at, '2026-08-02 15:00:00+00'),
       draw_size = greatest(draw_size, 64),
       venue_tz = coalesce(nullif(venue_tz, ''), 'America/Toronto')
 where ref = 'uso-2026';

-- ---------------------------------------------------------------------------
-- Toronto (WTA) — concurrent National Bank Open week
-- ---------------------------------------------------------------------------

insert into public.tournaments (
  ref,
  name,
  tour,
  surface,
  starts_on,
  lock_at,
  draw_size,
  venue_tz,
  provider_tournament_id
)
values (
  'nbo-tor-2026',
  'National Bank Open Toronto 2026',
  'wta',
  'hard',
  '2026-08-03',
  '2026-08-02 15:00:00+00',
  64,
  'America/Toronto',
  '16739'
)
on conflict (ref) do update set
  name = excluded.name,
  tour = excluded.tour,
  surface = excluded.surface,
  starts_on = excluded.starts_on,
  lock_at = excluded.lock_at,
  draw_size = excluded.draw_size,
  venue_tz = excluded.venue_tz,
  provider_tournament_id = excluded.provider_tournament_id;

insert into public.draws (tournament_id)
select t.id
  from public.tournaments t
 where t.ref = 'nbo-tor-2026'
on conflict (tournament_id) do nothing;

-- Placeholder 64-draw so the event is entry-eligible until a live import replaces seats.
insert into public.draw_seats (
  draw_id,
  position,
  player_ref,
  last_name,
  seed,
  country_code,
  is_bye
)
select
  d.id,
  g.pos,
  'wta-' || g.pos::text,
  'Player ' || (g.pos + 1)::text,
  case when g.pos < 16 then g.pos + 1 else null end,
  'XXX',
  false
from public.draws d
join public.tournaments t on t.id = d.tournament_id
cross join generate_series(0, 63) as g(pos)
where t.ref = 'nbo-tor-2026'
  and not exists (
    select 1 from public.draw_seats ds where ds.draw_id = d.id
  );
