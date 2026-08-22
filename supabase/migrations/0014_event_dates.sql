-- 0014_event_dates.sql
-- Sprint Directive 2.1 §3: name the main-draw date; keep starts_on as provider week.
-- lock_at stays first timed R0 ball (refresh_lock_at). venue_tz required for eligible.

alter table public.tournaments
  add column if not exists main_draw_starts_on date;

comment on column public.tournaments.starts_on is
  'Provider / calendar week anchor. Ambiguous — do not treat as main-draw first day.';
comment on column public.tournaments.main_draw_starts_on is
  'Official main-draw first day. Product calendar + Upcoming sort.';
comment on column public.tournaments.venue_tz is
  'IANA zone for displayed times and lock validation. Required when bracket_eligible.';

-- Backfill: prefer existing starts_on until probe corrects specific events.
update public.tournaments
set main_draw_starts_on = starts_on
where main_draw_starts_on is null
  and starts_on is not null;

-- Known corrections (directive §3.1 / §3.5) — US Open main draw Sun 30 Aug 2026;
-- Winston-Salem expected Sun 23 Aug 2026 (verify against provider when available).
update public.tournaments
set main_draw_starts_on = date '2026-08-30'
where bracket_eligible
  and (
    slug ilike '%us-open%'
    or slug ilike '%uso%'
    or name ilike '%u.s. open%'
    or name ilike '%us open%'
  )
  and name not ilike '%junior%';

update public.tournaments
set main_draw_starts_on = date '2026-08-23'
where bracket_eligible
  and (
    slug ilike '%winston%'
    or name ilike '%winston%'
  );

-- Cincinnati main draw ~13 Aug 2026 (R128), not the week banner date.
update public.tournaments
set main_draw_starts_on = date '2026-08-13'
where bracket_eligible
  and (
    slug ilike '%cincinnati%'
    or name ilike '%cincinnati%'
  );

alter table public.tournaments drop constraint if exists tournaments_main_draw_starts_on_order;
alter table public.tournaments
  add constraint tournaments_main_draw_starts_on_order
  check (
    main_draw_starts_on is null
    or ends_on is null
    or main_draw_starts_on <= ends_on
  );

-- Eligible events must carry a zone (partial unique-style guard via index + assert in app).
create index if not exists tournaments_eligible_missing_tz_idx
  on public.tournaments (id)
  where bracket_eligible and (venue_tz is null or btrim(venue_tz) = '');

create index if not exists tournaments_public_calendar_main_draw_idx
  on public.tournaments (main_draw_starts_on)
  where bracket_eligible;

-- Stamp common zones where missing for known US hard-court swing.
update public.tournaments
set venue_tz = 'America/New_York'
where bracket_eligible
  and (venue_tz is null or btrim(venue_tz) = '')
  and (
    name ilike '%u.s. open%'
    or name ilike '%us open%'
    or name ilike '%winston%'
    or slug ilike '%us-open%'
    or slug ilike '%winston%'
  );

update public.tournaments
set venue_tz = 'America/New_York'
where bracket_eligible
  and (venue_tz is null or btrim(venue_tz) = '')
  and (name ilike '%cincinnati%' or slug ilike '%cincinnati%');
