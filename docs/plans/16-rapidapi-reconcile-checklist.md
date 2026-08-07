# Phase 16 — RapidAPI reconcile → Vercel checklist

**Plan:** [16-rapidapi-reconcile.md](./16-rapidapi-reconcile.md)  
**Parent:** [15-rapidapi-tennis-provider.md](./15-rapidapi-tennis-provider.md)

Never put `RAPIDAPI_*` or `INGEST_SECRET` on Vercel.

---

## 16.1 Ingest arming

| # | Check | How |
|---|---|---|
| 1.1 | `ingest-events` deployed | `supabase functions deploy ingest-events` |
| 1.2 | `INGEST_SECRET` set | Supabase secrets + `.env.provider` |
| 1.3 | `MATCHREAD_INGEST_URL` set | `.env.provider` only |
| 1.4 | Manual JSON smoke | POST one `r0-m0` / `p-0` → row in `match_results` |
| 1.5 | Settle after smoke | Standings / grades update on web |

- [ ] Section 16.1 pass

---

## 16.2 Mapping

| # | Check | How |
|---|---|---|
| 2.1 | Migration for provider ids | `0010_provider_refs.sql` (columns + `provider_match_map`) |
| 2.2 | Pilot tournament chosen | Real RapidAPI `tournamentId` recorded |
| 2.3 | Seats mapped | ≥2 seats with `provider_player_id` (DB or `.provider-map.json`) |
| 2.4 | Match-key strategy written | Explicit `matches` map in JSON / `provider_match_map` |
| 2.5 | Fail closed | Unmapped winner → skip + log, no bad upsert |

- [x] 2.1, 2.4–2.5 (code + example map)
- [ ] 2.2–2.3 (owner picks pilot + fills real UUIDs/seats)

---

## 16.3 Reconcile script

| # | Check | How |
|---|---|---|
| 3.1 | Script exists | `scripts/reconcile-results.mjs` + `@matchread/provider-rapidapi` |
| 3.2 | Dry-run | `npm run reconcile:results -- --dry-run --map .provider-map.example.json` |
| 3.3 | Live ingest | POST → `{ ok: true, upserted: N }` (needs ingest deployed) |
| 3.4 | Quota note | Basic ≤50/day; no aggressive cron |
| 3.5 | Unit tests | `npm run test:provider` green |

- [x] 3.1–3.2, 3.4–3.5 (code)
- [ ] 3.3 live ingest (owner arms Edge Function)

---

## 16.4 Vercel proof

| # | Check | How |
|---|---|---|
| 4.1 | Winner on deployed app | Official results / bracket after reconcile |
| 4.2 | Settle on deployed app | Standings + Daily Check / result page |
| 4.3 | No RapidAPI on Vercel | Project env has no `RAPIDAPI_*` |

- [ ] Section 16.4 pass

---

## 16.5 Hardening (pre-slam)

| # | Check | How |
|---|---|---|
| 5.1 | Plan tier | Pro (or enough quota) if polling |
| 5.2 | Scheduled reconcile | GH Action / Railway — not Vercel |
| 5.3 | Optional settle cron | Off-Vercel service role |

- [ ] Section 16.5 pass (or deferred with note)

---

## Sign-off

| Role | Name | Date |
|---|---|---|
| Owner (pilot event + Vercel proof) | | |
| Engineer (mapping + reconcile) | | |
