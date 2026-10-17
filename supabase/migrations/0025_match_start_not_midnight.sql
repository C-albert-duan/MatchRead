-- There is no starts_at column. The start is scheduled_at plus has_time.
-- UTC midnight is a date stamp, not a kickoff. A published clock stays.
-- Noon with has_time false remains the date-only storage form.

update public.matches
   set has_time = false
 where has_time
   and scheduled_at is not null
   and extract(hour from scheduled_at at time zone 'UTC') = 0
   and extract(minute from scheduled_at at time zone 'UTC') = 0
   and extract(second from scheduled_at at time zone 'UTC') = 0;

alter table public.matches
  drop constraint if exists matches_has_time_not_midnight_check;

alter table public.matches
  add constraint matches_has_time_not_midnight_check
  check (
    not has_time
    or scheduled_at is null
    or extract(hour from scheduled_at at time zone 'UTC') <> 0
    or extract(minute from scheduled_at at time zone 'UTC') <> 0
    or extract(second from scheduled_at at time zone 'UTC') <> 0
  );

comment on column public.matches.has_time is
  'True only when the provider published a clock. False for a civil date, including a UTC midnight stamp. Do not invent a time from noon or from session.';
