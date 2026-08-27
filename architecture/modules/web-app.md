# Module: Web app (`apps/web`)

**Package:** `@matchread/web`  
**Role:** Product UI and authenticated write path into Supabase. Owns presentation, routing, and server actions — not Tennis API ingest.

## Boundaries

| Depends on | Must not |
|------------|----------|
| `@matchread/core`, `@matchread/i18n`, `@matchread/tokens` | Import `@matchread/provider-rapidapi` |
| `@supabase/ssr` with **anon** key | Hold `SUPABASE_SERVICE_ROLE_KEY` |
| RPCs for product writes | Direct client DML into product tables |

Clients: `lib/supabase/server.ts`, `client.ts`; session refresh in `middleware.ts`. Env surface: `lib/env.ts` (public URL/anon/site origin only).

## Architecture

```text
app/ (routes + RSC)
  │
  ├─ lib/tournaments/*     public_calendar, status, lock captions
  ├─ lib/brackets/*        load seats/matches/picks → core shapes
  ├─ lib/leagues/*         membership, covers, Daily Check wiring
  ├─ lib/auth/*            session, founder gate
  │
  └─ app/actions/*         "use server" → RPC + revalidatePath
         brackets | leagues | settlement | auth | profile

components/
  bracket/  league/  tournaments/  shell/  auth/  founder/

`AppShell` mounts `LiveRefresh` (~45s `router.refresh()`) on every routed page so
homepage, calendar, tournament, and league views reflect new facts after sync-facts
without a manual reload. Ingest remains batch (~5m cron); this only re-reads Postgres.
```

## Key routes

| Route | Responsibility |
|-------|----------------|
| `/` | Landing + open / on court / **awaiting draw** / upcoming calendar partitions |
| `/tournaments`, `/tournaments/[ref]` | Public calendar + official draw / announced R1 |
| `/enter/[ref]` | Solo league + jump into bracket |
| `/leagues`, `/leagues/new`, `/leagues/[slug]` | League list / create / home |
| `/leagues/[slug]/t/[ref]/bracket` | Bracket editor |
| `/leagues/[slug]/t/[ref]/result` | Results / breakdown |
| `/join/[token]` | Invite accept |
| `/sign-in`, `/welcome` | Auth + display name |
| `/founder/*` | Ops / integrity surfaces |

## Write path

1. Server Action authenticates session.
2. Calls security-definer RPC (`save_picks`, `create_league`, `ensure_solo_league`, …).
3. Revalidates affected paths.

Read path for discovery always goes through **`public_calendar`** (`lib/tournaments/calendar.ts`), not raw `tournaments`.

## Related

- Flows: [../data-flows.md](../data-flows.md) B–E  
- Domain math: [core.md](./core.md)  
- DB/RPC: [../infrastructure/supabase.md](../infrastructure/supabase.md)
