-- 0005_daily_check.sql
-- Phase 5: optional cache/log for computed Daily Check pulses.
-- Idempotent: safe to re-run in SQL Editor.

create table if not exists public.daily_check_log (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  tournament_id uuid references public.tournaments (id) on delete set null,
  kind text not null,
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create index if not exists daily_check_log_league_idx
  on public.daily_check_log (league_id);

grant select, insert, update on public.daily_check_log to authenticated;

alter table public.daily_check_log enable row level security;

drop policy if exists daily_check_select_own on public.daily_check_log;
create policy daily_check_select_own on public.daily_check_log
  for select using (
    user_id = auth.uid()
    and public.is_league_member(league_id)
  );

drop policy if exists daily_check_upsert_own on public.daily_check_log;
create policy daily_check_upsert_own on public.daily_check_log
  for all using (
    user_id = auth.uid()
    and public.is_league_member(league_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_league_member(league_id)
  );
