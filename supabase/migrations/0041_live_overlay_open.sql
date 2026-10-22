-- Public signal that the live overlay may paint.
-- True only while the listener heartbeat is up and newer than 90 seconds.
-- Page renders do not call this. A false result hides the overlay.
-- It does not read or write matches.

create or replace function public.live_overlay_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.listener_health
     where id = 'listener'
       and connection = 'up'
       and last_heartbeat_at is not null
       and last_heartbeat_at >= now() - interval '90 seconds'
  );
$$;

comment on function public.live_overlay_open() is
  'True when the listener heartbeat is up and newer than 90 seconds. Does not read matches or live rows.';

revoke all on function public.live_overlay_open() from public;
grant execute on function public.live_overlay_open() to anon, authenticated, service_role;
