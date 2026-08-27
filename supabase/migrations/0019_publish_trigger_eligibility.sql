-- 0019_publish_trigger_eligibility.sql
-- NEW.bracket_eligible can be null in BEFORE UPDATE OF published_at even when the
-- stored generated column reads true. Evaluate eligibility from base columns.

create or replace function public.assert_publish_requires_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.draw_integrity_reports%rowtype;
  v_eligible boolean;
begin
  if new.published_at is null then
    return new;
  end if;
  if old.published_at is not null and new.published_at is not distinct from old.published_at then
    return new;
  end if;

  v_eligible := public.is_bracket_product(new.tour, new.tier, new.product_override);
  if not coalesce(v_eligible, false) then
    raise exception 'cannot publish ineligible tournament';
  end if;

  select * into report
    from public.draw_integrity_reports
   where tournament_id = new.id;
  if not found or not report.safe_to_publish then
    raise exception 'integrity gate blocked publish';
  end if;
  return new;
end;
$$;

comment on function public.assert_publish_requires_integrity() is
  'Draw stays draw pending unless eligible (is_bracket_product) and integrity is green.';
