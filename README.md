# MatchRead

Tennis bracket leagues for groups — official draws as facts, picks and settlement as product.

**Not gambling.** Create a league, share a link, fill brackets, come back for the Daily Check.

## Start here

| Goal | Doc |
|------|-----|
| How the system is shaped | [architecture/README.md](./architecture/README.md) |
| Data flows (ingest → UI → picks → settle) | [architecture/data-flows.md](./architecture/data-flows.md) |
| Cleanup / ownership plan | [architecture/cleanup-plan.md](./architecture/cleanup-plan.md) |
| Env and secrets | [architecture/infrastructure/environment.md](./architecture/infrastructure/environment.md) |
| Ops scripts | [architecture/infrastructure/ops-scripts.md](./architecture/infrastructure/ops-scripts.md) |

## Run locally (Docker only)

No host Node/npm install. Dependencies stay inside Docker.

```bash
cp .env.docker.example .env.docker
# set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

docker compose --env-file .env.docker up --build
```

Open [http://localhost:3001](http://localhost:3001).

Supabase Auth/API/DB stay **hosted** (or CLI outside Compose). See [architecture/infrastructure/ci-and-deploy.md](./architecture/infrastructure/ci-and-deploy.md).

## Repo layout

```text
apps/web/                  Next.js product UI
packages/
  core/                    Domain rules (bracket, grade, lock)
  provider-rapidapi/       Tennis API client (Edge + ops only)
  i18n/                    Copy
  tokens/                  Design tokens
supabase/                  Migrations, Edge functions, pgTAP tests
scripts/                   Publish, reconcile, probes (see scripts/README.md)
architecture/              Runtime documentation (source of truth)
discussion/                Design archive (not authoritative)
```

## Common npm scripts

```bash
npm run dev              # web (or use Docker)
npm run test             # workspace unit tests
npm run ci:consumer-boundary   # public_calendar trust grep
npm run publish:draws    # ops: POST sync-facts for verified draws
npm run reconcile:results
npm run tennis:verify -- --slug t-atp-21349
```

Provider/ingest secrets: copy `.env.provider.example` → `.env.provider` (gitignored).

## Stack

- **Web** — Next.js 14, Supabase anon + RLS RPCs
- **Facts ingest** — Edge `sync-facts` + `@matchread/provider-rapidapi`
- **Settlement** — Edge `settle-leagues` + `@matchread/core` grade

Pure-fact rules (official seats only, no invented players): `.cursor/rules/pure-fact.mdc`.
