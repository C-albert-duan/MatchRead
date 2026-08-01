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

Open [http://localhost:3001](http://localhost:3001). Full guide: **[docs/DOCKER.md](./docs/DOCKER.md)**.

## Docs

Start here: **[docs/STATUS.md](./docs/STATUS.md)** · **[docs/CHECKLISTS.md](./docs/CHECKLISTS.md)** · **[docs/README.md](./docs/README.md)**

| | |
|---|---|
| Status | [docs/STATUS.md](./docs/STATUS.md) |
| Checklists | [docs/CHECKLISTS.md](./docs/CHECKLISTS.md) |
| Product | [docs/PRODUCT.md](./docs/PRODUCT.md) |
| Scope | [docs/MVP-SCOPE.md](./docs/MVP-SCOPE.md) |
| Roadmap | [docs/ROADMAP.md](./docs/ROADMAP.md) |
| Docker | [docs/DOCKER.md](./docs/DOCKER.md) |
| Deploy | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) |
| Supabase | [docs/SUPABASE-SETUP.md](./docs/SUPABASE-SETUP.md) |

## Wireframe (do not edit for app code)

Interactive product spec: [`Wireframe/MatchRead-main/matchread-spec/index.html`](./Wireframe/MatchRead-main/matchread-spec/index.html)

CEO priorities PDF: `Wireframe/MatchRead_US_Open_MVP_Feature_Priorities.pdf`

## Stack

- `apps/web` — Next.js (run via Docker; Vercel optional for prod)
- `packages/core` — domain scoring / Daily Check
- `packages/tokens` — design tokens
- `packages/i18n` — locales
- `supabase/` — schema, RLS, edge functions

## Current phase

Owner verification across [Phases 10–13](./docs/CHECKLISTS.md). Build 0–8 code-complete. Tier 2–3 deferred (Phase 14).
