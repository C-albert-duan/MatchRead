-- 0010_tournaments_name_not_unique.sql
-- Tennis API calendar can repeat the same event name within a tour
-- (different provider ids / weeks). Identity is provider_id + slug.

alter table public.tournaments
  drop constraint if exists tournaments_name_tour_key;
