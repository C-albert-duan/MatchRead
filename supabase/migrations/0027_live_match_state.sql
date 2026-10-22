-- 0027_live_match_state.sql
-- Live projection. Separate from official settlement.
-- A socket final is provisional. It does not write matches.winner_player_id.

create table if not exists public.live_match_state (
  match_id uuid primary key references public.matches (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  public_ref text not null unique,
  phase text not null
    check (phase in ('in_play', 'suspended', 'provisional_final')),
  score_text text,
  points_text text,
  serving_side text
    check (serving_side is null or serving_side in ('a', 'b')),
  provisional_winner_ref text,
  sequence bigint not null,
  sequence_source text not null
    check (sequence_source in ('seq', 'updatedAt', 'receivedAt')),
  frame_key text not null,
  source text not null
    check (source in ('rest', 'socket', 'replay')),
  observed_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists live_match_state_tournament_idx
  on public.live_match_state (tournament_id);

comment on table public.live_match_state is
  'Current live projection for one match. Not an official result. Cleared after an official settle.';

comment on column public.live_match_state.provisional_winner_ref is
  'Player ref from a terminal live frame. Not matches.winner_player_id.';

create table if not exists public.listener_health (
  id text primary key,
  transport text not null,
  connection text not null,
  last_frame_at timestamptz,
  last_error text,
  frames_applied bigint not null default 0,
  frames_duplicate bigint not null default 0,
  frames_ignored bigint not null default 0,
  frames_unmapped bigint not null default 0,
  frames_ambiguous bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.listener_health is
  'Operator heartbeat for the live replay or listener. Not a settlement signal.';

alter table public.live_match_state enable row level security;
alter table public.listener_health enable row level security;

create policy live_match_state_select on public.live_match_state
  for select to anon, authenticated
  using (true);

create policy listener_health_select on public.listener_health
  for select to authenticated
  using (true);

grant select on table public.live_match_state to anon, authenticated;
grant select on table public.listener_health to authenticated;

revoke insert, update, delete on table public.live_match_state from anon, authenticated;
revoke all on table public.listener_health from anon;

alter table public.live_match_state replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'live_match_state'
    ) then
      alter publication supabase_realtime add table public.live_match_state;
    end if;
  end if;
end $$;
