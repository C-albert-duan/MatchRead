# Plan 16 — Real-world results: RapidAPI reconcile → ingest → Vercel

**Status: IMPLEMENTATION STARTED** — package + reconcile script + migration 0010; owner still arms ingest + maps a pilot tournament.  
**Parent:** [15-rapidapi-tennis-provider.md](./15-rapidapi-tennis-provider.md) (Phase E, expanded)  
**Checklist:** [16-rapidapi-reconcile-checklist.md](./16-rapidapi-reconcile-checklist.md)  
**Runbook:** [RECONCILE-RESULTS.md](../runbooks/RECONCILE-RESULTS.md)

## Goal

After a real ATP/WTA match finishes, MatchRead’s **deployed Vercel app** shows the official winner and (after settle) updated standings / Daily Check — **without** putting `RAPIDAPI_*` on Vercel.

```text
RapidAPI fixtures/results
        │  scripts/reconcile-results.mjs  (local or Railway)
        │  holds RAPIDAPI_KEY + INGEST_SECRET
        ▼
supabase/functions/ingest-events
        │  upserts match_results
        ▼
Settlement (UI or cron — separate step)
        ▼
apps/web on Vercel  ← members only ever hit Supabase
```

## Why a dedicated plan

Probe (`npm run probe:rapidapi`) only proves auth. Real-world product value needs three hard pieces:

1. **Finished match detection** from RapidAPI  
2. **ID mapping** into MatchRead `match_key` + `winner_ref`  
3. **Ingest + settle** so the Vercel UI updates  

`uso-2026` today uses **fictional** seats (`p-0` … `p-15`). RapidAPI returns numeric player ids (e.g. `47275`). Reconcile cannot invent that mapping — it is the main engineering risk.

## Done when

- [ ] `ingest-events` deployed; `INGEST_SECRET` set in Supabase + `.env.provider`
- [ ] Mapping table (or documented seed) links provider tournament + player → MatchRead rows
- [ ] `scripts/reconcile-results.mjs` (or package bin) dry-runs and live-posts ingest payload
- [ ] One real finished match: RapidAPI → `match_results` → Settle → Vercel league/result pages correct
- [ ] Quota-safe cadence documented for Basic (50/day) vs Pro
- [ ] Vercel project env still has **zero** `RAPIDAPI_*`

## Out of scope

- Live socket / Railway always-on (Plan 15 Phase G / [RAILWAY-WORKER.md](../runbooks/RAILWAY-WORKER.md))
- Auto-settlement cron (can stay manual Settle for first proof)
- Replacing fictional `uso-2026` for all leagues until mapping proven on a **pilot** tournament
- Calling RapidAPI from Next.js / Vercel

---

## Phase 16.1 — Ingest arming (owner + engineer)

1. Deploy Edge Function:
   ```bash
   supabase functions deploy ingest-events
   supabase secrets set INGEST_SECRET=<long-random>
   ```
2. Add to **gitignored** `.env.provider` (never Vercel):
   ```
   MATCHREAD_INGEST_URL=https://<project-ref>.supabase.co/functions/v1/ingest-events
   INGEST_SECRET=<same-as-supabase>
   ```
3. Smoke ingest with a **known fixture** key (no RapidAPI yet):
   ```http
   POST …/ingest-events
   Authorization: Bearer <INGEST_SECRET>
   { "tournament_id": "<uso-2026 uuid>", "results": [{ "match_key": "r0-m0", "winner_ref": "p-0", "voided": false }] }
   ```
4. Open Vercel/local tournament Official results — winner visible; then **Run settlement**; standings move.

**Exit:** machine ingest path proven end-to-end with manual JSON.

---

## Phase 16.2 — Provider → MatchRead mapping (blocker)

### Problem

| RapidAPI field | MatchRead needs |
|---|---|
| `tournamentId` (number) | `tournaments.id` (uuid) + `ref` |
| fixture `id` / round | `match_key` (`r{round}-m{slot}`) |
| `player1Id` / `player2Id` / winner | `draw_seats.player_ref` |

Bracket grading only understands **our** `match_key` and seat `player_ref`. Wrong mapping = silent wrong grades.

### Approach (pilot first)

1. **Migration** (new): e.g. `0010_provider_refs.sql`
   - `tournaments.provider_tournament_id text null` (or int as text)
   - `draw_seats.provider_player_id text null`
   - Optional: `provider_match_map (tournament_id, provider_fixture_id, match_key)` if round topology is unreliable
2. **Pilot tournament** (prefer new ref, e.g. `pilot-atp-<event>`, not overwrite production fiction until safe):
   - Import or hand-seed seats with **real** last names + `provider_player_id`
   - Set `provider_tournament_id` from RapidAPI tournament list
3. **Match key strategy** (choose one, document in runbook):
   - **A (preferred for slam):** Reconstruct draw order from provider draw endpoint → assign `r0-m0`… same as core bracket builder; store map fixture→match_key  
   - **B (faster pilot):** Only ingest matches where both players already appear as seats; derive round from provider `roundId` + pair order — accept limited coverage  
4. **Winner resolution:** finished fixture → winner player id → lookup `draw_seats.provider_player_id` → `player_ref`; if missing → skip + log (fail closed)

**Exit:** written mapping for one real event; at least one seat row has `provider_player_id` filled.

---

## Phase 16.3 — Reconcile script (engineer)

`scripts/reconcile-results.mjs` (or `packages/provider-rapidapi` + thin script):

| Step | Behavior |
|---|---|
| Load env | `.env.provider`: `RAPIDAPI_*`, `MATCHREAD_INGEST_URL`, `INGEST_SECRET`, optional `RECONCILE_TOURNAMENT_REF` |
| Fetch | Date fixtures and/or tournament fixtures for mapped provider id |
| Filter | Status = finished / has winner (confirm field names from live payload) |
| Map | → `{ match_key, winner_ref, voided }` via Phase 16.2 tables (read-only Supabase anon+RPC **or** service role **only in this script**, never in web) |
| Dry-run | `--dry-run` prints JSON payload; no POST |
| Live | POST to `ingest-events`; print upserted count |
| Settle | **Do not** settle inside script for v1 — founder/commissioner clicks Settle (keeps blast radius small) |

Quota (Basic **50/day**):

- Default: one tournament, one date, max ~2–4 GETs per run  
- Document: do not cron every 5 min on Basic; upgrade to Pro before slam poll  

**Exit:** `--dry-run` shows correct `match_key`/`winner_ref` for a finished match; live POST upserts.

---

## Phase 16.4 — Prove on deployed Vercel (owner)

1. Run reconcile live against pilot tournament (from laptop or Railway one-shot).  
2. Open **Production/Preview** URL (no new env vars):  
   - Tournament Official results shows winner  
   - Commissioner/founder **Settle**  
   - League home Daily Check / standings / result page reflect real outcome  
3. Confirm Vercel env still has no `RAPIDAPI_*`.

**Exit:** screenshot or checklist sign-off — “real match → Vercel UI”.

---

## Phase 16.5 — Ops hardening (before US Open window)

1. Upgrade RapidAPI plan if polling > ~20 runs/day.  
2. Schedule reconcile (GitHub Action with secrets, or Railway cron) — still **not** Vercel.  
3. Optional: settle cron with service role off-Vercel ([SETTLEMENT-SCHEDULING.md](../runbooks/SETTLEMENT-SCHEDULING.md)).  
4. Retire or isolate fictional `uso-2026` once real draw import exists (may stay as design fixture).

---

## Suggested build order

| # | Deliverable | Depends |
|---|---|---|
| 1 | 16.1 ingest smoke | Supabase CLI access |
| 2 | 16.2 migration + one pilot mapped event | Founder picks real tournament |
| 3 | 16.3 reconcile `--dry-run` then live | 1–2 |
| 4 | 16.4 Vercel verification | 3 |
| 5 | 16.5 schedule + Pro plan | After 4 |

## Owner decisions needed

1. **Pilot event** — which ATP/WTA tournament id to map first (not necessarily US Open day one).  
2. **Commercial terms** — Basic OK for probe; Pro before continuous poll.  
3. **Key rotation** — key was pasted in chat; rotate and update `.env.provider` only.

## References

- Ingest contract: `supabase/functions/ingest-events/index.ts`  
- Manual UI path: `recordOfficialResult` / Official results panel  
- Probe: `npm run probe:rapidapi`  
- Architecture: [ARCHITECTURE.md](../ARCHITECTURE.md)
