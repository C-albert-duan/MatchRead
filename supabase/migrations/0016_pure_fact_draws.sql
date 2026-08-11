-- 0016_pure_fact_draws.sql
-- Strip Toronto placeholder draw so entry opens only after a verified provider import.
-- Idempotent.

-- Remove fake seats (migration 0014 placeholders had no provider_player_id).
delete from public.draw_seats ds
 using public.draws d
 join public.tournaments t on t.id = d.tournament_id
 where ds.draw_id = d.id
   and t.ref = 'nbo-tor-2026'
   and (
     ds.provider_player_id is null
     or ds.last_name ~ '^Player '
     or ds.player_ref ~ '^wta-[0-9]+$'
   );

-- Drop the draw row so the calendar treats Toronto as draw-pending until import.
delete from public.draws d
 using public.tournaments t
 where d.tournament_id = t.id
   and t.ref = 'nbo-tor-2026'
   and not exists (
     select 1
       from public.draw_seats ds
      where ds.draw_id = d.id
        and ds.provider_player_id is not null
        and ds.is_bye = false
   );
