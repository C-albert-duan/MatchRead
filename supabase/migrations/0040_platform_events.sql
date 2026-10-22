-- Raw provider event log. One row per distinct payload.
-- live_match_state stays the current score. There is no live_events table.
-- content_hash ignores receipt time. A repeat does not insert another row.
-- The payload has no token, provider key, or ingest secret.

create table public.platform_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  content_hash text not null unique,
  provider_event_id text,
  payload jsonb not null
);

create index platform_events_provider_event_idx
  on public.platform_events (provider_event_id, created_at desc);

comment on table public.platform_events is
  'Raw provider event log for replay. One row per content hash. Not a live score and not a settlement.';

comment on column public.platform_events.content_hash is
  'SHA-256 of the raw row with receipt time and secret fields removed.';

comment on column public.platform_events.payload is
  'Provider row kept for replay. Receipt time and token or secret fields are removed.';

alter table public.platform_events enable row level security;

create policy platform_events_select_auth
  on public.platform_events
  for select
  to authenticated
  using (true);

revoke all on table public.platform_events from public, anon, authenticated;
grant select on table public.platform_events to authenticated;
grant select, insert, update on table public.platform_events to service_role;
