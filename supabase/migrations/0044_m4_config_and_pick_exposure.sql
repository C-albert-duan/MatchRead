-- M4 server configuration and the forward-exposure read path.
--
-- app_config holds server-side settings the web tier reads with a short
-- cache, so a founder can retune them without a deploy. The first key is
-- 'importance' (ImportanceConfig in packages/core/src/live/importance.ts).
-- Reads: authenticated. Writes: service role only (the web holds the anon
-- key, and founder access is an app-level gate, not a database role).
--
-- Forward exposure: picks are per match and fixed after lock, so "which
-- forward picks are lost if player X loses" is the picks naming X. An index
-- on picks (player_id, bracket_id) answers that directly. A lock-time table
-- keyed by live match cannot be filled for later rounds whose entrants are
-- not known at lock, so bracket_forward_exposure is not created
-- (docs/v3-m4-decisions.md D-M4-9).

create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  constraint app_config_importance_shape check (
    key <> 'importance'
    or (
      jsonb_typeof(value -> 'criticalAtOrBelow') = 'number'
      and jsonb_typeof(value -> 'importantAtOrBelow') = 'number'
      and (value ->> 'criticalAtOrBelow')::numeric between 0 and 6
      and (value ->> 'importantAtOrBelow')::numeric between 0 and 6
    )
  )
);

comment on table public.app_config is
  'Server settings read by the web tier with a short cache. Service role writes only.';

insert into public.app_config (key, value) values
  ('importance', '{"criticalAtOrBelow": 0, "importantAtOrBelow": 2}'::jsonb);

alter table public.app_config enable row level security;

create policy app_config_select_auth on public.app_config
  for select to authenticated using (true);

grant select on table public.app_config to authenticated;
-- Supabase default privileges grant writes on new tables; take them back so
-- a write fails loudly instead of matching no policy.
revoke insert, update, delete, truncate on table public.app_config from authenticated;
revoke all on table public.app_config from anon;

create index if not exists picks_player_bracket_idx
  on public.picks (player_id, bracket_id);

comment on index public.picks_player_bracket_idx is
  'Forward exposure: picks naming a player, per bracket. Replaces a materialised exposure table.';
