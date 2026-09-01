# Modules index

One doc per responsible package/app. Infrastructure (DB, Edge, CI) lives under [`../infrastructure/`](../infrastructure/).

| Module | Path | Owns | Does **not** own |
|--------|------|------|------------------|
| Web app | `apps/web` | UI, routes, server actions, anon Supabase client, product RPC calls | Tennis API, fact writes, service role, draw ingest |
| Core domain | `packages/core` | Bracket topology, grading, lock/eligibility, Daily Check (pure) | I/O, Supabase, Tennis API |
| Tennis provider | `packages/provider-rapidapi` | RapidAPI client, normalize, official draw parse, reconcile helpers | Browser bundle, product UI, direct DB writes |
| i18n | `packages/i18n` | Locale strings (`en` / `es` / `ja`) | Business rules |
| Design tokens | `packages/tokens` | CSS/token exports | Components |

**Hard boundary:** `apps/web` must never import `@matchread/provider-rapidapi`. Enforced by `npm run ci:consumer-boundary`.

Start from [../README.md](../README.md) for the system map, or [../data-flows.md](../data-flows.md) for request order.
