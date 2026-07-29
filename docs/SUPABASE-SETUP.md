# Supabase project link (local)

**Project URL:** `https://rdfcklsshutampxsgltj.supabase.co`  
**Repo:** https://github.com/C-albert-duan/MatchRead

Local secrets live in `apps/web/.env.local` (gitignored). Never commit keys or the database password.

## Auth redirect URLs

Supabase → **Authentication** → **URL configuration**:

| Setting | Value |
|---|---|
| Site URL | `http://localhost:3001` |
| Redirect URLs | `http://localhost:3001/auth/callback` |

Later (Vercel): add `https://<your-vercel-app>.vercel.app/auth/callback`.

## Apply schema (fresh project)

Use **SQL Editor**. Run in order:

1. `supabase/migrations/0001_init.sql` — profiles  
2. `supabase/migrations/0002_leagues.sql` — leagues, members, invites, RLS, grants, `create_league` / join RPCs  
3. `supabase/migrations/0003_brackets.sql` — tournaments, draws, seats, brackets, fixture seed, save/submit/lock RPCs  
4. `supabase/migrations/0004_settlement.sql` — match results, snapshots, season standings, void stub  
5. `supabase/migrations/0005_daily_check.sql` — `daily_check_log` cache for Daily Check  

### Already applied an older migration?

Re-run the **current** file in the SQL Editor (`if not exists` / `create or replace` / `on conflict`). Safe to re-apply.

## Rotate database password

If the DB password was pasted in chat, rotate it under **Project Settings → Database**.
