# Plan 15 — RapidAPI tennis provider integration

**Status: PLAN ONLY** — no key in repo; web app must never hold `RAPIDAPI_*`.  
**Checklist:** [15-rapidapi-tennis-provider-checklist.md](./15-rapidapi-tennis-provider-checklist.md)  
**Runbooks:** [TENNIS-PROVIDER.md](../runbooks/TENNIS-PROVIDER.md) · [INGEST.md](../runbooks/INGEST.md) · [RAILWAY-WORKER.md](../runbooks/RAILWAY-WORKER.md)

## Goal

Use the RapidAPI **Tennis API — ATP WTA ITF** product to feed calendar, rankings, draws, and official results into MatchRead via the existing ingest path — without putting provider secrets on Vercel.

## Provider identity (confirmed from founder)

| Field | Value |
|---|---|
| Product | Tennis API - ATP WTA ITF (RapidAPI) |
| Host | `tennis-api-atp-wta-itf.p.rapidapi.com` |
| Headers | `X-RapidAPI-Key`, `X-RapidAPI-Host` |
| Example REST | `GET /tennis/v2/atp/ranking/singles?race=true` |
| Useful groups | Fixtures, Players, Tournament, Rankings, Live Events |

**Still founder-owned:** subscription tier, monthly quota, rate limits, commercial-use terms. Fill those in [TENNIS-PROVIDER.md](../runbooks/TENNIS-PROVIDER.md) day-one checklist before relying on a sweep cadence.

## Trust boundary (do not weaken)

| Provider trusted for | Never trusted for |
|---|---|
| Match status, score, winner | Scoring formula / pick rules (`@matchread/core`) |
| Player identity, ranking | Bracket topology (verify reconstruction) |
| Schedule / start times | What retirement means for a pick |
| Draw entries / seeds | Anything asserted without core verification |

Architecture reminder ([ARCHITECTURE.md](../ARCHITECTURE.md)):

```text
RapidAPI → listener/worker (holds RAPIDAPI_*) → ingest-events → Postgres → settlement → apps/web
```

`apps/web` / Vercel: **no** `RAPIDAPI_KEY`, **no** service role.

## Done when

- [ ] Key rotated if ever pasted into chat/screenshots; stored only in local/Railway secrets
- [ ] `packages/provider-rapidapi` REST client + typed responses for the endpoints we use
- [ ] Local probe script proves auth + one ranking + one fixtures call
- [ ] Mapping doc: provider tournament/match/player → `tournaments` / `match_key` / `winner_ref`
- [ ] REST reconcile job can upsert results through `ingest-events` (or documented founder dry-run)
- [ ] Rankings/calendar pages can optionally read **cached** DB projections (not live RapidAPI from the browser)
- [ ] Socket listener deferred or scheduled as follow-on (public-window live scores)

## Work (phased)

### Phase A — Secrets & confirmation (owner, 1 session)

1. **Rotate** the RapidAPI key if it appeared in a screenshot or chat (assume leaked).
2. Subscribe / confirm plan on RapidAPI (“Subscribe to Test” is not enough for production quota).
3. Record tier, quota, rate limit, commercial terms in [TENNIS-PROVIDER.md](../runbooks/TENNIS-PROVIDER.md).
4. Store secrets **outside** git:
   - Local: gitignored file e.g. `.env.provider` (or OS secret store) — **not** `.env.docker` for the web container unless a separate provider profile.
   - Later: Railway (or equivalent) service env only.
5. Variables:

| Variable | Where | Notes |
|---|---|---|
| `RAPIDAPI_KEY` | Provider worker / local scripts only | `X-RapidAPI-Key` |
| `RAPIDAPI_HOST` | Same | `tennis-api-atp-wta-itf.p.rapidapi.com` |
| `MATCHREAD_INGEST_URL` | Worker | Edge `ingest-events` URL |
| `INGEST_SECRET` | Worker + Supabase secrets | Bearer for ingest |

Never add these to Vercel project env.

### Phase B — Package scaffold (engineer)

1. Create workspace package `packages/provider-rapidapi`:
   - `createClient({ key, host })`
   - `get`, jittered backoff, error types (401/403/429)
   - No Supabase dependency; no browser bundling into `apps/web`
2. Wire into root workspaces / TypeScript project references as needed.
3. Unit-test transport with mocked `fetch` (no live key in CI).

### Phase C — Endpoint map & probe (engineer + founder)

1. Inventory endpoints we need for beta vs launch:

| Product need | Candidate API area | Consumed by |
|---|---|---|
| Rankings page | Rankings (ATP/WTA singles) | Cached projection → `/players` |
| Calendar / fixtures | Fixtures (`getDateFixtures`, tournament fixtures) | Landing calendar / Daily Check start times |
| Draw import | Tournament | Future `import-draw` / founder seed |
| Official winners | Fixtures / live / completed matches | → `ingest-events` → `match_results` |

2. Script `scripts/probe-rapidapi.mjs` (or `tsx`): ranking + one fixture call; print truncated JSON; exit non-zero on auth failure.
3. Capture one real response under `fixtures/<event>/` (git-safe: **strip keys**; commit samples only if license/ToS allow).

### Phase D — Domain mapping (engineer)

1. Define stable IDs:
   - Provider tournament id → `tournaments.external_ref` (or equivalent column; migrate if missing)
   - Provider match id → MatchRead `match_key` (`r{round}-m{index}` or provider key + mapping table)
   - Provider player id → seat `player_ref` / players table
2. Fail closed when draw size / seeding cannot be verified against `@matchread/core` rules.
3. Document disruption cases (retirement, walkover) once the API exposes them — Geneva-style captures often lack these.

### Phase E — REST reconcile → ingest (beta path)

**Expanded plan:** [16-rapidapi-reconcile.md](./16-rapidapi-reconcile.md) (real-world results visible on Vercel).

1. Deploy / confirm `supabase/functions/ingest-events` + `INGEST_SECRET` ([INGEST.md](../runbooks/INGEST.md)).
2. Provider → `match_key` / `winner_ref` mapping (migration + pilot tournament).
3. Worker or scheduled script:
   - Poll fixtures/results for active tournament(s)
   - Map to `{ tournament_id, results: [{ match_key, winner_ref, voided }] }`
   - `POST` ingest; **do not** settle inside the provider package (v1)
4. Settlement remains founder UI / cron (service role **not** on Vercel) — [SETTLEMENT-SCHEDULING.md](../runbooks/SETTLEMENT-SCHEDULING.md).
5. Cadence: start conservative; Basic is 50/day — upgrade before slam poll.
6. Prove on deployed Vercel: winner + settle → standings/Daily Check (no `RAPIDAPI_*` on Vercel).

### Phase F — Product surfaces (optional for first merge)

1. Prefer writing projections to Postgres; web reads Supabase only.
2. Rankings / tournaments routes stay offline-friendly if provider is down.
3. Keep commissioner **Official results** UI as fallback for beta.

### Phase G — Live socket (public window, later)

1. Only after REST path is proven in a real match week.
2. Always-on Railway worker per [RAILWAY-WORKER.md](../runbooks/RAILWAY-WORKER.md): socket → raw POST ingest; parse in Edge/core.
3. Cross-link Phase 13 public-window arming.

## Out of scope (this plan)

- Putting RapidAPI calls in Next.js Server Actions or client components
- Replacing `@matchread/core` scoring with provider “points”
- CEO Tier 2–3 ([Phase 14](./14-ceo-tier2-tier3.md))
- Committing live API keys or full quota dumps

## Suggested implementation order

1. Phase A (owner) — rotate key, confirm plan, env file  
2. Phase B + C — package + probe green  
3. Phase D + E — one tournament end-to-end: provider result → ingest → settle → standings move  
4. Phase F as needed for US Open calendar  
5. Phase G only if poll latency is unacceptable for launch  

## References

- [ARCHITECTURE.md](../ARCHITECTURE.md)  
- [ENVIRONMENT-VARIABLES.md](../ENVIRONMENT-VARIABLES.md)  
- [13-public-window.md](./13-public-window.md)  
- Wireframe handoff: `Wireframe/MatchRead-main/Engineer Handoff/TENNIS-PROVIDER.md`
