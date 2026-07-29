# MatchRead

Tennis bracket leagues for groups — US Open 2026 web launch.

**Not gambling.** Create a league, share a link, fill brackets, come back for the Daily Check.

## Docs

Start here: **[docs/STATUS.md](./docs/STATUS.md)** (live phase status) · **[docs/README.md](./docs/README.md)** (full index)

| | |
|---|---|
| Status | [docs/STATUS.md](./docs/STATUS.md) |
| Product | [docs/PRODUCT.md](./docs/PRODUCT.md) |
| Scope | [docs/MVP-SCOPE.md](./docs/MVP-SCOPE.md) |
| Roadmap | [docs/ROADMAP.md](./docs/ROADMAP.md) |
| Deploy | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) |
| Supabase | [docs/SUPABASE-SETUP.md](./docs/SUPABASE-SETUP.md) |

## Wireframe (do not edit for app code)

Interactive product spec: [`Wireframe/MatchRead-main/matchread-spec/index.html`](./Wireframe/MatchRead-main/matchread-spec/index.html)

CEO priorities PDF: `Wireframe/MatchRead_US_Open_MVP_Feature_Priorities.pdf`

## Stack

- `apps/web` — Next.js → Vercel
- `packages/core` — domain scoring / Daily Check
- `packages/tokens` — design tokens
- `packages/i18n` — locales
- `supabase/` — schema, RLS, edge functions

## Quick start

```bash
node -v   # >= 20.11
npm install
cp .env.example apps/web/.env.local   # fill Supabase anon URL/key
npm run dev
```

(`pnpm-workspace.yaml` is present if you prefer pnpm later; this scaffold installs with npm workspaces.)

## Current phase

**Phase 1 — Auth + Landing: done.** Next: **Phase 2 — Leagues + Invites**.

Details: [docs/STATUS.md](./docs/STATUS.md) · Plan: [docs/plans/02-leagues-invites.md](./docs/plans/02-leagues-invites.md)
