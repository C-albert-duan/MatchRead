-- 0027_uso_fixture_off.sql
-- Strip the 0003 US Open 16-player UX fixture and the WTA Cincinnati 32-draw
-- (doubles) sheet. Calendar metadata + date ranges. First-party ops capture.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Date range (checklist 3.1)
-- ---------------------------------------------------------------------------

alter table public.tournaments
  add column if not exists ends_on date;

comment on column public.tournaments.ends_on is
  'Last scheduled day of the tournament week. Null when unknown. Never invent.';

update public.tournaments
   set starts_on = '2026-08-13',
       ends_on = '2026-08-23',
       draw_size = 128
 where ref = 'cin-2026';

update public.tournaments
   set starts_on = '2026-08-23',
       ends_on = '2026-08-29'
 where ref = 'wsal-2026';

update public.tournaments
   set starts_on = '2026-08-30',
       ends_on = '2026-09-13',
       draw_size = 128
 where ref = 'uso-2026';

update public.tournaments
   set starts_on = '2026-08-30',
       ends_on = '2026-09-13',
       draw_size = 128
 where ref = 'uso-wta-2026';

-- Invented 15:00 locks: only keep lock_at when a timed main-draw ball exists.
update public.tournaments t
   set lock_at = null
 where t.ref in ('uso-2026', 'uso-wta-2026', 'wsal-2026')
   and not exists (
     select 1
       from public.match_schedule s
      where s.tournament_id = t.id
        and s.has_time = true
   );

-- ---------------------------------------------------------------------------
-- Wipe ATP US Open fixture seats (Aldecoa / p-0 …)
-- ---------------------------------------------------------------------------

delete from public.draw_seats ds
 using public.draws d
 join public.tournaments t on t.id = d.tournament_id
 where ds.draw_id = d.id
   and t.ref = 'uso-2026';

delete from public.announced_matchups a
 using public.tournaments t
 where a.tournament_id = t.id
   and t.ref = 'uso-2026';

delete from public.provider_match_map m
 using public.tournaments t
 where m.tournament_id = t.id
   and t.ref = 'uso-2026';

delete from public.match_results r
 using public.tournaments t
 where r.tournament_id = t.id
   and t.ref = 'uso-2026';

delete from public.match_schedule s
 using public.tournaments t
 where s.tournament_id = t.id
   and t.ref = 'uso-2026';

delete from public.draws d
 using public.tournaments t
 where d.tournament_id = t.id
   and t.ref = 'uso-2026';

-- ---------------------------------------------------------------------------
-- Wipe WTA Cincinnati if the published sheet is not 64-player singles
-- ---------------------------------------------------------------------------

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

  delete from public.announced_matchups where tournament_id = v_tid;
  delete from public.provider_match_map where tournament_id = v_tid;
  delete from public.match_results where tournament_id = v_tid;
  delete from public.match_schedule where tournament_id = v_tid;
  delete from public.draws where tournament_id = v_tid;
end $$;

update public.tournaments
   set starts_on = '2026-08-13',
       ends_on = '2026-08-23',
       draw_size = 64
 where ref = 'cin-wta-2026';

-- ---------------------------------------------------------------------------
-- ops_events: Sentry/PostHog-shaped capture that is live without third-party keys
-- ---------------------------------------------------------------------------

create table if not exists public.ops_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('error', 'event')),
  name text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists ops_events_created_at_idx
  on public.ops_events (created_at desc);

comment on table public.ops_events is
  'First-party error + product events. Anon may insert (public DSN equivalent). Members may read.';

grant insert on public.ops_events to anon, authenticated;
grant select on public.ops_events to authenticated;

alter table public.ops_events enable row level security;

drop policy if exists ops_events_insert on public.ops_events;
create policy ops_events_insert on public.ops_events
  for insert to anon, authenticated
  with check (kind in ('error', 'event') and char_length(name) between 1 and 80);

drop policy if exists ops_events_select on public.ops_events;
create policy ops_events_select on public.ops_events
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Lock proof: a direct write against in-play Cincinnati must fail
-- ---------------------------------------------------------------------------

do $$
declare
  v_tid uuid;
begin
  select t.id into v_tid
    from public.tournaments t
   where t.ref = 'cin-2026'
     and public.tournament_is_locked(t.id)
   limit 1;

  if v_tid is null then
    raise notice 'lock proof skipped: cin-2026 is not locked yet';
    return;
  end if;

  begin
    insert into public.brackets (league_id, tournament_id, user_id, picks)
    values (gen_random_uuid(), v_tid, gen_random_uuid(), '{}'::jsonb);
    raise exception 'lock proof failed: insert succeeded on locked cin-2026';
  exception
    when others then
      if sqlerrm not like '%tournament locked%' then
        raise;
      end if;
      raise notice 'lock proof ok: %', sqlerrm;
  end;
end $$;
