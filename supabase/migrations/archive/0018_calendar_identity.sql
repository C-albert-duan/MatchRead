-- 0018_calendar_identity.sql
-- Gate 1: colliding-slug event must not occupy the slam event slug. Upcoming events must exist
-- as rows so /tournaments can list them before any draw is published.
-- Idempotent.
--
-- Root cause (1.1 / 1.2): migration 0011 reused ref uso-2026 for colliding-slug event
-- ("stable URLs"). The calendar already reads row.ref; the URL was wrong
-- because the stored ref was wrong. Masters event, 64-draw event, and both
-- slam events were never inserted.

-- ---------------------------------------------------------------------------
-- Lock authority: a trigger so a direct write cannot bypass RLS
-- ---------------------------------------------------------------------------

create or replace function public.brackets_reject_if_locked()
returns trigger
language plpgsql
as $$
begin
  if public.tournament_is_locked(new.tournament_id) then
    raise exception 'tournament locked';
  end if;
  return new;
end;
$$;

drop trigger if exists brackets_reject_if_locked on public.brackets;

create trigger brackets_reject_if_locked
  before insert or update of picks, confidence, submitted_at
  on public.brackets
  for each row
  execute function public.brackets_reject_if_locked();

comment on function public.brackets_reject_if_locked() is
  'Database is the lock authority. RLS is not enough: a direct write must also fail.';

-- ---------------------------------------------------------------------------
-- colliding-slug event keeps its draw (UUID) and takes its own ref
-- ---------------------------------------------------------------------------

update public.tournaments
   set ref = 'nbo-mtl-2026'
 where ref = 'uso-2026'
   and name ilike '%colliding-slug event%'
   and not exists (
     select 1 from public.tournaments x where x.ref = 'nbo-mtl-2026'
   );

-- ---------------------------------------------------------------------------
-- Calendar rows. Pre-draw events are allowed: no draws/seats here.
-- ---------------------------------------------------------------------------

insert into public.tournaments (
  ref, name, tour, surface, starts_on, lock_at, draw_size, venue_tz,
  provider_tournament_id
)
values
  (
    'nbo-mtl-2026',
    'dual-city event colliding-slug event 2026',
    'atp',
    'hard',
    '2026-08-03',
    '2026-08-02 15:00:00+00',
    64,
    'America/dual-city event',
    '21346'
  ),
  (
    'nbo-tor-2026',
    'dual-city event dual-city event 2026',
    'wta',
    'hard',
    '2026-08-03',
    '2026-08-02 15:00:00+00',
    64,
    'America/dual-city event',
    '16739'
  ),
  (
    'cin-2026',
    'Masters event Open 2026',
    'atp',
    'hard',
    '2026-08-13',
    '2026-08-12 15:00:00+00',
    64,
    'America/New_York',
    null
  ),
  (
    'cin-wta-2026',
    'Masters event Open 2026',
    'wta',
    'hard',
    '2026-08-13',
    '2026-08-12 15:00:00+00',
    64,
    'America/New_York',
    null
  ),
  (
    'wsal-2026',
    '64-draw event Open 2026',
    'atp',
    'hard',
    '2026-08-23',
    '2026-08-22 15:00:00+00',
    64,
    'America/New_York',
    null
  ),
  (
    'uso-wta-2026',
    'slam event 2026',
    'wta',
    'hard',
    '2026-08-30',
    '2026-08-29 15:00:00+00',
    128,
    'America/New_York',
    null
  )
on conflict (ref) do update set
  name = excluded.name,
  tour = excluded.tour,
  surface = excluded.surface,
  starts_on = excluded.starts_on,
  lock_at = excluded.lock_at,
  draw_size = excluded.draw_size,
  venue_tz = excluded.venue_tz,
  provider_tournament_id = coalesce(
    public.tournaments.provider_tournament_id,
    excluded.provider_tournament_id
  );

-- uso-2026 is slam event again. Never overwrite a row that is still colliding-slug event.
insert into public.tournaments (
  ref, name, tour, surface, starts_on, lock_at, draw_size, venue_tz
)
select
  'uso-2026',
  'slam event 2026',
  'atp',
  'hard',
  '2026-08-30',
  '2026-08-29 15:00:00+00',
  128,
  'America/New_York'
where not exists (
  select 1
    from public.tournaments t
   where t.ref = 'uso-2026'
     and t.name ilike '%colliding-slug event%'
)
on conflict (ref) do update set
  name = excluded.name,
  tour = excluded.tour,
  surface = excluded.surface,
  starts_on = excluded.starts_on,
  lock_at = excluded.lock_at,
  draw_size = excluded.draw_size,
  venue_tz = excluded.venue_tz
  where public.tournaments.name not ilike '%colliding-slug event%';

-- ---------------------------------------------------------------------------
-- Prove lock: a direct insert against a started tournament must error.
-- Trigger fires before FK, so dummy uuids are enough.
-- ---------------------------------------------------------------------------

do $$
declare
  v_tid uuid;
begin
  select t.id into v_tid
    from public.tournaments t
   where public.tournament_is_locked(t.id)
   order by t.starts_on
   limit 1;

  if v_tid is null then
    raise exception 'lock proof skipped: no locked tournament';
  end if;

  begin
    insert into public.brackets (league_id, tournament_id, user_id, picks)
    values (gen_random_uuid(), v_tid, gen_random_uuid(), '{}'::jsonb);
    raise exception 'lock proof failed: insert succeeded on locked tournament %', v_tid;
  exception
    when others then
      if sqlerrm not like '%tournament locked%' then
        raise;
      end if;
      raise notice 'lock proof ok: %', sqlerrm;
  end;
end $$;
