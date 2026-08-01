# Docker-only workflow

MatchRead runs **only via Docker Compose**. Do not `npm install` on the host — dependencies live inside the image / a Compose volume.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Engine + Compose v2)
- A Supabase project (URL + anon/publishable key)

## First run

```bash
cp .env.docker.example .env.docker
# edit .env.docker — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

docker compose --env-file .env.docker up --build
```

App: [http://localhost:3001](http://localhost:3001)

Default service `web` is **Next.js dev** with bind-mounted `apps/` and `packages/` (hot reload). Auth redirects: allow `http://localhost:3001/**` and `http://localhost:3001/auth/callback` in Supabase → Authentication → URL configuration.

## Common commands

| Goal | Command |
|---|---|
| Dev (default) | `docker compose --env-file .env.docker up --build` |
| Background | `docker compose --env-file .env.docker up --build -d` |
| Stop | `docker compose --env-file .env.docker down` |
| Production image | `docker compose --env-file .env.docker --profile prod up --build web-prod` |
| Apply SQL migrations | `docker compose --env-file .env.docker --profile migrate run --rm migrate` |
| Settlement math dry-run | `docker compose --env-file .env.docker --profile verify run --rm verify-math` |
| Logs | `docker compose --env-file .env.docker logs -f web` |

`DATABASE_URL` is required only for the migrate profile (never put the service-role key on `web` / `web-prod`).

## What is containerized

| Service | Profile | Role |
|---|---|---|
| `web` | (default) | Dev server, hot reload |
| `web-prod` | `prod` | Standalone production Next server |
| `migrate` | `migrate` | One-shot `supabase/migrations/*.sql` |
| `verify-math` | `verify` | Settlement math dry-run (no DB) |

Supabase Auth/API/DB stay **hosted** (or use Supabase CLI outside Compose). The LIVE-LISTENER worker is not in this repo yet.

## Env notes

- Copy `.env.docker.example` → `.env.docker` (gitignored).
- Host `apps/web/.env.local` is **not** used by Compose.
- For `web-prod`, `NEXT_PUBLIC_*` are **build args** — rebuild after changing them.
- For default `web` (dev), `NEXT_PUBLIC_*` come from Compose environment at runtime.

## Host hygiene

Do not commit or rely on:

- `node_modules/`
- `apps/web/.next/`

Those are gitignored. If they appear from an old local install, delete them; Docker does not need them.

## Production deploy

Vercel remains a supported deploy path for `apps/web` (see [DEPLOYMENT.md](./DEPLOYMENT.md)). Local/self-host day-to-day work is Docker-only as above.
