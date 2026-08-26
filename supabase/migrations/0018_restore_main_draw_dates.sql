-- 0018_restore_main_draw_dates.sql
-- Re-apply product main-draw days after calendar sync had been overwriting them
-- with provider week banners (Sprint Directive 2.1 §3).

update public.tournaments
set main_draw_starts_on = date '2026-08-30'
where slug in ('t-atp-21349', 't-wta-16743');

update public.tournaments
set main_draw_starts_on = date '2026-08-23'
where slug = 't-atp-21348';

update public.tournaments
set main_draw_starts_on = date '2026-08-13'
where slug in ('t-atp-21347', 't-wta-16740');

comment on column public.tournaments.main_draw_starts_on is
  'Official main-draw first day. Distinct from starts_on (provider week). Calendar sync must not overwrite with week banner.';
