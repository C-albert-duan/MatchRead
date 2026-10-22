-- 0034_live_state_rls.sql
-- Scores are public. Browser roles may select. They cannot write.

alter table public.live_match_state enable row level security;

drop policy if exists live_match_state_select on public.live_match_state;
create policy live_match_state_select on public.live_match_state
  for select to anon, authenticated
  using (true);

revoke all on table public.live_match_state from anon, authenticated, public;
grant select on table public.live_match_state to anon, authenticated;
grant select, insert, update, delete on table public.live_match_state to service_role;
