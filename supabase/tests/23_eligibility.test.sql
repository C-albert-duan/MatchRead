-- 23_eligibility.test.sql
-- Sprint Directive 2.1 §4 acceptance.

begin;

select plan(6);

select ok(
  public.is_bracket_product('atp', 'tour_250', null),
  'ATP 250 is eligible'
);

select ok(
  not public.is_bracket_product('atp', 'challenger', null),
  'Challenger is ineligible'
);

select ok(
  not public.is_bracket_product('atp', 'itf', 'force_off'),
  'force_off demotes'
);

select ok(
  not public.is_bracket_product('atp', 'itf', 'force_on'),
  'force_on no longer promotes (unknown override treated as null path fails tier)'
);

-- product_override check rejects force_on
select throws_ok(
  $$insert into public.tournaments (
      slug, name, tour, surface, starts_on, ends_on, tier, product_override
    ) values (
      'test-force-on-reject', 'Force On Reject', 'atp', 'Hard',
      current_date, current_date + 7, 'challenger', 'force_on'
    )$$,
  '23514',
  null,
  'force_on rejected by check constraint'
);

select ok(
  exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'public_calendar'
  ),
  'public_calendar view exists'
);

select * from finish();
rollback;
