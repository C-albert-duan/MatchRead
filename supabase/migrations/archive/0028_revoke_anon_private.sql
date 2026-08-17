-- 0028_revoke_anon_private.sql
-- Anon may not GRANT-select private league or bracket tables.
-- RLS already returns no rows; revoke so PostgREST is 401, not [].
-- Idempotent.

revoke all on table public.brackets from anon;
revoke all on table public.bracket_snapshots from anon;
revoke all on table public.leagues from anon;
revoke all on table public.league_members from anon;
revoke all on table public.ops_events from anon;

grant insert on table public.ops_events to anon, authenticated;
grant select on table public.ops_events to authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.tournaments', 'select') is not true then
    raise exception 'anon must SELECT tournaments';
  end if;
  if has_table_privilege('anon', 'public.draws', 'select') is not true then
    raise exception 'anon must SELECT draws';
  end if;
  if has_table_privilege('anon', 'public.draw_seats', 'select') is not true then
    raise exception 'anon must SELECT draw_seats';
  end if;
  if has_table_privilege('anon', 'public.brackets', 'select') then
    raise exception 'anon must not SELECT brackets';
  end if;
  if has_table_privilege('anon', 'public.bracket_snapshots', 'select') then
    raise exception 'anon must not SELECT bracket_snapshots';
  end if;
  if has_table_privilege('anon', 'public.leagues', 'select') then
    raise exception 'anon must not SELECT leagues';
  end if;
  if has_table_privilege('anon', 'public.league_members', 'select') then
    raise exception 'anon must not SELECT league_members';
  end if;
  raise notice 'anon privilege proof ok';
end $$;
