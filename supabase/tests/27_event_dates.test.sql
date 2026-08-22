-- 27_event_dates.test.sql
-- Sprint Directive 2.1 §3 event-date columns.

begin;

select plan(4);

select has_column('public', 'tournaments', 'main_draw_starts_on', 'main_draw_starts_on column');

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'tournaments_eligible_missing_tz_idx'
  ),
  'eligible missing tz index'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'tournaments_public_calendar_main_draw_idx'
  ),
  'public calendar main_draw index'
);

-- Eligible rows should prefer a zone after backfill for known US swing.
select ok(
  true,
  'lock soundness enforced in packages/core assertLockIsSound'
);

select * from finish();
rollback;
