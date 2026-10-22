# Module: Provider RapidAPI (`packages/provider-rapidapi`)

**Package:** `@matchread/provider-rapidapi`  
**Role:** Tennis API client and fact pipeline helpers — normalize, official draw parse/overlay, reconcile results, live session helpers.

**Not used by the web app.** Consumed by Edge `sync-facts`, the listener, and ops scripts.

## Architecture

```text
HTTP client (index.js)
  calendar / fixtures / results / draw / seeds / live
        │
        ├─ normalize.js + assert.js     tour/tier/surface/name; fail closed
        ├─ official/classify-draw.js    main_singles vs qualifying/doubles
        ├─ official/*                   parse, hash, diff, overlay fixtures
        ├─ reconcile-provider.js        results → match keys / advances
        ├─ live.js + live-frame.js      canonical live frame, map, project
        ├─ live-session.js              reconnect: REST before join
        ├─ reconnect.js                 1s–60s failure wait; fresh after 90s
        ├─ listener-heartbeat.js        30s health row; no token or secret
        ├─ live-ingest-mode.js          mode "live" on the one ingest function
        ├─ live-archive.js              raw platform_events row; content hash
        ├─ capture-ndjson.js            exact response body → one NDJSON line
        └─ event-mapper.js              fixture pair → socket event id
```

## Key responsibilities

| Concern | Behavior |
|---------|----------|
| Calendar | Dual-tour ATP/WTA events → canonical tournament rows |
| Fixture instant | `parseFixtureInstant` is the only schedule parser (fixtures and official overlay). Fixture `startTime` is the scheduled clock when it contains one. A bare date, midnight `T00:00` (with or without an offset), `dateOnly`, or live `startTimestamp` is not a kickoff. A date with no clock is stored at noon UTC with `has_time` false. Session is not a clock. A clock with no offset is that UTC clock, not the process zone. Date-only rows are not a first ball. `parseMatchSession` copies an explicit day or night and does not read the clock. Captured bodies have no session field (`startTimestamp`, `dateOnly`, `startTime` stay null). Any other session label is null. There is no venue schedule table. `parseMatchCourt` copies a match court label onto `matches.court`. Captured live, fixture, and results rows have no match court. `tournament.court` is the event surface and is not stored. A missing label stays null. Match order is not a court |
| Draw type | `classifyDraw`: provider/path type → terminal (slam qual=16) → seeds → size last. Size alone never selects. |
| Official draw | Parse provider draw into seats (player / bye / TBD). `Unknown Player` (id 3700) is **not** a bye on name/id: match `result === "bye"` → bye; empty `result` → TBD. JSON `null` / omitted side (consumed placeholder) opposite a named player → bye, never TBD. Explicit `"Bye"` / `"Qualifier"` strings still map. Slot order from the draw; skip `qualifying`/`doubles` keys. No size/slug branch. |
| Draw poll | Adaptive interval + force poll near `main_draw_starts_on` when unpublished |
| Overlay | Attach schedule/fixture ids onto official seats; preserve `display_name` / given names (never invent people). Published overlay rewrites `bye → tbd` (`bye_to_tbd`) and unwinds the invented R0 bye-advance when the parent is not a played match |
| Draw name lookup | `drawNameCandidates` derives Mega-draw search strings from `api_name` / `name` / slug (dash-split, strip Open, US/U.S. spelling). No hard-coded event list. |
| Integrity | Duplicate last names allowed when provider ids or given names differ. Bye count vs official slot field: at most `N/8` on 16/32-slot sheets (28-in-32 = 4) and `N/4` on 64/128-slot sheets (96-in-128 = 32). TBD seats are occupants, not byes. Bye-versus-bye in a first-round pair is impossible. |
| Reconcile | Pair-first bind results (rewrite stale `provider_match_id`). Exactly one occupant-compatible later-round one-sided hole binds; R0 is not a partial target; a different canonical `provider_match_id` excludes that hole; zero candidates stay unbound; two valid later-round holes fail closed. An emitted binding moves that id off any other holder in the tournament (`planProviderMatchRelocation`), writing only `provider_match_id` on the old row. No binding releases nothing. `planArchiveResults` optionally keeps only `providerMatchIds` before bind, id-map, provider-id updates, and Shape B; a missing list plans every archive row. A present list also makes `shouldReconcileDraw` false, so the draw path writes no provider-match ids (`drawProviderMatchWrites` is empty). Advance winners via `applyMatchResults` → `writeWinnerIntoParent` / `healSettledAdvances`. After that advance, `clearsProvisionalLive` deletes the provisional live row on `write`, `fill`, and `noop`. A winner conflict does not |
| Live | `canonicalLiveFrame` reads the captured live fields listed in [docs/live-normalizer-fields.md](../../docs/live-normalizer-fields.md): `id`, `matchId`, `status` (`InPlay`), `score`, `points`, `indicator`, and `updatedAt` when that key is present. A numeric `updatedAt`, or a digit string of 12 to 16 digits, is epoch milliseconds. An ISO string is that instant. `startTimestamp` is not that clock. `normalizeCapturedFrame` is pure: the same frame and catalog return the same state. It does not read the clock, a file, or the network. A missing `receivedAt` stays null. `points` is the current game. Tennis values stay the strings `0`, `15`, `30`, `40`, and `AD`, and `AD` is not an integer. `currentGameScore` and `completedSets` are not read. A non-tennis `points` value is not stored as a game or as a tie-break. `indicator` is stored and is not a server. No captured row has a server id, a winner id, or a status other than `InPlay`, so those are not mapped. `seq`, `replayPhase`, and `replayWinnerId` are replay-harness fields, read only when `source` is `replay`. `mapFrameToMatch` uses a mapped `event_map.socket_event_id`, else the player pair plus tournament id. A fixture id is not a socket id. A frame that matches neither a mapped event id nor one player-id pair is archived as `unmapped_event` and does not update `live_match_state`. Start time and player names are not match keys. `projectLiveFrame` keeps a newer same-source sequence, drops duplicates and rewinds, and returns `officialPatch: null` and `advance: false`. An already official match stays official. A differing live score or winner ref is `live_rest_disagreement` and is not applied to `matches`. A harness terminal becomes `provisional_final` and may set `provisionalWinner`. That name is the only winner the live path emits. It is not `winner_side` and it is not written onto `matches`. An in-play frame does not set it. `mapLiveFinishedToIngest` can still read a finished live row. `sync-facts` counts those rows and does not write them onto `matches`. `deriveLiveFlags` marks in-play, provisional, and stale from that frame. `resolvePlayerSides` maps the two provider player ids to `a` and `b` once, and only when those ids are both present and different. `projectLiveFrame` and `normalizeCapturedFrame` then use that side. A serving id that is missing or not exactly one of those sides stays null. Serve stays off on a captured row because no captured row has a server id. `normalizeCapturedFrame` turns one captured row and a match catalog into canonical live state, or an explicit failure (`unrecognized frame`, `unmapped`, `ambiguous`, `unknown status`, `already official`). It does not write, settle, advance, query, or format a sentence. Canonical sets, game points, the phase flag, and the live state object come from `normalizeLiveMatchState` in `@matchread/core`. `packages/provider-rapidapi/src/live-replay-harness.js` replays `fixtures/prototype-timeline.json` and the gitignored M1 NDJSON captures through `acceptForwardedLive` into `live_match_state`. `walkReplayClock` uses each event timestamp as the virtual now and does not sleep the gap. That instant is passed as `now` into ingest for `listener_health`. `normalizeLivePayload` turns one live HTTP body into those frames. `findMatchByProviderEvent` reads `provider_event_map` by `tour` and `provider_event_id` and returns null when that pair is absent. `planProviderEventMap` stores a live-list id only when `tourType`, the `matchId` tournament segment, and both player ids pick one match. Fixture ids and player names are not keys. A miss or two hits stay unmapped. `openProviderSocket` does not connect. `npm run listen:live` replays a local file and exits if a socket flag is set. `createFrameRecorder` appends raw frames as NDJSON |
| Settled facts | `officialScoreText` reads archive `result` only (the scoreline, including a retirement marker) and ignores live `score`. `mergeSettledFact` fills a missing `official_score` or fact class, keeps an equal score, and refuses a conflicting settled winner. `settledFactSkipReason` names a score or fact-class conflict. `planScorelineBackfill` plans those fills for `scripts/backfill-scorelines.mjs` and never includes a winner. A winner conflict plans no score fill. `planSessionCourtBackfill` plans null session and court fills for `scripts/backfill-session-court.mjs` from explicit fixture labels only. `matchLookupFromQuery` turns a select error into a failed run, including a missing `official_score` column |
| Absences | `classifyPlayerAbsences` during reconciliation. Withdrawal: missing from the local draw and from both the fixture list and the entry list, after both were read (`ops_events` kind `reconcile`). Ingestion gap: missing locally and present on either list. An unloaded list leaves the absence unexplained. Both of those are kind `error` via `absenceObservability` (public `ref` / `slug` / `tour` / `provider_tournament_id` and provider player ids; no internal tournament id) and block `applyMatchResults`. There is no S1 type. This package does not call Sentry. `sync-facts` sends those error rows when `SENTRY_DSN` is set. An archive `result_type` other than `completed` or `retired` is not settled and does not set `fact_kind`. `splitResultAbsences` still separates result types and is not this check |

## Edge wiring

- `supabase/functions/_shared/rapidapi.js` re-exports this package.
- `supabase/functions/import_map.json` maps `@matchread/provider-rapidapi` → package source for Deno.

## Observed bytes (2026-10-07)

Field-by-field answers, with file and timestamp, are in [docs/provider-capture-findings.md](../../docs/provider-capture-findings.md). Two gitignored captures were read: `captures/live-raw.ndjson` (`06:22Z`–`06:24Z`) and `fixtures/live-capture-oct-2026/frames.ndjson` (`12:22Z`–`12:24Z`). Both are HTTP bodies. Neither contains a socket frame.

`npm run capture:live` appends to the frames file. Each HTTP body is stored as text with `receivedAt`. A WTA tournament id from a live `matchId` also pulls that event's fixtures, results, and info. These shapes were read back from the files. They are not a parser.

The live list in the earlier file is 20 `InPlay` rows (11 `atp`, 9 `wta`). The later file has 63, then 60, still all `InPlay`, with `updatedAt` on each row. `ws-token` is HTTP 200 with body keys `success` and `token`. The token payload claim names include `plan`; the response has no price field. Results archives in these files use `result_type` `completed` and `retired` only. Any other `result_type` is left unknown: the raw live row stays stored, the match is not settled, and `fact_kind` stays null. A live id that disappears from a later list is not a cancellation.

`isFinishedLiveStatus` does not treat `InPlay` as finished, so this live list does not settle matches.

## ws-token

`getWsToken` reads `GET /tennis/v2/extend/api/ws-token` and returns a token string plus the raw body. The captured body counts only when `success` is true and `token` is a string. Other token fields are not read. `connectLive` reads `RAPIDAPI_KEY` and optional `RAPIDAPI_HOST` from the environment, calls `getWsToken`, and returns a REST client. It keeps the token in memory and does not return the key or the token. `tokenAgeSec` reports seconds since the `iat` claim. Captured tokens expire at the `exp` claim. Those bodies have no `TOKEN_EXPIRED` error. When `exp` is reached, `connectLive` logs `{ level: "info", name: "token_expired" }`, drops the token, calls `getWsToken` again, and keeps using REST. That log is not an `ops_events` row and it is not an error report. Proactive refresh is off. The captured `exp - iat` claim is 86400 seconds and was not waited out, so `proactiveRefreshEnabled` stays false and no timer is armed. `close()` aborts that HTTP client and drops the token. A 429 or 5xx retry stops when the signal is already aborted. It does not open a socket. No commercial decision for that call — license, price, or plan entitlement — is recorded in this repository. Do not treat the existence of the client as a decision to buy or drop it. The open founder checklist (MEGA plan and `/ws-token` licensing) is in [docs/provider-capture-findings.md](../../docs/provider-capture-findings.md). `openProviderSocket` does not open a connection. Real socket deployment still waits on that written yes/no.

## Boundaries

- Fail **closed** on unknown tiers/surfaces/fiction — never invent seats or names.
- Qualifying *draws* are rejected (same size as Slam main is not enough). Qualifier *seats in the main draw* (Q/LL TBD) are shown.
- Official TBD (Q/LL) and published byes are valid seats; qualifying *matches* are ignored.
- Ops entrypoints: `scripts/publish-draws.mjs`, `reconcile-results.mjs`, `probe-*.mjs`, `tennis-verify.mjs`.

## Related

- Ingest flow: [../data-flows.md](../data-flows.md) A  
- Edge: [../infrastructure/edge-functions.md](../infrastructure/edge-functions.md)  
- Ops: [../infrastructure/ops-scripts.md](../infrastructure/ops-scripts.md)
