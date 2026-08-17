-- 0019_provider_season_ids.sql
-- Attach RapidAPI season ids discovered from 2026 calendar under Mega plan.
-- Dates follow provider facts (not marketing windows).
-- Idempotent. Does not create draws — pure-fact seats still require import.

update public.tournaments
   set provider_tournament_id = '21347',
       starts_on = '2026-08-10',
       lock_at = '2026-08-09 15:00:00+00',
       venue_tz = coalesce(nullif(venue_tz, ''), 'America/New_York')
 where ref = 'cin-2026';

update public.tournaments
   set provider_tournament_id = '16740',
       starts_on = '2026-08-10',
       lock_at = '2026-08-09 15:00:00+00',
       venue_tz = coalesce(nullif(venue_tz, ''), 'America/New_York')
 where ref = 'cin-wta-2026';

update public.tournaments
   set provider_tournament_id = '21348',
       starts_on = '2026-08-24',
       lock_at = '2026-08-23 15:00:00+00',
       venue_tz = coalesce(nullif(venue_tz, ''), 'America/New_York')
 where ref = 'wsal-2026';

update public.tournaments
   set provider_tournament_id = '21349',
       starts_on = '2026-08-31',
       lock_at = '2026-08-30 15:00:00+00',
       venue_tz = coalesce(nullif(venue_tz, ''), 'America/New_York')
 where ref = 'uso-2026';

update public.tournaments
   set provider_tournament_id = '16743',
       starts_on = '2026-08-31',
       lock_at = '2026-08-30 15:00:00+00',
       venue_tz = coalesce(nullif(venue_tz, ''), 'America/New_York')
 where ref = 'uso-wta-2026';
