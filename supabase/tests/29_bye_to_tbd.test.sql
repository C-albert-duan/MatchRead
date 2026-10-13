-- 29_bye_to_tbd.test.sql
-- A3: draw_replacements.change_kind accepts bye_to_tbd / tbd_to_bye.

begin;

select plan(2);

select ok(
  exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'draw_replacements'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%bye_to_tbd%'
  ),
  'draw_replacements.change_kind allows bye_to_tbd'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'draw_replacements'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%tbd_to_bye%'
  ),
  'draw_replacements.change_kind allows tbd_to_bye'
);

select * from finish();
rollback;
