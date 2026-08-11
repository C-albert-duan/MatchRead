-- 0017_match_schedule.sql
-- Per-match start from the provider fixture/result. Date-only rows have
-- has_time = false so the UI never invents a midnight kickoff.
-- Idempotent.

create table if not exists public.match_schedule (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  match_key text not null,
  scheduled_at timestamptz not null,
  has_time boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tournament_id, match_key)
);

create index if not exists match_schedule_tournament_idx
  on public.match_schedule (tournament_id);

comment on table public.match_schedule is
  'Provider fixture/result start for a MatchRead match_key. has_time is false when only a date is known.';

grant select on public.match_schedule to anon, authenticated;
grant select, insert, update, delete on public.match_schedule to authenticated;

alter table public.match_schedule enable row level security;

drop policy if exists match_schedule_select on public.match_schedule;
create policy match_schedule_select on public.match_schedule
  for select to anon, authenticated using (true);
