-- 0016_eligibility_and_public_calendar.sql
-- Sprint Directive 2.1 §4–§5: subtraction-only override + public_calendar view.

-- Clear promotional overrides; demote unknown tiers instead of force_on.
update public.tournaments
set product_override = null
where product_override = 'force_on';

alter table public.tournaments drop constraint if exists tournaments_product_override_check;
alter table public.tournaments
  add constraint tournaments_product_override_check
  check (
    product_override is null
    or product_override = 'force_off'
  );

comment on column public.tournaments.product_override is
  'force_off only. Null = policy. Cannot promote an ineligible tier.';

create or replace function public.is_bracket_product(
  p_tour text,
  p_tier text,
  p_override text default null
) returns boolean
language sql
immutable
as $$
  select case
    when p_override = 'force_off' then false
    when p_tour not in ('atp', 'wta') then false
    else coalesce(p_tier, 'other') in (
      'grand_slam',
      'tour_finals',
      'masters_1000',
      'tour_500',
      'tour_250'
    )
  end
$$;

comment on function public.is_bracket_product(text, text, text) is
  'Public bracket product: ATP/WTA 250+. No force_on. Mirrored by packages/core PUBLIC_TIERS.';

-- Shared public read surface (eligible only).
create or replace view public.public_calendar
with (security_invoker = true)
as
select
  t.id,
  t.slug,
  t.name,
  t.surface,
  t.starts_on,
  t.main_draw_starts_on,
  t.ends_on,
  t.lock_at,
  t.venue_tz,
  t.tour,
  t.draw_size,
  t.published_at,
  t.tier,
  t.featured,
  t.bracket_eligible,
  t.environment
from public.tournaments t
where t.bracket_eligible = true
  and t.slug not like 'e2e-%';

comment on view public.public_calendar is
  'Eligible tournaments only. Every public consumer surface reads this — not tournaments directly.';

grant select on public.public_calendar to anon, authenticated;

-- Demotion must not cascade-delete brackets (assert via comment + no FK cascade on tournament).
comment on table public.brackets is
  'Member picks. Survives tournament demotion (bracket_eligible false); discovery stops, settlement continues.';
