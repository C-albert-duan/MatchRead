-- live_match_state is on the shared Postgres Changes publication.
-- Run: npx supabase test db

begin;

select plan(4);

select ok(
  exists (
    select 1
      from pg_publication
     where pubname = 'supabase_realtime'
       and pubinsert
       and pubupdate
       and pubdelete
  ),
  'supabase_realtime publishes insert, update, and delete'
);

select is(
  (
    select count(*)::int
      from pg_publication_tables
     where schemaname = 'public'
       and tablename = 'live_match_state'
  ),
  1,
  'the live table is in one publication'
);

select is(
  (
    select pubname
      from pg_publication_tables
     where schemaname = 'public'
       and tablename = 'live_match_state'
  ),
  'supabase_realtime',
  'that publication is supabase_realtime'
);

select is(
  (
    select c.relreplident::text
      from pg_class c
     where c.oid = 'public.live_match_state'::regclass
  ),
  'f',
  'replica identity is full'
);

select * from finish();
rollback;
