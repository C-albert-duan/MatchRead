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
        │         (`writeWinnerIntoParent` / `healSettledAdvances`)
        │       → after that advance, delete `live_match_state` for the match
        │         (`clearsProvisionalLive` on `write`, `fill`, and `noop`).
        │         A later confirmation of the same winner deletes it again.
        │         The R0 bye settle in apply-draw deletes it after that bye write.
        │         A winner conflict does not clear it. A live frame never
        │         calls this writer.
        │       → a later different winner or void is kept and audited
        │         (`winner_conflict`); the conflict patch is empty, so a
        │         rejected answer cannot fill score or fact class.
        │         claim_settlement replace is not used for that conflict.
        │         Any update that does change winner_player_id clears the
        │         advanced parent side first (`matches_unwind_advanced_winner`)
        │       → archive `result` is the scoreline (`matches.official_score`).
        │         A retirement string such as a trailing `ret.` is stored as
        │         published when `result_type` is `retired`. Any other
        │         `result_type` is not settled and does not set `fact_kind`.
        │         Live `score` and socket frames are not a scoreline.
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
**Detail page:** `hasDraw` counts seats by `position` (seats have no `id`); bracket uses `published_at` + loaded seats. The page is a server render of settled structure: identity, the official sheet or the announced pairs, and stored schedule. A client island may rewrite a clock after mount. It does not fetch the draw. The settled bracket stays server HTML. `LiveMatchLayer` replaces live fields on the one cell whose `data-public-ref` is that match's `external_ref`. It does not construct the bracket in the browser.  
**Sheet read:** `loadTournamentReadModel` (`apps/web/lib/brackets/read-model.ts`) is the tournament read. It loads seats (player name, seed, country in that query) and `tournament_match_sheet` once, in parallel, then orders matches by round and index. Official state, score, winner, schedule, session, court, public ref, and stored sides come from that row set. Pass `leagueId` and `userId` and the same call also returns that member's picks and confidence in one brackets embed. There is no per-match or per-player follow-up. A 128-draw is those two reads: 128 seat rows and 127 sheet rows. The public page also reads one calendar row and one seat count before that. `buildViewerNodes` builds the round list once. The 127 nodes are server markup. `BracketScroller` is the one client island.  
**Match page:** `/matches/[ref]` is a server render. It reads `tournament_match_sheet` by public `external_ref`. A uuid or a bare numeric id is rejected before that read. A missing ref is HTTP 404 from `notFound()` and the segment `not-found`. It is not a blank page, a server error, an invented match, or a redirect. No segment `loading.tsx` wraps this page or any other public route: that fallback is what the first HTML would show. The `page.tsx` response is the server-rendered sheet, not a client fetch. Metadata is `generateMetadata` with `matchHref`. The page shows both stored sides, the round, and either the official score or the scheduled caption. Court and session appear only when stored. The tournament name links back to that event. The clock uses `matchScheduleCaption` with the venue zone, then UTC, so the sheet has no client island. The server sheet does not read live state or the listener. A match with no live row is the normal page, not an error. When the listener heartbeat is down or older than 90 seconds, `POST /api/live` returns no live rows and the overlay stays off. `LiveMatchLayer` portals `LiveScore` into the server slot on that page when a row exists. The landing shell omits the history control; other shells still render it. `apps/web/tests/match-route.test.ts` covers a settled sheet, a scheduled sheet (timed clock and TBA), an unknown ref, and a bare id or uuid.  
**Bracket:** the public page renders `BracketTree` (one horizontal column per round from the draw size, feeder keys, stored sides). Each slot’s vertical place is the midpoint of its two feeders. A public node is Scheduled or Official from the settled result. `live` and `provisional` are overlay states from `live_match_state`, painted onto the existing cell. A provisional finish shows that set score and a muted “Awaiting official result” line. It does not use the official result color, mark a winner, fill the next seat, or write the official score. A later-round name appears only when that side is already stored. Feeder lines are decorative CSS borders on that placement. The editor stays on `BracketGrid` and uses the same placement. The bracket stage scrolls horizontally by round. Columns stay wide enough to read a surname, including on a narrow page. The page scrolls vertically. The earliest unfinished round is the one aligned in that stage. A 128-draw is 127 matches rendered as server markup. One client island scrolls the stage and fills published clocks. Distant rounds stay in the document. Each round is a heading and an ordered list of matches. The stage is the labeled scroll region. Winner, Scheduled, and Official are text. A missing `scheduled_at` is TBA. `session` stays null unless the provider named day or night. Captured live, fixture, and info bodies have no session field, and a start clock is not one. There is no venue schedule table. `matches.court` is a published match label. Captured rows have none; the event surface on `tournament.court` is not written there, and a missing label stays null. The sheet renders that label when it is stored.  
**Freshness:** `AppShell` → `LiveRefresh` (~45s) re-fetches RSC from Postgres; facts
still arrive on sync-facts cron (~5m). `LiveMatchLayer` portals `LiveScore` into the server cell with that `data-public-ref`: badge, score, and a serve indicator only when that row's serving side is `a` or `b`. A null server leaves the cell with no serve mark. `liveNodePatch` drops `match_id` before that paint. One score updates the cells with that public ref. The bracket markup stays the server tree.
The snapshot read is `POST /api/live` → `getLiveTournamentState(tournamentRef)` in `server/repositories/live.ts`. The ref is the public tournament slug on `data-tournament-ref`. The JSON is canonical live display for that event: sets, game, serving side, phase, flag, and provisional winner ref. It does not include `match_id`, `tournament_id`, or provider payload fields. The browser client uses the anon key for the realtime channel on that table. It does not select the table itself.
A `provisional_final` row older than 24 hours is deleted by `sweep_terminal_live_state` on the existing `sync-facts-5m` job.
`upsert_live_match_state` keeps the stored row when the incoming `occurred_at` is equal or earlier.
The table is on `supabase_realtime`. `useLiveTournament` opens one topic `live:tournament:{ref}` per public tournament ref on the page. The filter is `tournament_id=eq.<id>` for that tournament. Match cells share that topic. There is not a channel per match, and there is not a second publication.
Official cells stay official. A hidden tab sets `html[data-tab-hidden]`, which pauses the live indicator animation. That pulse runs only on a live cell that is not stale, and `prefers-reduced-motion: reduce` turns it off. A hidden tab, on `visibilitychange` to visible, refetches the current projection, including when the channel has not reached the apply phase. That snapshot is the live display. Frames missed while hidden, and frames that arrive during that refetch, are not replayed. A frame whose `occurred_at` is equal or earlier
than the cell clock is not painted. A replay frame with no provider clock still
follows sequence. A channel error, timeout, closed socket, or offline browser retries at 1, 2, 4, 8, then 15 seconds, and after that refetches about every 30 seconds. A quiet in-play row is labeled stale after 45s, including the badge, so it does not stay marked live. A disconnect and a return to the foreground run that check immediately.
That label is `LIVE_STALE_MS`. During play, `LIVE_BROWSER_STALE_MS` (60s) without a successful live update or refetch shows a subdued banner that the updates are delayed and how many minutes have passed. The last score stays. Listener freshness is `STALE_AFTER_MS` (90s) and is not the cell label. Leaving the page unmounts `useLiveTournament`. That cleanup calls `removeChannel` on the browser client, so the topic does not stay open across navigation.

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

`scripts/capture-live-ndjson.mjs` records the existing REST live response, then the WTA calendar, and WTA fixtures, results, and info when a live row's `matchId` yields a tournament id. It does not write matches, seats, or live state. The printed report is path, status, and byte length. The API key is not written into the file. `getWsToken` still calls `GET /tennis/v2/extend/api/ws-token` and accepts only `success: true` plus a string `token`. `connectLive` uses that call with `RAPIDAPI_KEY` and optional `RAPIDAPI_HOST`. It does not open a socket. A reached `exp` claim logs `{ level: "info", name: "token_expired" }`, clears the token, fetches another, and continues on REST. The listener keeps that client across polls, including while a match is in play. The changed-frame set stays. A failed read drops the client and connects again. That refresh is not an incident. No proactive timer runs. The lifetime claim was not waited out. This repository has no commercial decision for that endpoint (price, entitlement, or whether it is in the contracted plan). None is inferred here. The output directory is gitignored because a token may be in the body. What those bytes showed is recorded in [docs/provider-capture-findings.md](../docs/provider-capture-findings.md). `openProviderSocket` stays closed: unset `MATCHREAD_LIVE_SOCKET` refuses the call, and setting it still refuses because no captured handshake shows how the token is attached.

## Listener forward

```text
apps/listener
  → connectLive (REST; no socket)
  → provider event id, ignoring receipt time
  → absence is recorded only, and only for an explicit snapshot label
  → one POST { mode: "live", liveFrames } for that tick
  → sync-facts live branch: validate, then the provider package
  → normalize, map, monotonic live upsert
  → platform_events stores each distinct raw payload
```

The listener logs one JSON tick line: counts in, mapped, unmapped, changed, and posted, plus lag and token age. About every 30 seconds it POSTs `listenerHeartbeat` with that latest tick and no secret. `sync-facts` stores it on `listener_health` id `listener`. A longer poll still wakes for that heartbeat and does not read the provider early. `flags` is 1 only when ingest returns `unmappedCarried` greater than 0. A large unmapped count is not that alarm. A failed read is the same line with `conn=down`, then a wait of 1, 2, 4, 8, 15, 30, then 60 seconds, ±20%. A successful read resets that wait. No successful read for 90 seconds is stale. The cell label stays 45 seconds. It does not write tables. Two processes both post. `sync-facts` `mode: "live"`, or a `liveFrames` array when mode is omitted, is that branch. It validates the body and delegates. The provider package normalizes, maps the provider event, and calls `upsert_live_match_state`. Every raw row is stored in `platform_events`. The content hash omits receipt time and secret fields, so a repeat stays one row and is not projected again. `SIGTERM` or `SIGINT` aborts an unfinished provider read or ingest POST and does not schedule another reconnect. That batch is not marked posted. A listener restart drops the in-memory comparison and posts that snapshot in one batch. Hashes already stored are not projected again. A duplicate does not write `matches` or advance a winner. A raw row that does not become a live score is also archived in `unmapped_live_events`. A tournament this product does not carry does not insert `ops_events`. There is no `live_events` table and no second ingest function. The response includes `carriedProviderIds` for provider tournament ids that matched one ingestion-enabled row. The monotonic upsert absorbs a repeated frame. Two different process ids inside 15 minutes insert `ops_events` `listener_overlap`. That warning does not skip the batch. The same raw rows from the second process stay one `platform_events` hash. A different older payload for that match is ignored, and the stored live row stays. `sync-facts` does not run calendar, draw, results, or settlement for that body.

## H. Live projection (not settlement)

```text
REST live row, or a replay line
  → canonicalLiveFrame (captured fields: score, points, indicator, InPlay, updatedAt)
  → mapFrameToMatch (event_map socket id, else player pair + tournament)
  → projectLiveFrame (newer sequence only; duplicate and rewind dropped)
  → upsert_live_match_state (earlier or equal occurred_at is a no-op)
  → live_match_state
  → browser Realtime → one bracket or match cell
```

A frame that does not map to one match is `ops_events` `unmapped_event` and a row in `unmapped_live_events`. When that frame belongs to a carried tournament, the ops payload includes `provider_tournament_id`. A frame for a tournament this product does not carry is archived without that ops row. That path does not write `live_match_state` or `matches`. It does not pick a match by start time or by player name. A socket id that already names one match still stores the score when a seat has no provider player. `serving_side` stays null. A frame with no socket id and no two-player pair is unmapped. One player id, a name, or `indicator` does not choose a side or a match. A malformed or unusual score does not become a break point or a match point. `stats` stays null, and a provider critical label is not written.

`npm run replay:live` and `npm run listen:live` replay a local file through `acceptForwardedLive`. The default file is `fixtures/prototype-timeline.json`. A capture NDJSON uses the same reader. Dry-run seeds an in-memory catalog and calls that function. `--write` calls it with the service role against tournaments the database already carries. `acceptForwardedLive` archives the raw payload, then `ingestLiveFrames` normalizes, maps, and calls `upsert_live_match_state`. That upsert keeps a newer same-source sequence and does not update `matches`. Unmapped frames are archived. The in-memory admin used by the harness applies the same upsert predicate as `0037_live_monotonic_upsert.sql`. `walkReplayClock` steps each event's own timestamp and does not sleep the gap, including an eleven-hour span. That instant is the injected `now` on `listener_health`. `normalizeLiveMatchState` rewrites `receivedAt` and `occurredAt` supplied by the caller and does not read the system clock. A pure unit test may call `normalizeLiveMatchState` or `replayLiveFrames` on its own. The listener does not open a provider socket. `sync-facts` runs the same projection after the official apply. `projectLiveBranch` calls `ingestLiveFrames`, which writes `live_match_state` only. `live-ingest.integration.test.js` sends a terminal socket-mapped frame through that function and checks the official match, seats, and settlement claims stay unchanged. The same file sends an unknown match through `acceptForwardedLive`. That row is archived in `platform_events` and logged, and it does not write `live_match_state`, an official match result, a draw seat, or a bracket score. A socket final may store `provisional_final` and does not set the official winner or advance a seat. `applyMatchResults` fills a missing official winner and score. A later live frame that disagrees leaves that official row in place. A miss on a carried tournament is archived and logged. A frame whose tournament is not carried, and a frame whose season id disagrees with the match id, are archived without an ops row. Player names and start time do not select a match. The same file applies an official result over a provisional live row. The official score and winner stay the REST fact, the parent receives that winner, and `ops_events` `live_rest_disagreement` keeps both scores and both winner refs. A later socket frame does not replace that official row. Finished live rows stay unsettled. `npm run ci:live-trust` rejects a settlement call or a later product surface in the live files. A frame whose score or winner ref differs from an already official match inserts `ops_events` `live_rest_disagreement` and does not change that match. A failed insert is an error response, and the listener sends that batch again. Reconciliation records the same row against the official fact the user sees, including when an incoming winner is refused. The founder alert list shows both scores and both winner refs. A replay line with `replayPhase: terminal` sets `phase = provisional_final` on the live row only. Provider rows do not. Sync-facts still counts finished live rows and does not settle them. After the official winner is written and the parent is advanced, `clearProvisionalLive` records that same disagreement when the stored live row differs, then deletes the live row. A later `fill` or `noop` confirmation deletes it again. A winner conflict does not. The browser drops the provisional paint and re-reads the server sheet. It does not mark a winner or advance a seat. Founder integrity reads the listener row: connection, heartbeat time, last provider event, and the tick counts. A heartbeat older than 2 minutes during `in_play` is the existing error mark. A provider event older than 5 minutes during `in_play` or `suspended` is the existing event mark. A high unmapped count is not an alarm. The event mark is an `unmapped_event` whose `provider_tournament_id` is a tournament this product carries. That id is `seasonId` when it is an id, otherwise the `matchId` tournament segment. Player names are not that id. The listener raises `flags` only when ingest returns `unmappedCarried` greater than 0. `live_rest_disagreement` is the error mark and does not replace the REST score. Stored `lag_ms` and the integrity warning code `freshness` are shown when present. It also reads `event_map` status counts. `apps/listener` posts changed raw frames. Compose and the web image do not start it. `matches` has no status column, so this path does not write `status = 'live'`. Browser refetch and channel failures call `reportError`.

The prototype timeline and the chaos file are synthetic. `fixtures/prototype-timeline.json` is that prototype as raw events, and `fixtures/live-replay/TIMELINE.ndjson` is the same events. `fixtures/live-replay/rest-capture.ndjson` uses the captured REST field names. `live-chaos.test.js` runs socket loss, token expiry, a duplicate frame, an out-of-order frame, a REST contradiction, listener restart, a Realtime disconnect, foreground recovery, an unknown event, and an unmapped serve. Frame cases go through `acceptForwardedLive`. Socket, token, listener, and browser cases call the production session and recovery functions. Each case checks the live result and leaves the official match unchanged. `live-invariants.test.js` uses a seeded generator in `node:test`. The same raw event and catalog return the same `normalizeCapturedFrame` state. A duplicate replay leaves `matches`, `seats`, and `brackets` unchanged. Any arrival order of one match's frames stores the same live row as sequence order, and an older frame does not replace that row. `live-replay-harness.test.js` replays the prototype and the gitignored M1 captures (`captures/live-raw.ndjson`, `fixtures/live-capture-oct-2026/frames.ndjson`) through `acceptForwardedLive` into `live_match_state`. `live-frame.test.js` still folds those captures with `replayLiveFrames`. `live-normalize.test.js` runs `normalizeCapturedFrame` on every distinct shape in those captures and on `fixtures/live-replay/TIMELINE.ndjson`. The same frame and catalog return the same state.

## M3 scale and security (baseline)

Deploy targets one listener replica (`.railway/railway.ts`). Correctness does not depend on that count. The listener’s in-memory `equalForIngest` only cuts POST size. Dedupe, ordering, and official safety stay on Postgres: `platform_events.content_hash` (secrets and receipt time omitted), `upsert_live_match_state` monotonic sequence, and live ingestion that never updates `matches`. Two instance ids within 15 minutes insert `ops_events` `listener_overlap` and still process the batch. There is no leader election, Redis cache, or read replica on this path.

**Load shape.** One provider poll is one `GET …/events/live` list. The listener posts one `sync-facts` body per tick: every changed raw row in feed order, plus an empty `liveFrames` heartbeat about every 30 seconds. Payload size scales with changed frames, not the full live tour count. `acceptForwardedLive` archives novel hashes, then `replayLiveFrames` normalizes in memory and collapses to one state per `match_id`. Writes are one `upsert_live_match_state` RPC per distinct match in that batch (not one RPC per duplicate frame in the batch). Realtime uses one Supabase channel per distinct public tournament ref on the page (`live:tournament:{ref}`), filtered by internal `tournament_id`; it is not one channel per match cell.

**Trust boundary.** `apps/web` reads only the anon key (`lib/env.ts`). Ingest is `POST sync-facts` with `Authorization: Bearer` matching `INGEST_SECRET`; there is no public ingest route. The ws-token string is kept in memory on the listener and is not logged; ticks log `token_age_s` or `{ name: "token_expired" }` only. Heartbeats and `listener_health` reject a raw token or key field. `rawEventBody` drops token, secret, and JWT-shaped strings before `platform_events` storage. Capture output is gitignored when a token may appear in the body. The browser sees `public_ref` live fields via `liveDisplayState` / `liveNodePatch`, not `match_id` or `tournament_id`. `live_match_state` RLS is select-only for anon and authenticated; writes are service role via Edge. `npm run ci:live-trust` scans live implementation files for settlement writers and official winner assignments.

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
| `apps/listener` | `sync-facts` `{ mode: "live", liveFrames }` | One request per tick. Does not settle |
| Ops `replay:live` | `acceptForwardedLive`, then `live_match_state` when `--write` | Replay `fixtures/prototype-timeline.json` or an M1 NDJSON capture. Does not settle `matches` |
| Ops `prove:cron` | `cron.job` / `cron.job_run_details` / Vault | Read-only. Requires `DATABASE_URL`. Fails closed when Vault secrets are missing: `return_message` `1 row` is not proof Edge ran. See [ops-scripts.md](./infrastructure/ops-scripts.md) |
| Ops `backfill:scorelines` | results archive, then `matches.official_score` | Dry-run unless `--write`. One archive request per tournament. Fills a null scoreline. Does not change the winner |
| Ops `backfill:session-court` | fixtures, then null `matches.session` / `matches.court` | Dry-run unless `--write`. Prints intended writes first. A remote URL also needs `--confirm-remote`. Copies an explicit day, night, or court label. Does not infer either from the clock, the event surface, or match order |
| Ops `backfill:provider-events` | stored live captures, then `provider_event_map` | Dry-run unless `--write`. Live id is not a fixture id. Inserts a row only for one proven player-pair match. Does not replace a row that already points elsewhere. A remote URL also needs `--confirm-remote` |
| CI | `ci:consumer-boundary` | Guard public read surface |
