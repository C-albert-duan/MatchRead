-- Raw provider events land in platform_events. A repeat is one row.
-- Run: npx supabase test db

begin;

select plan(6);

select ok(
  to_regclass('public.platform_events') is not null,
  'raw provider events are stored in platform_events'
);

select ok(
  to_regclass('public.live_events') is null,
  'there is no second live_events log'
);

insert into public.platform_events (content_hash, provider_event_id, payload)
values (
  'hash-a',
  'evt-1',
  '{"matchId":"1-2-900-1","score":"1-0","updatedAt":1000}'::jsonb
);

insert into public.platform_events (content_hash, provider_event_id, payload)
values (
  'hash-a',
  'evt-1',
  '{"matchId":"1-2-900-1","score":"1-0","updatedAt":1000}'::jsonb
)
on conflict (content_hash) do nothing;

select is(
  (select count(*)::int from public.platform_events where content_hash = 'hash-a'),
  1,
  'a repeated raw payload stays one row'
);

select ok(
  has_table_privilege('anon', 'public.platform_events', 'insert') is false,
  'anon cannot write the event log'
);
select ok(
  has_table_privilege('authenticated', 'public.platform_events', 'select'),
  'a signed-in operator can read the event log'
);
select ok(
  has_table_privilege('service_role', 'public.platform_events', 'insert'),
  'service_role can append a raw event'
);

select * from finish();
rollback;
