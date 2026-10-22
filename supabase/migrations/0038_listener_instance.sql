-- Last listener process that posted raw frames.
-- Two different ids inside the overlap window become ops_events listener_overlap.
-- instance_id is not a lock and does not choose a leader.

alter table public.listener_health
  add column if not exists instance_id text;

comment on column public.listener_health.instance_id is
  'Last listener process id. Not a leader lock. Two recent ids are listener_overlap.';
