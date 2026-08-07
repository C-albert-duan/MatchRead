# Plan 17 — Automated provider backend (no manual result upload)

**Status: PLANNED**  
**Depends on:** [16-rapidapi-reconcile.md](./16-rapidapi-reconcile.md) (ingest + map path proven)  
**Checklist:** [17-provider-backend-checklist.md](./17-provider-backend-checklist.md)  
**Runbooks:** [RAILWAY-WORKER.md](../runbooks/RAILWAY-WORKER.md) · [RECONCILE-RESULTS.md](../runbooks/RECONCILE-RESULTS.md) · [SETTLEMENT-SCHEDULING.md](../runbooks/SETTLEMENT-SCHEDULING.md)

## Goal

Deploy a small **backend worker** that holds `RAPIDAPI_KEY`, polls finished matches, writes results via `ingest-events`, and **settles** leagues — so **https://www.matchreadtennis.com** updates without laptop uploads or commissioner “Save result” for every match.

```text
                    ┌─────────────────────────────────────┐
                    │  Provider backend (Railway)         │
                    │  RAPIDAPI_KEY · INGEST_SECRET       │
                    │  optional SETTLE_SECRET             │
                    │                                     │
                    │  cron: reconcile → ingest           │
                    │  cron: settle active tournaments    │
                    └──────────────┬──────────────────────┘
                                   │
              RapidAPI ◄───────────┤
                                   ▼
                         ingest-events / settle-*
                                   ▼
                              Supabase Postgres
                                   ▼
                    Vercel www.matchreadtennis.com
                    (no RAPIDAPI_* — unchanged)
```

## What “backend” means here

| Is | Is not |
|---|---|
| Always-scheduled (or always-on) **worker** | A second public REST API for the browser |
| Holds RapidAPI + ingest secrets | Keys on Vercel / in Next.js |
| Writes through existing Edge Functions | Direct DB writes from worker (prefer ingest) |
| Auto settle after ingest | Replacing `@matchread/core` scoring |

Members still only use the Vercel site. The worker is invisible ops infrastructure.

## Why not “just put the key on Vercel”

Same trust boundary as Plans 15–16: public Next.js must not hold provider credentials. A dedicated worker (Railway / Fly / Render / GH Action on a schedule) is the product design.

## Done when

- [ ] Worker deployed with secrets; **no** `RAPIDAPI_*` on Vercel  
- [ ] Reconcile runs on a schedule without human trigger  
- [ ] Settlement runs automatically after new results (or on a short lag cron)  
- [ ] At least one **real** tournament fully mapped (players + match keys)  
- [ ] Live site shows new winners / standings without Official-results clicks  
- [ ] Founder can pause worker / see last-run health  
- [ ] RapidAPI plan quota matches poll cadence (Pro recommended)

## Out of scope (this plan)

- Live socket point-by-point (Phase G / full [RAILWAY-WORKER.md](../runbooks/RAILWAY-WORKER.md) socket) — REST poll is enough for “no manual upload”  
- Replacing commissioner lock / invite flows  
- Browser-facing MatchRead REST API  

---

## Phase 17.1 — Decide host (owner, 1 decision)

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **A. Railway cron / service** | Matches existing runbooks; simple env; paid always-on OK | Needs Railway account | **Default for launch** |
| **B. GitHub Actions schedule** | Already sketched in repo; free-ish | Secrets in GitHub; less “backend” feel; Actions minutes | Fine for beta |
| **C. Supabase `pg_cron` + Edge** | All in Supabase | RapidAPI key in Edge secrets; cold starts; harder mapping code | Avoid for v1 |

**Decision for this plan:** implement **A** as primary; keep **B** as fallback (workflow already exists).

---

## Phase 17.2 — Harden the worker package

Turn today’s one-shot script into a deployable job:

1. `apps/provider-worker` (or `scripts/` + Dockerfile) entrypoints:
   - `reconcile` — fetch results → map → POST ingest  
   - `settle` — settle all leagues for active `provider` tournaments  
   - `health` — last success timestamp (optional HTTP `/health`)  
2. Load mapping from:
   - **DB** (`tournaments.provider_tournament_id`, `draw_seats.provider_player_id`, `provider_match_map`) preferred for production  
   - Env/file map only for local/dev  
3. Idempotent: re-running same winners is safe (upsert).  
4. Structured logs: tournament id, upserted count, skipped count, settle count.  
5. Fail closed: unmapped matches skipped + alert log (no inventing seats).

---

## Phase 17.3 — Auto-settlement path

Ingest alone does not move standings (by design). Backend must settle.

1. New Edge Function `settle-tournament` (or extend ingest with optional `settle: true` behind a second secret) using **service role** only inside Edge:  
   - Input: `tournament_id`  
   - Runs same grading path as founder “Settle all leagues”  
2. Worker after successful reconcile: POST settle for that tournament.  
3. Or separate cron every N minutes: “settle if `match_results.settled_at` newer than last standings snapshot”.  

**Safety:** settle secret ≠ RapidAPI key; still never on Vercel web env.

---

## Phase 17.4 — Real tournament mapping (blocker for “real” UX)

Automated backend is useless if the only map is fictional `uso-2026`.

1. Pick launch event (e.g. US Open 2026 or next Masters).  
2. Import / seed draw seats with **real** names + `provider_player_id`.  
3. Build `provider_match_map` (fixture/result id → `r{round}-m{slot}`) — tooling to assist from RapidAPI draw/results.  
4. Set `tournaments.provider_tournament_id`.  
5. E2E: finished match → worker → site standings without UI clicks.

---

## Phase 17.5 — Deploy Railway (or chosen host)

1. Dockerfile: Node 22, `npm ci`, `node apps/provider-worker/...` or `npm run reconcile:results`.  
2. Railway service env:

| Variable | Purpose |
|---|---|
| `RAPIDAPI_KEY` | Provider |
| `RAPIDAPI_HOST` | Host header |
| `MATCHREAD_INGEST_URL` | Edge ingest URL |
| `INGEST_SECRET` | Ingest bearer |
| `MATCHREAD_SETTLE_URL` / `SETTLE_SECRET` | Auto settle |
| `RECONCILE_CRON` / platform cron | e.g. every 10–15 min (Pro plan) |

3. Health check + restart policy.  
4. Document rotate key: RapidAPI → Railway only (not Vercel).

---

## Phase 17.6 — Ops & quotas

1. Upgrade RapidAPI off Basic before sub-hourly polls (50/day is too small).  
2. Alerting: failed run → email/Slack (optional v1: Railway failure email).  
3. Founder kill switch: Railway pause service, or `PROVIDER_WORKER_ENABLED=false`.  
4. Keep Official results UI as emergency fallback.

---

## Suggested build order

| # | Deliverable | Unblocks |
|---|---|---|
| 1 | 17.1 host choice (Railway) | Deploy target |
| 2 | 17.3 settle Edge Function | Hands-free standings |
| 3 | 17.2 worker entry + DB-backed map load | Production config |
| 4 | 17.4 one real tournament mapped | Meaningful live data |
| 5 | 17.5 Railway deploy + cron | No laptop |
| 6 | 17.6 Pro plan + monitoring | Slam week safe |

## Owner decisions needed

1. **Host:** Railway vs stay on GitHub Actions only for beta?  
2. **Poll interval:** e.g. 15 min (needs Pro) vs 6 h (Basic).  
3. **Which tournament** is the first fully mapped live event?  
4. Budget: Railway + RapidAPI Pro (~$29+/mo API).

## Already done (do not redo)

- RapidAPI probe + `packages/provider-rapidapi`  
- `scripts/reconcile-results.mjs` + GitHub Action skeleton  
- `ingest-events` deployed (`--no-verify-jwt`) + `INGEST_SECRET`  
- Migration `0010_provider_refs`  
- Domain live on matchreadtennis.com  

## References

- [ARCHITECTURE.md](../ARCHITECTURE.md)  
- [SCENARIO-RAPIDAPI-RESULTS.md](../runbooks/SCENARIO-RAPIDAPI-RESULTS.md)  
- [ENVIRONMENT-VARIABLES.md](../ENVIRONMENT-VARIABLES.md)
