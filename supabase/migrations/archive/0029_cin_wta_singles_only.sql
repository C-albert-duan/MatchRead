-- 0029_cin_wta_singles_only.sql
-- 0027 raced the old sync-tennis tick, which republished the 32-player
-- (doubles) sheet and reset draw_size. New sync-tennis will not. Wipe again.

do $$
declare
  v_tid uuid;
  v_n int;
begin
  select t.id into v_tid from public.tournaments t where t.ref = 'cin-wta-2026';
  if v_tid is null then
    return;
  end if;

  select count(*)::int into v_n
    from public.draw_seats ds
    join public.draws d on d.id = ds.draw_id
   where d.tournament_id = v_tid;

  if v_n = 64 then
    return;
  end if;

  delete from public.draw_seats ds
   using public.draws d
   where ds.draw_id = d.id
     and d.tournament_id = v_tid;

  delete from public.provider_match_map where tournament_id = v_tid;
  delete from public.match_results where tournament_id = v_tid;
  delete from public.match_schedule where tournament_id = v_tid;
  delete from public.draws where tournament_id = v_tid;
end $$;

update public.tournaments
   set draw_size = 64
 where ref = 'cin-wta-2026';
