-- 0020_clear_misclassified_uso_wta_draw.sql
-- WTA US Open (t-wta-16743) stored a qualifying 128 sheet as seats while
-- published_at stayed null (or the sheet was wrongly published). Clear it so
-- rediscovery can accept the main-singles draw. Fail closed on fiction;
-- fail open only for a validated main sheet.

do $$
declare
  tid uuid;
begin
  select id into tid
  from public.tournaments
  where slug = 't-wta-16743'
  limit 1;

  if tid is null then
    raise notice 't-wta-16743 not found — nothing to clear';
    return;
  end if;

  -- Picks reference matches; brackets cascade picks.
  delete from public.brackets where tournament_id = tid;
  delete from public.event_map where tournament_id = tid;
  delete from public.draw_replacements where tournament_id = tid;
  delete from public.matches where tournament_id = tid;
  delete from public.seats where tournament_id = tid;

  update public.tournaments
  set
    published_at = null,
    draw_hash = null,
    draw_checked_at = null,
    lock_at = null
  where id = tid;

  insert into public.ops_events (kind, name, payload)
  values (
    'integrity',
    'cleared_misclassified_draw',
    jsonb_build_object(
      'slug', 't-wta-16743',
      'reason', 'qualifying_sheet_removed_for_main_rediscovery'
    )
  );
end $$;
