# Supabase project link (local)

**Project URL:** `https://rdfcklsshutampxsgltj.supabase.co`  
**Repo:** https://github.com/C-albert-duan/MatchRead

Local secrets live in `apps/web/.env.local` (gitignored). Never commit keys or the database password.

## Auth redirect URLs (do this in the dashboard)

Supabase → **Authentication** → **URL configuration**:

| Setting | Value |
|---|---|
| Site URL | `http://localhost:3001` |
| Redirect URLs | `http://localhost:3001/auth/callback` |

Later (Vercel): add `https://<your-vercel-app>.vercel.app/auth/callback` and set Site URL to the production domain.

## Apply schema migration

Direct DB from this machine failed (IPv6-only DB host / pooler region). Run once in Supabase → **SQL Editor** → New query → paste and run:

```sql
-- from supabase/migrations/0001_init.sql
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'en',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);
```

Magic-link auth works **before** this migration; profiles matter for Phase 2+.

## Rotate database password

If the DB password was pasted in chat earlier, rotate it under **Project Settings → Database**.
