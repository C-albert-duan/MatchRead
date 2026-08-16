-- 0031_wipe_nonfact_noise.sql
-- Strip fixture / doubles / half-filled Qualifier noise. Keep calendar rows.
-- Cincinnati ATP seats are republished from MDS + Tennis API overlay after this.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Grand Slam UX leftovers: draw_size 16 was the 0003 fixture, not a fact.
-- ---------------------------------------------------------------------------

update public.tournaments
   set draw_size = 128
 where ref in ('rg-2026', 'wim-2026')
   and draw_size = 16;

-- ---------------------------------------------------------------------------
-- Cincinnati WTA: partial announced pairs only (no verified 64 sheet).
-- ---------------------------------------------------------------------------

delete from public.announced_matchups a
 using public.tournaments t
 where a.tournament_id = t.id
   and t.ref = 'cin-wta-2026';

delete from public.match_results r
 using public.tournaments t
 where r.tournament_id = t.id
   and t.ref = 'cin-wta-2026';

delete from public.match_schedule s
 using public.tournaments t
 where s.tournament_id = t.id
   and t.ref = 'cin-wta-2026';

delete from public.provider_match_map m
 using public.tournaments t
 where m.tournament_id = t.id
   and t.ref = 'cin-wta-2026';

delete from public.bracket_snapshots bs
 using public.tournaments t
 where bs.tournament_id = t.id
   and t.ref = 'cin-wta-2026';

delete from public.draw_seats ds
 using public.draws d
 join public.tournaments t on t.id = d.tournament_id
 where ds.draw_id = d.id
   and t.ref = 'cin-wta-2026';

delete from public.draws d
 using public.tournaments t
 where d.tournament_id = t.id
   and t.ref = 'cin-wta-2026';

update public.tournaments
   set lock_at = null
 where ref = 'cin-wta-2026'
   and not exists (
     select 1
       from public.match_schedule s
      where s.tournament_id = tournaments.id
        and s.has_time = true
   );

-- ---------------------------------------------------------------------------
-- Cincinnati ATP: bloated announced fx list, Qualifier seats with provider ids
-- but no real last name, and results keyed to those half-filled seats.
-- Wipe facts-adjacent noise; keep submitted brackets. Republish via publish-draws.
-- ---------------------------------------------------------------------------

delete from public.announced_matchups a
 using public.tournaments t
 where a.tournament_id = t.id
   and t.ref = 'cin-2026';

delete from public.match_results r
 using public.tournaments t
 where r.tournament_id = t.id
   and t.ref = 'cin-2026';

delete from public.match_schedule s
 using public.tournaments t
 where s.tournament_id = t.id
   and t.ref = 'cin-2026';

delete from public.provider_match_map m
 using public.tournaments t
 where m.tournament_id = t.id
   and t.ref = 'cin-2026';

delete from public.bracket_snapshots bs
 using public.tournaments t
 where bs.tournament_id = t.id
   and t.ref = 'cin-2026';

delete from public.draw_seats ds
 using public.draws d
 join public.tournaments t on t.id = d.tournament_id
 where ds.draw_id = d.id
   and t.ref = 'cin-2026';

delete from public.draws d
 using public.tournaments t
 where d.tournament_id = t.id
   and t.ref = 'cin-2026';
