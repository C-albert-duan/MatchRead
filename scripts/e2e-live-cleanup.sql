-- Wipe temporary Playwright tournaments and dependent rows.
-- Safe: only refs matching e2e-% .

-- Leagues bind with ON DELETE RESTRICT — remove them first.
delete from public.leagues
 where tournament_id in (
         select id from public.tournaments where ref like 'e2e-%'
       )
    or tournament_label ilike 'E2E Live Checklist%'
    or slug like 'e2e-%';

delete from public.tournaments
 where ref like 'e2e-%';
