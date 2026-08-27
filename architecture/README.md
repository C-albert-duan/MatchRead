# MatchRead architecture

Start here. This folder explains **how the repo is split**, **how data moves**, and **where each responsibility lives**.

## How to read this folder

| Goal | Open |
|------|------|
| Big picture + trust boundaries | [overview.md](./overview.md) |
| End-to-end flows (ingest → UI → picks → settle) | [data-flows.md](./data-flows.md) |
| Entity relationships | [data-model.md](./data-model.md) |
| One module at a time | [modules/](./modules/) |
| Hosting, cron, CI, secrets, ops scripts | [infrastructure/](./infrastructure/) |

**Architecture** = product and domain modules (what the system *is*).  
**Infrastructure** = how it runs, deploys, syncs, and is operated (how it *ships*).

Docs stay live: always-applied rule `.cursor/rules/architecture-docs.mdc` requires updating this folder in the same turn as any architectural code change.

---

## System at a glance

```text
┌─────────────────────────────────────────────────────────────────┐
│  Tennis API (RapidAPI)                                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    packages/provider-rapidapi
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Edge: sync-facts  →  apply-draw / apply-results                │
│  Postgres (facts + product) + RLS + RPCs                        │
│  Edge: settle-leagues  →  grade submitted brackets              │
└───────────────────────────────┬─────────────────────────────────┘
                                │ anon key + session (never service role)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  apps/web  (Next.js)                                            │
│  reads public_calendar / seats / matches                        │
│  writes via RPCs: save_picks, create_league, …                 │
│  domain math from packages/core                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module map

| Module | Path | Owns |
|--------|------|------|
| [Web app](./modules/web-app.md) | `apps/web` | UI, routes, server actions, Supabase anon client |
| [Core domain](./modules/core.md) | `packages/core` | Bracket topology, grading, Daily Check, eligibility, lock soundness |
| [Provider](./modules/provider-rapidapi.md) | `packages/provider-rapidapi` | Tennis API client, normalize, official draw, reconcile |
| [i18n](./modules/i18n.md) | `packages/i18n` | Locale strings (`en` / `es` / `ja`) |
| [Tokens](./modules/tokens.md) | `packages/tokens` | Design tokens |

| Infrastructure | Path | Owns |
|----------------|------|------|
| [Supabase DB](./infrastructure/supabase.md) | `supabase/migrations` | Schema, RLS, RPCs, views, cron |
| [Edge functions](./infrastructure/edge-functions.md) | `supabase/functions` | `sync-facts`, `settle-leagues`, shared apply-* |
| [CI & deploy](./infrastructure/ci-and-deploy.md) | Docker, GitHub Actions | Build, test, migrate, optional sync trigger |
| [Environment](./infrastructure/environment.md) | `.env*` | Which secrets live where |
| [Ops scripts](./infrastructure/ops-scripts.md) | `scripts/` | Publish draws, probes, reconcile, trust checks |

---

## Mental model (two domains)

1. **Tennis facts** — tournaments, players, seats, matches, lock times, integrity. Written only by ingest (service role / Edge). Readable by the world.
2. **Product** — leagues, members, brackets, picks, settlement scores. Written by authenticated users through security-definer RPCs.

Pure-fact rules (no invented seats, names, or kickoffs) are product law — see `.cursor/rules/pure-fact.mdc` and `publish-complete-draw.mdc`.
