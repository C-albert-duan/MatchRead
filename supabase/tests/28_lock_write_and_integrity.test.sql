-- 28_lock_write_and_integrity.test.sql
-- Sprint Directive 2.1 Phase 6.

begin;

select plan(3);

select has_function(
  'public',
  'picks_are_locked',
  array['uuid', 'uuid'],
  'picks_are_locked exists (post-lock write gate)'
);

select has_function(
  'public',
  'assert_publish_requires_integrity',
  array[],
  'publish integrity trigger function exists'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'tournaments_publish_requires_integrity'
  ),
  'publish integrity trigger armed'
);

select * from finish();
rollback;
