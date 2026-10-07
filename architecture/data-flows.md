# Data flows

How work moves through the repo. Pair with [data-model.md](./data-model.md) for entities and [modules/](./modules/) for owners.

---

## A. Provider → database (facts ingest)

```text
pg_cron / GitHub / ops script
        │  POST /functions/v1/sync-facts  (INGEST_SECRET)
        ▼
sync-facts (Edge)
        │  packages/provider-rapidapi
        ├─ calendar upsert → tournaments
        ├─ official seats → classifyDraw (reject qualifying) → integrity → apply-draw
        │       → a present `providerMatchIds` list skips this draw write
        │         (`syncEventDraw` returns before fixtures, archive load,
        │         overlay, and `applyMatchFacts`); an omitted list still
        │         reconciles the full draw
        │       → integrity first (before wipe): fail unpublished → no seats written;
        │         fail when already published → keep live sheet, ops alert, no unpublish
        │         (`impossible_byes` when bye count exceeds the official slot-field
        │          ceiling, or a first-round pair is bye vs bye; TBD is not a bye)
        │       → pass → players, seats, matches, schedule, published_at
        │       → after publish: overlay `bye_to_tbd` on official TBD seats,
        │         unwind invented R0 bye-advance when the parent is unplayed;
        │         announced fixtures do not rewrite R0 sides or append
        │         extra indices; prune index>=draw_size/2; refresh sides from seats
        ├─ results archive → apply-results
        │         (a finished live frame is counted and not settled)
        │       → optional `providerMatchIds` keeps only those archive rows
        │         before bind, id-map, provider-id updates, Shape B, and apply;
        │         omitted list still plans the full archive
        │       → the same results call classifies players missing from the
        │         local draw against fixtures already loaded for the draw
        │         (fetched here only when that pass did not) and tournament
        │         info. No second scheduler. An ingestion gap or an
        │         unexplained absence returns before apply-results, including
        │         the bye heal
        │       → Shape A pair-first bind (exactly one occupant-compatible
        │         later-round partial; R0 is not a partial target; a foreign
        │         canonical provider_match_id is not a candidate; zero stays
        │         unbound; two valid later-round holes fail closed) then
        │         an emitted binding clears that provider_match_id on any
        │         other match in the tournament and assigns it to the bound
        │         match (`planProviderMatchRelocation`); the release writes
        │         only `provider_match_id`, so the previous holder's winner,
        │         sides, and settled_at stay. Fail-closed binds release nothing.
        │         apply-results fill/advance;
        │         Shape B create/fill R0 from
        │         results archive + official seats (fail closed; heal wrong sides)
        │       → first settle writes matches, then claim_settlement, then parent advance
        │       → provisional_winner is not a column yet. When M3 adds it,
        │         clear it only after that durable official write (and after
        │         the R0 bye settle in apply-draw). A winner conflict does not clear it.
        │       → a later different winner or void is kept and audited
        │         (`winner_conflict`); claim_settlement replace is not used
        │       → archive `result` is the scoreline (`matches.official_score`).
        │         A retirement string such as a trailing `ret.` is stored as
        │         published. Live `score` and socket frames are not a scoreline.
        │         A finished live winner id is not written onto `matches`.
        │       → null official_score / fact_kind may be filled, including on
        │         a winner conflict; a different score or fact class is kept
        │         and the skip reason names that conflict
        │       → a match select error fails the results run (`matchLookupFromQuery`);
        │         it is not treated as a missing match. The public loader throws
        │         on that error instead of returning winners with a null score.
        │       → a player missing from the local draw is a withdrawal only
        │         when also absent from the fixture list and the entry list.
        │         Present upstream is an ingestion gap. An unloaded list is
        │         unexplained. Either of those holds settlement and writes
        │         ops_events kind `error` with public ref, slug, tour, and
        │         provider tournament id (`absenceObservability`).
        │         A withdrawal stays kind `reconcile`. No S1 type. When
        │         `SENTRY_DSN` is set, a gap or unexplained absence is also
        │         sent from sync-facts. An empty DSN does not send.
        └─ refresh_lock_at (min timed R0 scheduled_at)
```

**Entry:** `supabase/functions/sync-facts/index.ts`  
**Persist:** `_shared/apply-draw.ts`, `_shared/apply-results.ts` (findMatch prefers `match_key` over stale `provider_match_id`; claim after write)  
**Provider:** `packages/provider-rapidapi` (`official/classify-draw.js`, `parse-draw.js`, pair-first `bindResultsByPlayerPair`)  
**Draw seats:** `parse-draw.js` copies official first-round sides. The Tennis API placeholder `{ id: 3700, name: "Unknown Player" }` is a bye only when that match has `result: "bye"`; the same object with empty `result` is a Q/LL TBD seat. After the bye is consumed the API drops that object: JSON `null` / omitted opposite a named player (empty `result`) is an official bye, not TBD. Name/id, seed-corner placement, and draw size never invent a bye.

---

## B. Public discovery (read path)

```text
apps/web pages
  → lib/tournaments/calendar.ts
  → public_calendar (view)
  → bracket UI only if published_at + official seats (hasDraw)
  → else: draw pending / countdown / announced matchups only
```

**Entry:** `apps/web/app/page.tsx`, `app/tournaments/[ref]/page.tsx`  
**Rule:** never invent a bracket; never render seats when `published_at` is null.  
**Detail page:** `hasDraw` counts seats by `position` (seats have no `id`); bracket uses `published_at` + loaded seats.  
**Freshness:** `AppShell` → `LiveRefresh` (~45s) re-fetches RSC from Postgres; facts
still arrive on sync-facts cron (~5m).

**Clock:** civil tournament dates (`starts_on`, `ends_on`, `main_draw_starts_on`) stay calendar dates (`dates.ts`, month via `formatUtcMonth`). A match row with `has_time` false shows the UTC calendar day of `scheduled_at` and no clock, in every viewer zone. Timed match instants, announced pairs, and the entry-lock clock all use `lib/tournaments/format.ts` in the viewer IANA zone. Tournament, bracket, and calendar surfaces call those helpers. A missing or unreadable calendar date is the TBC label, not the raw column. `profiles` has no `time_zone`; `useViewerTimeZone` is the browser zone after mount and null on the server, so the line is omitted until that zone is known. A caption that must render uses the venue zone, then UTC. A US evening ball stays on that viewer's calendar day.

---

## C. Auth → league → picks

```text
Sign-in (magic link / OAuth)
  → auth/callback + middleware session refresh
  → profile / display name

Solo:  /enter/[ref]  → ensure_solo_league RPC
Group: create_league / join_with_invite RPCs

Bracket editor
  → actions/brackets.ts → save_picks RPC (autosave ~1.2s debounce)
  → submit_bracket when complete (draw_size - 1 picks)
     always runs save_picks with the latest sheet first so Submit
     cannot race the debounce (“No bracket to submit”)

Blocked when picks_are_locked:
  commissioner league_tournaments.locked_at
  OR (lock_at <= now() AND draw_is_official)
```

**Entry:** `apps/web/app/actions/brackets.ts`, `app/actions/leagues.ts`  
**Gate:** Postgres RPCs in `0006_rls_and_rpcs.sql` (not UI-only).

---

## D. Settlement (score product)

```text
Matches get settled_at + winner/void (facts path A)
        │
        ▼
settle-leagues Edge (cron ~15m)
  → grade submitted brackets (Edge copy of core grade)
  → update brackets.points / rank

Alternate: commissioner/founder settleLeagueTournament
  → apps/web/app/actions/settlement.ts + @matchread/core in-process

UI: Daily Check (pulse), standings, result breakdown
```

**Entry:** `supabase/functions/settle-leagues/index.ts`  
**Math:** `packages/core` (`grade.ts` / `scoring.ts`); Edge uses `_shared/core.js` copy. The copy is not loaded with `npm:@matchread/core`. A parity test keeps the two grades aligned.

---

## E. Lock timeline

```text
1. First timed main-draw R0 ball written → refresh_lock_at → tournaments.lock_at
2. Optional early close: commissioner lock_league_event
3. After lock + official draw: save_picks / submit_bracket refuse writes
```

Date-only schedule rows do **not** set `lock_at`.

---

## F. Trust / eligibility (what users can see)

```text
tournaments.tier + tour + product_override(force_off only)
  → bracket_eligible (generated / policy)
  → public_calendar filters to eligible rows
  → new brackets only if bracket_eligible (DB trigger)
```

Demoting an event stops discovery; existing brackets are not cascade-deleted (settlement can continue).

---

## G. Raw provider capture (not ingest)

```text
scripts/capture-live-ndjson.mjs
  → createFrameRecorder (append-only NDJSON)
  → createClient({ onRawBody }) keeps the HTTP body text
  → runLiveCapture writes that text, then a path/status/bytes report
  → fixtures/live-capture-oct-2026/frames.ndjson
```

There is no `apps/listener` and no socket client. The script records the existing REST live response, then the WTA calendar, and WTA fixtures, results, and info when a live row's `matchId` yields a tournament id. It does not write matches, seats, or live state. The printed report is path, status, and byte length. The API key is not written into the file. `getWsToken` still calls `GET /tennis/v2/extend/api/ws-token`. This repository has no commercial decision for that endpoint (price, entitlement, or whether it is in the contracted plan). None is inferred here. The output directory is gitignored because a token may be in the body. What those bytes showed is recorded in [docs/provider-capture-findings.md](../docs/provider-capture-findings.md).

A prototype replay timeline named TIMELINE is not in this repository. No fixture was invented for it.

---

## Quick “who calls whom”

| From | To | Why |
|------|----|-----|
| Cron / Vault | `sync-facts` | Keep calendar, draws, results fresh |
| Cron | `settle-leagues` | Score submitted brackets |
| Web RSC | `public_calendar`, seats, matches | Show official field |
| Web actions | Product RPCs | Create leagues, save picks |
| Ops `publish:draws` | sync-facts / apply path | Manual verified publish |
| Ops `capture:live` | provider HTTP only | Raw NDJSON under `fixtures/live-capture-oct-2026/` |
| Ops `prove:cron` | `cron.job` / `cron.job_run_details` | Read-only. BLOCKED while `DATABASE_URL` is unset; see [supabase.md](./infrastructure/supabase.md) |
| Ops `backfill:scorelines` | results archive, then `matches.official_score` | Dry-run unless `--write`. One archive request per tournament. Fills a null scoreline. Does not change the winner |
| CI | `ci:consumer-boundary` | Guard public read surface |
