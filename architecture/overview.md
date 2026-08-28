# Overview

MatchRead is an npm-workspaces monorepo for **tennis bracket leagues**: official main draws as facts, and leagues/picks/settlement as product.

## Monorepo layout

```text
mh-2/
├── apps/web/                 Next.js 14 product UI
├── packages/
│   ├── core/                 Domain rules (zero deps)
│   ├── provider-rapidapi/    Tennis API ingest helpers
│   ├── i18n/                 Copy
│   └── tokens/               Visual tokens
├── supabase/
│   ├── migrations/           Live schema chain 0001–0020
│   ├── functions/            Edge: sync-facts, settle-leagues
│   └── tests/                pgTAP / DB tests
├── scripts/                  Ops + CI probes
├── docker/                   Migrate image, entrypoints
├── architecture/             This documentation
└── discussion/               Design notes (not runtime)
```

Root `package.json` scripts point at the web app for `dev`/`build`, and at Node ops scripts for publish/reconcile/probes.

## Trust boundaries

| Actor | Credentials | May do |
|-------|-------------|--------|
| Browser / RSC | Supabase **anon** + user session | Read public facts & calendar; call product RPCs when authenticated |
| Web server | Same anon key only (`apps/web/lib/env.ts`) | Never holds `SUPABASE_SERVICE_ROLE_KEY` |
| Edge ingest | `INGEST_SECRET` + service role inside function | Upsert calendar, seats, matches, results |
| Ops scripts | Provider key + ingest URL/secret | Probe, publish, reconcile against hosted project |

Public discovery must use the **`public_calendar`** view (eligible events only), not raw `tournaments`. CI enforces this via `scripts/ci-consumer-boundary.mjs`.

## Non-negotiable product rules

- Show the **official main draw as published** (named seats, byes, Q/LL TBD). No fictional players or padded draw sizes.
- `lock_at` comes from the earliest **timed** first-round ball (`has_time = true`). Date-only fixtures are not a kickoff.
- Publish requires integrity proof (`draw_integrity_reports.safe_to_publish`) before write paths lock in an official field. A failed refresh must not unpublish an already-live sheet.
- Web never imports `@matchread/provider-rapidapi` — provider stays on the ingest/ops side.

## Where “flow” lives

Numbered request and data paths: [data-flows.md](./data-flows.md).  
Tables and relationships: [data-model.md](./data-model.md).
