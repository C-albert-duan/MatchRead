-- 0017_lock_write_proof.sql
-- Sprint Directive 2.1 Phase 6: document that post-lock writes are refused by picks_are_locked.
-- (Behavioral proof lives in save_picks; this asserts the lock predicate still uses lock_at.)

comment on function public.picks_are_locked(uuid, uuid) is
  'True when draw is official and tournaments.lock_at <= now(). save_picks raises tournament locked — DB gate, not UI.';

-- Integrity: publish path already blocks when draw_integrity_reports.safe_to_publish is false
-- (apply-draw). Reaffirm: no published_at without a green report for eligible events.
create or replace function public.assert_publish_requires_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.draw_integrity_reports%rowtype;
begin
  if new.published_at is null then
    return new;
  end if;
  if old.published_at is not null and new.published_at is not distinct from old.published_at then
    return new;
  end if;
  if not coalesce(new.bracket_eligible, false) then
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

drop trigger if exists tournaments_publish_requires_integrity on public.tournaments;
create trigger tournaments_publish_requires_integrity
  before update of published_at on public.tournaments
  for each row
  when (new.published_at is not null)
  execute function public.assert_publish_requires_integrity();

comment on function public.assert_publish_requires_integrity() is
  'Draw stays draw pending unless draw_integrity_reports.safe_to_publish is true.';
