-- 0021_draw_replacement_bye_to_tbd.sql
-- Published sheets may store an official Q/LL TBD as a bye. Overlay records
-- bye_to_tbd (and official tbd_to_bye) on draw_replacements.change_kind.

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'draw_replacements'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%change_kind%'
  loop
    execute format(
      'alter table public.draw_replacements drop constraint %I',
      r.conname
    );
  end loop;
end $$;

alter table public.draw_replacements
  add constraint draw_replacements_change_kind_check
  check (change_kind in (
    'same',
    'tbd_filled',
    'replacement',
    'bye_to_player',
    'player_to_bye',
    'bye_to_tbd',
    'tbd_to_bye',
    'other'
  ));

comment on column public.draw_replacements.change_kind is
  'Slot-level official-sheet diff: tbd_filled, replacement, bye/tbd/player kind changes, other.';
