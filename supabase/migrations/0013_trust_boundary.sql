-- 0013_trust_boundary.sql
-- Eligibility, composite tour+provider identity, player display_name, repair audit.
-- Ops capture table (was archive-only; founder dashboard reads it).

-- ---------------------------------------------------------------------------
-- ops_events (founder / telemetry)
-- ---------------------------------------------------------------------------
create table if not exists public.ops_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null,
  name text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists ops_events_created_at_idx
  on public.ops_events (created_at desc);

comment on table public.ops_events is
  'Ops / integrity alerts. Service role writes; authenticated founders read.';

alter table public.ops_events enable row level security;

drop policy if exists ops_events_select_auth on public.ops_events;
create policy ops_events_select_auth on public.ops_events
  for select to authenticated using (true);

drop policy if exists ops_events_insert on public.ops_events;
create policy ops_events_insert on public.ops_events
  for insert to anon, authenticated with check (true);

grant select on table public.ops_events to authenticated;
grant insert on table public.ops_events to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tournament tier + product scope
-- ---------------------------------------------------------------------------
alter table public.tournaments
  add column if not exists tier text,
  add column if not exists product_override text,
  add column if not exists ingestion_enabled boolean not null default true,
  add column if not exists featured boolean not null default false,
  add column if not exists environment text;

-- Closed tier set (level, not tour).
alter table public.tournaments drop constraint if exists tournaments_tier_check;
alter table public.tournaments
  add constraint tournaments_tier_check
  check (
    tier is null
    or tier in (
      'grand_slam',
      'tour_finals',
      'masters_1000',
      'tour_500',
      'tour_250',
      'challenger',
      'wta_125',
      'itf',
      'other'
    )
  );

alter table public.tournaments drop constraint if exists tournaments_product_override_check;
alter table public.tournaments
  add constraint tournaments_product_override_check
  check (
    product_override is null
    or product_override in ('force_on', 'force_off')
  );

alter table public.tournaments drop constraint if exists tournaments_environment_check;
alter table public.tournaments
  add constraint tournaments_environment_check
  check (
    environment is null
    or environment in ('outdoor', 'indoor')
  );

comment on column public.tournaments.tier is
  'Level, not tour. masters_1000 covers ATP Masters and WTA 1000; disambiguate with tour.';
comment on column public.tournaments.product_override is
  'force_on / force_off kill switch; null = policy decides. Incident: set force_off.';
comment on column public.tournaments.ingestion_enabled is
  'Internal coverage. Independent of bracket_eligible.';
comment on column public.tournaments.featured is
  'Homepage emphasis among eligible events.';
comment on column public.tournaments.environment is
  'outdoor | indoor. Separate from surface.';

create or replace function public.is_bracket_product(
  p_tour text,
  p_tier text,
  p_override text default null
) returns boolean
language sql
immutable
as $$
  select case
    when p_override = 'force_on' then true
    when p_override = 'force_off' then false
    when p_tour not in ('atp', 'wta') then false
    else coalesce(p_tier, 'other') in (
      'grand_slam',
      'tour_finals',
      'masters_1000',
      'tour_500',
      'tour_250'
    )
  end
$$;

comment on function public.is_bracket_product(text, text, text) is
  'Public bracket product: ATP/WTA 250+. Mirrored by packages/core PUBLIC_TIERS.';

-- Generated column cannot reference another generated column; use function.
alter table public.tournaments drop column if exists bracket_eligible;
alter table public.tournaments
  add column bracket_eligible boolean
  generated always as (
    public.is_bracket_product(tour, tier, product_override)
  ) stored;

create index if not exists tournaments_public_calendar_idx
  on public.tournaments (starts_on)
  where bracket_eligible;

comment on column public.tournaments.bracket_eligible is
  'Stored from is_bracket_product. Public calendar + new brackets.';

-- Keep already-published events discoverable until calendar sync sets tier.
-- Remove force_on on next sync once tier is known (optional ops cleanup).
update public.tournaments
set product_override = 'force_on'
where published_at is not null
  and product_override is null
  and (tier is null or tier = 'other');

-- ---------------------------------------------------------------------------
-- Identity: unique (tour, provider_id) instead of global provider_id
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from public.tournaments
    where provider_id is not null
    group by tour, provider_id
    having count(*) > 1
  ) then
    raise exception
      'duplicate (tour, provider_id) rows — resolve before unique index';
  end if;
end $$;

alter table public.tournaments drop constraint if exists tournaments_provider_id_key;
drop index if exists tournaments_provider_id_key;

create unique index if not exists tournaments_tour_provider_id_uidx
  on public.tournaments (tour, provider_id)
  where provider_id is not null;

-- ---------------------------------------------------------------------------
-- Players: canonical display_name
-- ---------------------------------------------------------------------------
alter table public.players
  add column if not exists display_name text;

comment on column public.players.display_name is
  'Provider canonical user-facing name. last_name stays auxiliary.';

update public.players
set display_name = last_name
where display_name is null and last_name is not null;

-- ---------------------------------------------------------------------------
-- Repair audit (reconcile / sync-facts)
-- ---------------------------------------------------------------------------
create table if not exists public.sync_repair_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'reconcile'
    check (kind in ('reconcile', 'draw', 'verify')),
  tournament_id uuid references public.tournaments (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'error')),
  summary jsonb not null default '{}'::jsonb
);

create table if not exists public.sync_repairs (
  id bigserial primary key,
  run_id uuid not null references public.sync_repair_runs (id) on delete cascade,
  tournament_id uuid references public.tournaments (id) on delete set null,
  match_key text,
  provider_match_id text,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists sync_repair_runs_started_idx
  on public.sync_repair_runs (started_at desc);
create index if not exists sync_repairs_run_idx
  on public.sync_repairs (run_id);
create index if not exists sync_repairs_tournament_idx
  on public.sync_repairs (tournament_id, created_at desc);

comment on table public.sync_repair_runs is
  'One sync/reconcile pass. Answers why a bracket changed.';
comment on table public.sync_repairs is
  'Per-fixture repair rows inside a run.';

alter table public.sync_repair_runs enable row level security;
alter table public.sync_repairs enable row level security;

drop policy if exists sync_repair_runs_select_auth on public.sync_repair_runs;
create policy sync_repair_runs_select_auth on public.sync_repair_runs
  for select to authenticated using (true);

drop policy if exists sync_repairs_select_auth on public.sync_repairs;
create policy sync_repairs_select_auth on public.sync_repairs
  for select to authenticated using (true);

grant select on table public.sync_repair_runs to authenticated;
grant select on table public.sync_repairs to authenticated;
revoke all on table public.sync_repair_runs from anon;
revoke all on table public.sync_repairs from anon;

-- ---------------------------------------------------------------------------
-- Draw integrity reports (last gate result per tournament)
-- ---------------------------------------------------------------------------
create table if not exists public.draw_integrity_reports (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  checked_at timestamptz not null default now(),
  safe_to_publish boolean not null,
  blocking jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  source_snapshot_id text
);

comment on table public.draw_integrity_reports is
  'Last evaluateDrawIntegrity result. Publish only when safe_to_publish.';

alter table public.draw_integrity_reports enable row level security;

drop policy if exists draw_integrity_reports_select_auth on public.draw_integrity_reports;
create policy draw_integrity_reports_select_auth on public.draw_integrity_reports
  for select to authenticated using (true);

grant select on table public.draw_integrity_reports to authenticated;
revoke all on table public.draw_integrity_reports from anon;

-- ---------------------------------------------------------------------------
-- New brackets only on eligible tournaments (existing rows keep settling)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_bracket_eligible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.brackets b
    where b.league_id = new.league_id
      and b.tournament_id = new.tournament_id
      and b.user_id = new.user_id
  ) then
    return new;
  end if;

  if not coalesce(
    (select t.bracket_eligible from public.tournaments t where t.id = new.tournament_id),
    false
  ) then
    raise exception 'tournament not bracket eligible';
  end if;

  return new;
end;
$$;

drop trigger if exists brackets_require_eligible on public.brackets;
create trigger brackets_require_eligible
  before insert on public.brackets
  for each row
  execute function public.enforce_bracket_eligible();

-- Also guard save_picks path: first insert hits the trigger above.
-- league_tournaments may still reference ineligible events for historical leagues.
