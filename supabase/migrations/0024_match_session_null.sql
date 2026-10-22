-- Missing session is null. day and night are the only stored labels.
-- matches has no slate_date. Start time is scheduled_at.
-- Indexes already cover (tournament_id, round) and
-- (tournament_id, provider_match_id). No session index is added.

update public.matches
   set session = null
 where session = 'unknown';

alter table public.matches
  alter column session drop not null;

alter table public.matches
  alter column session drop default;

alter table public.matches
  drop constraint if exists matches_session_check;

alter table public.matches
  add constraint matches_session_check
  check (session is null or session in ('day', 'night'));

comment on column public.matches.session is
  'day or night when published. Null when the session is not known. Do not infer it from scheduled_at.';
