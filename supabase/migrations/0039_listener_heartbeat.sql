-- Latest listener tick on listener_health id "listener".
-- Replay counters stay on id "sync-facts".
-- These columns are the latest tick, not lifetime totals.
-- The provider token, provider key, and ingest secret are not stored.

alter table public.listener_health
  add column if not exists events_received bigint,
  add column if not exists mapped_count bigint,
  add column if not exists unmapped_count bigint,
  add column if not exists lag_ms bigint,
  add column if not exists token_age_s bigint,
  add column if not exists last_heartbeat_at timestamptz;

comment on column public.listener_health.events_received is
  'Events in the latest listener tick. Not a lifetime total.';

comment on column public.listener_health.mapped_count is
  'Latest tick frames whose tournament id ingest has already accepted.';

comment on column public.listener_health.unmapped_count is
  'Latest tick frames outside those tournaments. A high count is not itself a failure.';

comment on column public.listener_health.lag_ms is
  'Age of the newest numeric provider updatedAt on the latest tick.';

comment on column public.listener_health.token_age_s is
  'Seconds since the provider token iat claim. The token is not stored.';

comment on column public.listener_health.last_heartbeat_at is
  'When this listener heartbeat was stored. About every 30 seconds.';
