-- An unknown live payload is archived without a match id.
-- Run: npx supabase test db

begin;

select plan(5);

select ok(
  not exists (
    select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'unmapped_live_events'
       and a.attname = 'match_id'
       and a.attnum > 0
       and not a.attisdropped
  ),
  'the archive has no match_id'
);

select ok(
  has_table_privilege('anon', 'public.unmapped_live_events', 'select') is false,
  'anon cannot read archived payloads'
);
select ok(
  has_table_privilege('anon', 'public.unmapped_live_events', 'insert') is false,
  'anon cannot write archived payloads'
);
select ok(
  has_table_privilege('authenticated', 'public.unmapped_live_events', 'select'),
  'a signed-in operator can read the archive'
);
select ok(
  has_table_privilege('service_role', 'public.unmapped_live_events', 'insert'),
  'service_role can archive a payload'
);

select * from finish();
rollback;
