-- 0023_match_structure.sql
-- Public match ref, session, and court. One sheet read for the bracket.
-- Session is never inferred from the clock. No live-state tables.

alter table public.matches
  add column if not exists external_ref text,
  add column if not exists session text not null default 'unknown',
  add column if not exists court text;

alter table public.matches
  drop constraint if exists matches_session_check;

alter table public.matches
  add constraint matches_session_check
  check (session in ('day', 'night', 'unknown'));

alter table public.matches
  drop constraint if exists matches_court_nonempty_check;

alter table public.matches
  add constraint matches_court_nonempty_check
  check (court is null or length(btrim(court)) > 0);

comment on column public.matches.external_ref is
  'Public /matches/[ref] key. Not the row uuid.';
comment on column public.matches.session is
  'day, night, or unknown. Do not derive this from scheduled_at.';
comment on column public.matches.court is
  'Court label published for this match. Null when the provider did not name one.';

create or replace function public.assign_match_external_ref()
returns trigger
language plpgsql
as $$
declare
  v_slug text;
  v_slot text;
  v_fx text;
begin
  select slug into v_slug
    from public.tournaments
   where id = new.tournament_id;

  v_slot := v_slug || '-r' || new.round::text || '-m' || new.index_in_round::text;

  if new.external_ref is not null
     and btrim(new.external_ref) <> ''
     and btrim(new.external_ref) is distinct from v_slot then
    new.external_ref := btrim(new.external_ref);
    return new;
  end if;

  if new.provider_match_id is not null and btrim(new.provider_match_id) <> '' then
    v_fx := 'fx-' || btrim(new.provider_match_id);
    if not exists (
      select 1
        from public.matches
       where external_ref = v_fx
         and id is distinct from new.id
    ) then
      new.external_ref := v_fx;
      return new;
    end if;
  end if;

  new.external_ref := v_slot;
  return new;
end;
$$;

comment on function public.assign_match_external_ref() is
  'Public match ref. Provider id becomes fx-{id} when that token is free. Otherwise the slot key. Never the uuid.';

revoke all on function public.assign_match_external_ref() from public;

drop trigger if exists matches_assign_external_ref on public.matches;
create trigger matches_assign_external_ref
  before insert or update of provider_match_id, external_ref, round, index_in_round
  on public.matches
  for each row
  execute function public.assign_match_external_ref();

update public.matches
   set round = round
 where external_ref is null;

alter table public.matches
  alter column external_ref set not null;

alter table public.matches
  drop constraint if exists matches_external_ref_key;

alter table public.matches
  add constraint matches_external_ref_key unique (external_ref);

create or replace view public.tournament_match_sheet
with (security_invoker = true)
as
select
  m.tournament_id,
  t.slug as tournament_ref,
  t.name as tournament_name,
  t.venue_tz,
  t.draw_size,
  m.round,
  m.index_in_round,
  m.external_ref,
  m.scheduled_at,
  m.has_time,
  m.session,
  m.court,
  m.winner_player_id,
  m.voided,
  m.settled_at,
  m.official_score,
  m.fact_kind,
  m.side_a_player_id,
  pa.last_name as side_a_last_name,
  m.side_b_player_id,
  pb.last_name as side_b_last_name,
  wa.last_name as winner_last_name
from public.matches m
join public.tournaments t on t.id = m.tournament_id
left join public.players pa on pa.id = m.side_a_player_id
left join public.players pb on pb.id = m.side_b_player_id
left join public.players wa on wa.id = m.winner_player_id;

comment on view public.tournament_match_sheet is
  'One read for a tournament sheet or a public match. No match uuid.';

grant select on public.tournament_match_sheet to anon, authenticated;
