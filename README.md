# MatchRead

Tennis bracket leagues for groups — US Open 2026 web launch.

**Not gambling.** Create a league, share a link, fill brackets, come back for the Daily Check.

## Run (Docker only)

No host Node/npm install. Dependencies stay inside Docker.

```bash
cp .env.docker.example .env.docker
# set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

docker compose --env-file .env.docker up --build
```

Open [http://localhost:3001](http://localhost:3001).

## Stack

- `apps/web` — Next.js (run via Docker; Vercel optional for prod)
- `packages/core` — domain scoring / Daily Check
- `packages/tokens` — design tokens
- `packages/i18n` — locales
- `packages/provider-rapidapi` — Tennis API client
- `supabase/` — schema, RLS, edge functions
