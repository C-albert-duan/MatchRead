# Architecture

```text
RapidAPI tennis provider (Mega facts)
      │  REST every 5 min + optional Mega socket on worker
      ▼
supabase/functions/sync-tennis   ← RAPIDAPI_KEY in Edge secrets
      │  pg_cron every 5 min (Vault ingest_secret) — no GitHub
      ├── rebuild-draw   (official seats / announced pairs)
      └── ingest-events → settle-leagues (when that match is finished)
      │
      ▼
Supabase Postgres — events → projections → standings / Daily Check
      │  (settle cron only regrades due finished matches newer than last snapshot)
      ▼
Leagues · brackets · standings · daily_check
      │
      ▼
apps/web (Next.js on Vercel, Server Components)
```

## Trust boundaries

1. **Client is never the source of truth.** Locks, pick secrecy, comment timing → Postgres triggers + RLS.
2. **`apps/web` holds only the anon key.** Never the service-role key on Vercel.
3. **`sync-tennis` holds `RAPIDAPI_KEY`** (Edge secret). `pg_cron` authenticates with Vault `ingest_secret`. Vercel never sees either.
4. **Internal UUIDs never reach the wire.** Pages use slugs / external refs; resolution is server-side.

## Packages

| Path | Role |
|---|---|
| `apps/web` | Product. Next.js App Router → Vercel |
| `packages/core` | Domain: grading, brackets, Daily Check. Zero runtime deps |
| `packages/tokens` | Colour, type, spacing CSS variables |
| `packages/i18n` | Locale catalogues (en first) |
| `supabase/migrations` | Schema + RLS |
| `supabase/functions` | Edge functions (`sync-tennis`, `rebuild-draw`, `ingest-events`) |

## Design system anchors

- **The read is charcoal; the data is Tournament Green.** A pick is ink until the tournament rules on it.
- Court colours = surface only (3px hairline).
- No shadows. Elevation = canvas / raised / sunken.
- Numbers: monospaced tabular.
- 4pt spacing scale. 44px minimum touch target.
- Motion: 120 / 220 / 340ms; respect `prefers-reduced-motion`.
- No state by colour alone — every bracket state has a word.

Visual reference: `Wireframe/MatchRead-main/matchread-spec/`.
