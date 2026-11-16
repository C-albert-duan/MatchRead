-- Migration 0050: a receipt-ordered live row upgrades to a provider order,
-- and claim_settlement is insert-first (fix list P2-3, P2-5).
-- Concurrency itself is not reproducible in one pgTAP transaction; these
-- checks pin the single-writer behaviour the new bodies must keep.
-- Run: npx supabase test db

begin;

select plan(6);

insert into public.tournaments (slug, name, tour, starts_on, ends_on, product_override, ingestion_enabled)
values ('pgtap-live-lock', 'Live Lock Fixture', 'atp', '2026-10-09', '2026-10-10', 'force_off', false);
insert into public.matches (tournament_id, round, index_in_round)
select id, 0, 0 from public.tournaments where slug = 'pgtap-live-lock';

create temp table ids on commit drop as
select t.id as t_id, m.id as m_id
  from public.tournaments t join public.matches m on m.tournament_id = t.id
 where t.slug = 'pgtap-live-lock';

select is(
  public.upsert_live_match_state((select m_id from ids), (select t_id from ids), 'pgtap-live-lock-r0',
    'in_play', '1-0', '15-0', null, null, 1, 'receivedAt', 'frame-receipt', 'rest',
    '2026-10-09 18:00:00+00', null),
  'applied', 'the first frame, ordered by receipt, is stored');

select is(
  public.upsert_live_match_state((select m_id from ids), (select t_id from ids), 'pgtap-live-lock-r0',
    'in_play', '2-0', '0-0', null, null, 5, 'updatedAt', 'frame-clock', 'rest',
    '2026-10-09 18:00:05+00', '2026-10-09 18:00:04+00'),
  'applied', 'a frame with a provider clock replaces a receipt-ordered row');

select is(
  (select score_text || '/' || sequence_source from public.live_match_state where match_id = (select m_id from ids)),
  '2-0/updatedAt', 'the row now follows the provider clock');

select is(
  public.upsert_live_match_state((select m_id from ids), (select t_id from ids), 'pgtap-live-lock-r0',
    'in_play', '0-1', '0-0', null, null, 99, 'receivedAt', 'frame-late', 'rest',
    '2026-10-09 18:01:00+00', null),
  'ignored', 'a receipt-ordered frame never replaces a provider-ordered row');

select is(
  public.claim_settlement((select m_id from ids), 'void', null, null),
  'claimed', 'the first claim inserts');

select is(
  public.claim_settlement((select m_id from ids), 'void', null, null),
  'noop', 'the same claim again is a no-op, not a key violation');

select * from finish();
rollback;
