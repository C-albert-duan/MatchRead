-- 0011: Montreal live 64-draw is source of truth; drop RG/Wim fixtures.
-- Seat rows are owned by scripts/import-montreal-draw.mjs (not re-seeded here).
-- Idempotent.

-- Remove calendar fixtures that have no provider feed.
delete from public.tournaments
 where ref in ('rg-2026', 'wim-2026');

-- Point leftover single-league labels at Montreal if they still name deleted events.
update public.leagues
   set tournament_label = 'National Bank Open Montreal 2026'
 where tournament_label in (
   'Roland Garros 2026',
   'Wimbledon 2026',
   'US Open 2026',
   'National Bank Open Montreal 2026 (live feed)'
 );

-- Live Montreal metadata on the existing uso-2026 row (stable ref / URLs).
update public.tournaments
   set name = 'National Bank Open Montreal 2026',
       draw_size = 64,
       provider_tournament_id = '21346',
       surface = 'hard',
       starts_on = '2026-08-03',
       lock_at = '2026-08-02 15:00:00+00'
 where ref = 'uso-2026';
