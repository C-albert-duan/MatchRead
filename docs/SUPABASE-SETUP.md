# Supabase project link (local)

**Project URL:** `https://opugihofwvunwkpcmboq.supabase.co`  
**Project ref:** `opugihofwvunwkpcmboq`  
**Repo:** https://github.com/C-albert-duan/MatchRead

Local secrets live in **`.env.docker`** (gitignored) for Compose. Never commit keys or the database password. See [DOCKER.md](./DOCKER.md).

## Auth redirect URLs

Supabase → **Authentication** → **URL configuration**:

| Setting | Value |
|---|---|
| Site URL | `http://localhost:3001` (**never** `0.0.0.0` — that is Docker’s bind address) |
| Redirect URLs | `http://localhost:3001/**` and `http://localhost:3001/auth/callback` |

Later (Vercel): add `https://<your-vercel-app>.vercel.app/auth/callback`.

## Apply schema (fresh project)

Use **SQL Editor**. Run in order:

1. `supabase/migrations/0001_init.sql` — profiles  
2. `supabase/migrations/0002_leagues.sql` — leagues, members, invites, RLS, grants, `create_league` / join RPCs  
3. `supabase/migrations/0003_brackets.sql` — tournaments, draws, seats, brackets, fixture seed, save/submit/lock RPCs  
4. `supabase/migrations/0004_settlement.sql` — match results, snapshots, season standings, void stub  
5. `supabase/migrations/0005_daily_check.sql` — `daily_check_log` cache for Daily Check  
6. `supabase/migrations/0006_engagement.sql` — `brackets.confidence` + `save_bracket_picks` optional `p_confidence`
7. `supabase/migrations/0007_lock_season_commissioner.sql` — season commissioners can lock draws (fixes UI vs RPC mismatch)  
8. `supabase/migrations/0008_commissioner_read_brackets.sql` — commissioners can read all league brackets (needed for settlement to grade invitees)
9. `supabase/migrations/0009_display_names.sql` — league mates can read display names; `set_my_display_name` RPC
10. Later migrations through `0012_league_member_crud.sql` as needed for member CRUD
11. `supabase/migrations/0013_solo_brackets.sql` — `leagues.is_solo`, `ensure_solo_league`, graduate solo on join

Phase 7 (founder / void / i18n) needs **no new migration** — uses `pick_voids` + `match_results.voided` from 0004. Void writes still require commissioner RLS for that tournament.

### Already applied / re-pasting?

All of `0001`–`0009` are **idempotent**. You may re-run them in order in the SQL Editor:

- Policies use `drop policy if exists` then `create policy`
- Tables/indexes use `if not exists`
- RPCs use `drop function if exists` + `create or replace` (final signatures for save/lock live in both 0003 and 0006/0007 so a mid-sequence re-run does not regress)
- Fixture **tournaments** upsert on `ref`
- Fixture **draw seats** seed only when the US Open draw has zero seats (never wipe)
- Fixture **match_results** use `on conflict do nothing` (never overwrite commissioner edits)

## Rotate database password

If the DB password was pasted in chat, rotate it under **Project Settings → Database**.
