-- 0035_live_match_state_realtime.sql
-- One publication for every tournament. A client filters rows on its subscription.

alter table public.live_match_state replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'supabase_realtime publication is missing';
  end if;
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'live_match_state'
  ) then
    alter publication supabase_realtime add table public.live_match_state;
  end if;
end $$;
