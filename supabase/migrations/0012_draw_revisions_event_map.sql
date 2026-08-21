-- 0012_draw_revisions_event_map.sql
-- Draw revision history, entry tags Q/LL, event↔socket mapping.

alter table public.tournaments
  add column if not exists draw_hash text,
  add column if not exists draw_checked_at timestamptz;

comment on column public.tournaments.draw_hash is
  'SHA-256 of last accepted official draw payload; skip re-import when unchanged.';
comment on column public.tournaments.draw_checked_at is
  'Last successful /draws poll (even when hash unchanged).';

-- Expand entry tags: Q / LL alongside WC / PR.
alter table public.seats drop constraint if exists seats_entry_check;
alter table public.seats
  add constraint seats_entry_check
  check (entry is null or entry in ('wc', 'pr', 'q', 'll'));

create table if not exists public.draw_revisions (
  id bigserial primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  hash text not null,
  payload jsonb not null,
  detected_at timestamptz not null default now(),
  unique (tournament_id, hash)
);

create index if not exists draw_revisions_tournament_detected_idx
  on public.draw_revisions (tournament_id, detected_at desc);

comment on table public.draw_revisions is
  'Immutable official draw snapshots for replacement diffs and audit.';

create table if not exists public.draw_replacements (
  id bigserial primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  position int not null,
  old_provider_player_id text,
  new_provider_player_id text,
  old_kind text,
  new_kind text,
  change_kind text not null
    check (change_kind in ('same', 'tbd_filled', 'replacement', 'bye_to_player', 'player_to_bye', 'other')),
  detected_at timestamptz not null default now(),
  revision_hash text
);

create index if not exists draw_replacements_tournament_idx
  on public.draw_replacements (tournament_id, detected_at desc);

comment on table public.draw_replacements is
  'Slot-level draw diffs (lucky loser / withdrawal) detected on refresh.';

create table if not exists public.event_map (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  match_id uuid references public.matches (id) on delete cascade,
  pair_key text not null,
  socket_event_id text,
  status text not null
    check (status in ('mapped', 'not_found', 'ambiguous', 'stale')),
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  method text,
  mapped_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (tournament_id, pair_key)
);

create index if not exists event_map_match_id_idx on public.event_map (match_id)
  where match_id is not null;
create index if not exists event_map_expires_idx on public.event_map (expires_at)
  where expires_at is not null;

comment on table public.event_map is
  'Core fixture / player-pair → Extend Socket.IO event id. Never use fixture id as socket id.';

alter table public.draw_revisions enable row level security;
alter table public.draw_replacements enable row level security;
alter table public.event_map enable row level security;

-- Service role writes; authenticated may read replacements for founder/ops.
create policy draw_revisions_select_auth on public.draw_revisions
  for select to authenticated using (true);
create policy draw_replacements_select_auth on public.draw_replacements
  for select to authenticated using (true);
create policy event_map_select_auth on public.event_map
  for select to authenticated using (true);

grant select on table public.draw_revisions to authenticated;
grant select on table public.draw_replacements to authenticated;
grant select on table public.event_map to authenticated;

revoke all on table public.draw_revisions from anon;
revoke all on table public.draw_replacements from anon;
revoke all on table public.event_map from anon;
