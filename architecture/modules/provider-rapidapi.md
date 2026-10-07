# Module: Provider RapidAPI (`packages/provider-rapidapi`)

**Package:** `@matchread/provider-rapidapi`  
**Role:** Tennis API client and fact pipeline helpers — normalize, official draw parse/overlay, reconcile results, live session helpers.

**Not used by the web app.** Consumed by Edge `sync-facts` and ops scripts.

## Architecture

```text
HTTP client (index.js)
  calendar / fixtures / results / draw / seeds / live
        │
        ├─ normalize.js + assert.js     tour/tier/surface/name; fail closed
        ├─ official/classify-draw.js    main_singles vs qualifying/doubles
        ├─ official/*                   parse, hash, diff, overlay fixtures
        ├─ reconcile-provider.js        results → match keys / advances
        ├─ live.js + live-session.js    live events → ingest shape
        ├─ capture-ndjson.js            exact response body → one NDJSON line
        └─ event-mapper.js              fixture pair → socket event id
```

## Key responsibilities

| Concern | Behavior |
|---------|----------|
| Calendar | Dual-tour ATP/WTA events → canonical tournament rows |
| Draw type | `classifyDraw`: provider/path type → terminal (slam qual=16) → seeds → size last. Size alone never selects. |
| Official draw | Parse provider draw into seats (player / bye / TBD). `Unknown Player` (id 3700) is **not** a bye on name/id: match `result === "bye"` → bye; empty `result` → TBD. JSON `null` / omitted side (consumed placeholder) opposite a named player → bye, never TBD. Explicit `"Bye"` / `"Qualifier"` strings still map. Slot order from the draw; skip `qualifying`/`doubles` keys. No size/slug branch. |
| Draw poll | Adaptive interval + force poll near `main_draw_starts_on` when unpublished |
| Overlay | Attach schedule/fixture ids onto official seats; preserve `display_name` / given names (never invent people). Published overlay rewrites `bye → tbd` (`bye_to_tbd`) and unwinds the invented R0 bye-advance when the parent is not a played match |
| Draw name lookup | `drawNameCandidates` derives Mega-draw search strings from `api_name` / `name` / slug (dash-split, strip Open, US/U.S. spelling). No hard-coded event list. |
| Integrity | Duplicate last names allowed when provider ids or given names differ. Bye count vs official slot field: at most `N/8` on 16/32-slot sheets (28-in-32 = 4) and `N/4` on 64/128-slot sheets (96-in-128 = 32). TBD seats are occupants, not byes. Bye-versus-bye in a first-round pair is impossible. |
| Reconcile | Pair-first bind results (rewrite stale `provider_match_id`). Exactly one occupant-compatible later-round one-sided hole binds; R0 is not a partial target; a different canonical `provider_match_id` excludes that hole; zero candidates stay unbound; two valid later-round holes fail closed. An emitted binding moves that id off any other holder in the tournament (`planProviderMatchRelocation`), writing only `provider_match_id` on the old row. No binding releases nothing. `planArchiveResults` optionally keeps only `providerMatchIds` before bind, id-map, provider-id updates, and Shape B; a missing list plans every archive row. A present list also makes `shouldReconcileDraw` false, so the draw path writes no provider-match ids (`drawProviderMatchWrites` is empty). Advance winners via `applyMatchResults` → `writeWinnerIntoParent` / `healSettledAdvances` |
| Live | `mapLiveFinishedToIngest` can read a finished live row. `sync-facts` counts those rows and does not write them onto `matches`. `createFrameRecorder` appends raw frames as NDJSON (`receivedAt`, text as text, bytes as base64). No socket client is in this package |
| Settled facts | `officialScoreText` reads archive `result` only (the scoreline, including a retirement marker) and ignores live `score`. `mergeSettledFact` fills a missing `official_score` or fact class, keeps an equal score, and refuses a conflicting settled winner. `settledFactSkipReason` names a score or fact-class conflict. `planScorelineBackfill` plans those fills for `scripts/backfill-scorelines.mjs` and never includes a winner. `matchLookupFromQuery` turns a select error into a failed run, including a missing `official_score` column |
| Absences | `classifyPlayerAbsences` during reconciliation. Withdrawal: missing from the local draw and from both the fixture list and the entry list, after both were read (`ops_events` kind `reconcile`). Ingestion gap: missing locally and present on either list. An unloaded list leaves the absence unexplained. Both of those are kind `error` via `absenceObservability` (public `ref` / `slug` / `tour` / `provider_tournament_id` and provider player ids; no internal tournament id) and block `applyMatchResults`. There is no S1 type. This package does not call Sentry. `sync-facts` sends those error rows when `SENTRY_DSN` is set. `fact_kind = withdrawal` on a bound walkover row stays the published result class. `splitResultAbsences` still separates result types and is not this check |

## Edge wiring

- `supabase/functions/_shared/rapidapi.js` re-exports this package.
- `supabase/functions/import_map.json` maps `@matchread/provider-rapidapi` → package source for Deno.

## Observed bytes (2026-10-07)

Field-by-field answers, with file and timestamp, are in [docs/provider-capture-findings.md](../../docs/provider-capture-findings.md). Two gitignored captures were read: `captures/live-raw.ndjson` (`06:22Z`–`06:24Z`) and `fixtures/live-capture-oct-2026/frames.ndjson` (`12:22Z`–`12:24Z`). Both are HTTP bodies. Neither contains a socket frame.

`npm run capture:live` appends to the frames file. Each HTTP body is stored as text with `receivedAt`. A WTA tournament id from a live `matchId` also pulls that event's fixtures, results, and info. These shapes were read back from the files. They are not a parser.

The live list in the earlier file is 20 `InPlay` rows (11 `atp`, 9 `wta`). The later file has 63, then 60, still all `InPlay`, with `updatedAt` on each row. `ws-token` is HTTP 200 with body keys `success` and `token`. The token payload claim names include `plan`; the response has no price field. Results archives in these files use `result_type` `completed` and `retired` only.

`isFinishedLiveStatus` does not treat `InPlay` as finished, so this live list does not settle matches.

## ws-token

`getWsToken` reads `GET /tennis/v2/extend/api/ws-token` and returns a token string plus the raw body. No commercial decision for that call — license, price, or plan entitlement — is recorded in this repository. Do not treat the existence of the client as a decision to buy or drop it. The open founder checklist (MEGA plan and `/ws-token` licensing) is in [docs/provider-capture-findings.md](../../docs/provider-capture-findings.md). Real M3 socket deployment waits on that written yes/no. M1 does not.

## Boundaries

- Fail **closed** on unknown tiers/surfaces/fiction — never invent seats or names.
- Qualifying *draws* are rejected (same size as Slam main is not enough). Qualifier *seats in the main draw* (Q/LL TBD) are shown.
- Official TBD (Q/LL) and published byes are valid seats; qualifying *matches* are ignored.
- Ops entrypoints: `scripts/publish-draws.mjs`, `reconcile-results.mjs`, `probe-*.mjs`, `tennis-verify.mjs`.

## Related

- Ingest flow: [../data-flows.md](../data-flows.md) A  
- Edge: [../infrastructure/edge-functions.md](../infrastructure/edge-functions.md)  
- Ops: [../infrastructure/ops-scripts.md](../infrastructure/ops-scripts.md)
