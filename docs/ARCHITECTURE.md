# Architecture

```text
RapidAPI tennis provider
      │  socket (live) + REST (sweep)
      ▼
Listener container (Railway) ── optional for invited beta ──┐
      │  POST only, parses nothing                          │
      ▼                                                     │
supabase/functions/ingest-events ◄──────────────────────────┘
      │
      ▼
Supabase Postgres — events → projections
      │
      ▼
Settlement (packages/core + edge/cron) — MUST be scheduled for standings to move
      │
      ▼
Leagues · brackets · standings · daily_check
      │
      ▼
apps/web (Next.js on Vercel, Server Components)
```

## Trust boundaries

1. **Client is never the source of truth.** Locks, pick secrecy, comment timing → Postgres triggers + RLS.
2. **`apps/web` holds only the anon key.** Never the service-role key on Vercel.
3. **Listener holds provider credentials**, not broad DB access — authenticates to `ingest-events` only.
4. **Internal UUIDs never reach the wire.** Pages use slugs / external refs; resolution is server-side.

## Packages

| Path | Role |
|---|---|
| `apps/web` | Product. Next.js App Router → Vercel |
| `packages/core` | Domain: grading, brackets, Daily Check. Zero runtime deps |
| `packages/tokens` | Colour, type, spacing CSS variables |
| `packages/i18n` | Locale catalogues (en first) |
| `supabase/migrations` | Schema + RLS |
| `supabase/functions` | Edge functions (ingest, settle helpers) |

## Design system anchors

- **The read is charcoal; the data is Tournament Green.** A pick is ink until the tournament rules on it.
- Court colours = surface only (3px hairline).
- No shadows. Elevation = canvas / raised / sunken.
- Numbers: monospaced tabular.
- 4pt spacing scale. 44px minimum touch target.
- Motion: 120 / 220 / 340ms; respect `prefers-reduced-motion`.
- No state by colour alone — every bracket state has a word.

Visual reference: `Wireframe/MatchRead-main/matchread-spec/`.
