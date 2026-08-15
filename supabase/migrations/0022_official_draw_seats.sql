-- 0022_official_draw_seats.sql
-- Official main-draw seats: named player, published bye, or Qualifier/LL TBD.
-- Cincinnati ATP is a 96-player Masters → 128 slots. Idempotent.

alter table public.draw_seats
  add column if not exists seat_kind text;

alter table public.draw_seats
  add column if not exists entry_status text;

update public.draw_seats
   set seat_kind = case when is_bye then 'bye' else 'player' end
 where seat_kind is null;

alter table public.draw_seats
  alter column seat_kind set default 'player';

alter table public.draw_seats
  alter column seat_kind set not null;

alter table public.draw_seats
  drop constraint if exists draw_seats_seat_kind_check;

alter table public.draw_seats
  add constraint draw_seats_seat_kind_check
  check (seat_kind in ('player', 'bye', 'tbd'));

alter table public.draw_seats
  drop constraint if exists draw_seats_entry_status_check;

alter table public.draw_seats
  add constraint draw_seats_entry_status_check
  check (entry_status is null or entry_status in ('wc', 'pr'));

comment on column public.draw_seats.seat_kind is
  'Official occupant: named player, published bye, or Qualifier/LL TBD.';

comment on column public.draw_seats.entry_status is
  'WC or PR when the official draw published it. Null for a direct acceptance.';

-- Keep is_bye aligned with seat_kind (legacy readers still work).
update public.draw_seats
   set is_bye = (seat_kind = 'bye')
 where is_bye is distinct from (seat_kind = 'bye');

-- ATP Cincinnati official sheet is 128 slots (32 seed byes). Do not infer 64.
-- Clear the invented 15:00 lock; lock_at comes from the first timed main-draw ball.
update public.tournaments
   set draw_size = 128,
       lock_at = null
 where ref = 'cin-2026';
