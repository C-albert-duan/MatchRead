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
        │         (`winner_conflict`); the conflict patch is empty, so a
        │         rejected answer cannot fill score or fact class.
        │         claim_settlement replace is not used for that conflict.
        │         Any update that does change winner_player_id clears the
        │         advanced parent side first (`matches_unwind_advanced_winner`)
        │       → archive `result` is the scoreline (`matches.official_score`).
        │         A retirement string such as a trailing `ret.` is stored as
        │         published. Live `score` and socket frames are not a scoreline.
        │         A finished live winner id is not written onto `matches`.
        │       → null official_score / fact_kind may be filled when the winner
        │         is unchanged; a different score or fact class is kept and
        │         the skip reason names that conflict
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
**Detail page:** `hasDraw` counts seats by `position` (seats have no `id`); bracket uses `published_at` + loaded seats. The page is a server render of settled structure: identity, the official sheet or the announced pairs, and stored schedule. A client island may rewrite a clock after mount. It does not fetch the draw, and there is no live-state island. The settled bracket stays server HTML. A later live patch replaces fields on the one cell whose `data-public-ref` is that match's `external_ref`. It does not construct the bracket in the browser.  
**Sheet read:** `loadTournamentReadModel` (`apps/web/lib/brackets/read-model.ts`) is the tournament read. It loads seats (player name, seed, country in that query) and `tournament_match_sheet` once, in parallel, then orders matches by round and index. Official state, score, winner, schedule, session, court, public ref, and stored sides come from that row set. Pass `leagueId` and `userId` and the same call also returns that member's picks and confidence in one brackets embed. There is no per-match or per-player follow-up. A 128-draw is those two reads: 128 seat rows and 127 sheet rows. The public page also reads one calendar row and one seat count before that. `buildViewerNodes` builds the round list once. The 127 nodes are server markup. `BracketScroller` is the one client island.  
**Match page:** `/matches/[ref]` is a server render. It reads `tournament_match_sheet` by public `external_ref`. A uuid or a bare numeric id is rejected before that read. A missing ref is HTTP 404 from `notFound()` and the segment `not-found`. It is not a blank page, a server error, an invented match, or a redirect. No segment `loading.tsx` wraps this page or any other public route: that fallback is what the first HTML would show. The `page.tsx` response is the server-rendered sheet, not a client fetch. Metadata is `generateMetadata` with `matchHref`. The page shows both stored sides, the round, and either the official score or the scheduled caption. Court and session appear only when stored. The tournament name links back to that event. The clock uses `matchScheduleCaption` with the venue zone, then UTC, so the sheet has no client island. It does not read live state. A match with no live row is the normal page, not an error. The landing shell omits the history control; other shells still render it. `apps/web/tests/match-route.test.ts` covers a settled sheet, a scheduled sheet (timed clock and TBA), an unknown ref, and a bare id or uuid.  
**Bracket:** the public page renders `BracketTree` (one horizontal column per round from the draw size, feeder keys, stored sides). Each slot’s vertical place is the midpoint of its two feeders. A public node is Scheduled or Official from the settled result. In-progress and unfinished-final states extend `MatchSheetState` later and are not produced. A later-round name appears only when that side is already stored. Feeder lines are decorative CSS borders on that placement. The editor stays on `BracketGrid` and uses the same placement. The bracket stage scrolls horizontally by round. Columns stay wide enough to read a surname, including on a narrow page. The page scrolls vertically. The earliest unfinished round is the one aligned in that stage. A 128-draw is 127 matches rendered as server markup. One client island scrolls the stage and fills published clocks. Distant rounds stay in the document. Each round is a heading and an ordered list of matches. The stage is the labeled scroll region. Winner, Scheduled, and Official are text. A missing `scheduled_at` is TBA. `session` stays null unless the provider named day or night. Captured live, fixture, and info bodies have no session field, and a start clock is not one. There is no venue schedule table. `matches.court` is a published match label. Captured rows have none; the event surface on `tournament.court` is not written there, and a missing label stays null. The sheet renders that label when it is stored.  
**Freshness:** `AppShell` → `LiveRefresh` (~45s) re-fetches RSC from Postgres; facts
still arrive on sync-facts cron (~5m).

**Clock:** civil tournament dates (`starts_on`, `ends_on`, `main_draw_starts_on`) stay calendar dates (`dates.ts`, month via `formatUtcMonth`). A provider date with no real clock — a bare `YYYY-MM-DD`, or midnight `T00:00` with or without an offset — is one civil date. `parseFixtureInstant` (`packages/provider-rapidapi/src/fixture-instant.js`) is the only parser; the official overlay uses it too. It stores that date at noon UTC with `has_time` false. A clock with no offset is stored as that UTC clock, not the ingest machine's zone. Display of a missing clock — `has_time` false, or a UTC midnight stamp — is the UTC calendar day plus “Time to be announced”, on the bracket, find, announced pairs, and official results, including before the viewer zone is known (`matchWhenTimeZone`). Noon and midnight are not rendered as the match time. Timed match instants and the entry-lock clock use `lib/tournaments/format.ts` in the viewer IANA zone and stay hidden until that zone is known. A missing or unreadable calendar date is the TBC label, not the raw column. `profiles` has no `time_zone`; `useViewerTimeZone` is the browser zone after mount and null on the server. A caption that must render uses the venue zone, then UTC. A US evening ball stays on that viewer's calendar day.

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
| Ops `prove:cron` | `cron.job` / `cron.job_run_details` / Vault | Read-only. Requires `DATABASE_URL`. Fails closed when Vault secrets are missing: `return_message` `1 row` is not proof Edge ran. See [ops-scripts.md](./infrastructure/ops-scripts.md) |
| Ops `backfill:scorelines` | results archive, then `matches.official_score` | Dry-run unless `--write`. One archive request per tournament. Fills a null scoreline. Does not change the winner |
| Ops `backfill:session-court` | fixtures, then null `matches.session` / `matches.court` | Dry-run unless `--write`. Prints intended writes first. A remote URL also needs `--confirm-remote`. Copies an explicit day, night, or court label. Does not infer either from the clock, the event surface, or match order |
| CI | `ci:consumer-boundary` | Guard public read surface |
