-- 0022_match_official_facts.sql
-- Official score text and fact class on matches.
-- Reconciliation may fill a null. It must not replace a conflicting settled value
-- (that guard lives in mergeSettledFact, not in this table).

alter table public.matches
  add column if not exists official_score text,
  add column if not exists fact_kind text;

alter table public.matches
  drop constraint if exists matches_fact_kind_check;

alter table public.matches
  add constraint matches_fact_kind_check
  check (
    fact_kind is null
    or fact_kind in ('played', 'withdrawal', 'void')
  );

comment on column public.matches.official_score is
  'Score text the provider published. Display only. Never parsed into a winner.';

comment on column public.matches.fact_kind is
  'played, withdrawal, or void. A withdrawal is not an ingestion gap.';
