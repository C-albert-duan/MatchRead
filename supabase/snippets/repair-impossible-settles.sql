-- Undo five settles that preview-impossible-settles.sql showed cannot have
-- happened (2026-10-22): a later-round match took a player's own earlier
-- result while its other side was still empty. None of them has a pick.
--
-- Top-down per tournament, so trigger matches_unwind_advanced_winner (0026)
-- removes each advanced player from the next round before its feeder is
-- cleared. Any row that no longer matches the preview aborts the whole block.

do $$
declare
  r record;
  target uuid;
  n int := 0;
begin
  for r in
    select *
      from (values
        (1, 't-atp-21358', 3, 1, 'Cerundolo'),
        (2, 't-atp-21358', 2, 2, 'Cerundolo'),
        (3, 't-atp-21358', 2, 1, 'Struff'),
        (4, 't-wta-16751', 3, 1, 'Annie Fernandez'),
        (5, 't-wta-16751', 2, 2, 'Annie Fernandez')
      ) as v(ord, slug, round, idx, winner)
     order by ord
  loop
    select m.id into target
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      join public.players w on w.id = m.winner_player_id
     where t.slug = r.slug
       and m.round = r.round
       and m.index_in_round = r.idx
       and w.last_name = r.winner
       and not m.voided;
    if target is null then
      raise exception 'not as previewed: % r% m% winner %',
        r.slug, r.round, r.idx, r.winner;
    end if;

    update public.matches
       set winner_player_id = null,
           settled_at = null,
           official_score = null,
           fact_kind = null
     where id = target;
    delete from public.settlement_claims where match_id = target;

    insert into public.ops_events (kind, name, payload)
    values (
      'integrity',
      'unsettled_impossible_result',
      jsonb_build_object(
        'slug', r.slug,
        'round', r.round,
        'index_in_round', r.idx,
        'winner', r.winner,
        'reason', 'later-round partial bind before the empty side''s feeder was decided'
      )
    );
    n := n + 1;
    target := null;
  end loop;
  raise notice 'unsettled % matches', n;
end $$;
