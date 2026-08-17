-- 0030_lock_needs_official_draw.sql
-- First-ball lock_at only locks picks when the official main-draw sheet exists.
-- A leftover lock without seats must not freeze a partial announced list.
-- Idempotent.

create or replace function public.tournament_has_official_draw(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournaments t
    join public.draws d on d.tournament_id = t.id
    where t.id = p_tournament_id
      and t.draw_size in (16, 32, 64, 128)
      and (
        select count(*)::int
        from public.draw_seats ds
        where ds.draw_id = d.id
      ) = t.draw_size
      and not exists (
        select 1
        from public.draw_seats ds
        where ds.draw_id = d.id
          and (
            ds.last_name ~* '^player[[:digit:]]+$'
            or ds.player_ref ~* '^p-[[:digit:]]+$'
          )
      )
  );
$$;

comment on function public.tournament_has_official_draw(uuid) is
  'True when every official slot is published (named / bye / TBD). Seat count = draw_size.';

revoke all on function public.tournament_has_official_draw(uuid) from public;
grant execute on function public.tournament_has_official_draw(uuid)
  to authenticated, anon, service_role;

create or replace function public.tournament_is_locked(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournaments t
    where t.id = p_tournament_id
      and (
        t.admin_locked_at is not null
        or (
          t.lock_at is not null
          and t.lock_at <= now()
          and public.tournament_has_official_draw(t.id)
        )
      )
  );
$$;

-- Leftover first-ball times without a verified sheet are not a lock.
update public.tournaments t
   set lock_at = null
 where t.admin_locked_at is null
   and t.lock_at is not null
   and not public.tournament_has_official_draw(t.id);
