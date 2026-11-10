-- 0048_revoke_client_bracket_writes.sql
--
-- Fix list P0-3 (check/CODEBASE-FIX-LIST.md).
--
-- 0005 granted SELECT on brackets and picks to authenticated and revoked
-- everything from anon, but Supabase's default privileges had already given
-- authenticated INSERT / UPDATE / DELETE. Only RLS (select policies, no
-- write policies) stood in the way, so a client update matched 0 rows with no
-- error. The commissioner Settle button relied on that and reported success
-- while writing nothing; it has been removed from the web app.
--
-- Every bracket and pick write goes through security-definer RPCs
-- (save_picks, submit_bracket) or the service role (settle-leagues), so the
-- client grants are not needed.

revoke insert, update, delete, truncate on table public.brackets from authenticated;
revoke insert, update, delete, truncate on table public.picks from authenticated;
