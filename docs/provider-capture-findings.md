# Provider capture findings

Read from stored provider bytes on 2026-10-07. Documentation and client comments are not treated as observations.

Each answer is one of: **Observed**, **Not observable without a Slam**, **Still unknown**.

Slam-only gaps below are known unknowns. They do not block Milestone 1.

## Evidence

| File | Range (UTC) | What was stored |
|------|-------------|-----------------|
| `captures/live-raw.ndjson` | `2026-10-07T06:22:16.892Z` – `2026-10-07T06:24:31.550Z` | HTTP bodies: live list, `ws-token`, ATP and WTA calendar pages (`pageSize=2`), ATP and WTA results for several tournament ids |
| `fixtures/live-capture-oct-2026/frames.ndjson` | `2026-10-07T12:22:19.856Z` – `2026-10-07T12:24:44.639Z` | Two passes. HTTP bodies: live list, `ws-token`, WTA calendar page (`pageSize=2`), and for one WTA tournament id taken from a live `matchId`: fixtures, results, info |

Both files are gitignored. Neither file contains a socket frame. Paths and statuses are recorded; request headers are not. Token strings are not copied here.

Tour context in these bytes is `tourType` `atp` and `wta` on live rows, and `/atp/` or `/wta/` on the REST paths.

## Is REST fixture id the same as Socket.IO eventId?

**Still unknown.**

No socket payload was stored, so a Socket.IO `eventId` was not available to compare.

Related REST comparison, same WTA tournament, fixtures at `2026-10-07T12:23:04.475Z` and the live list at `2026-10-07T12:22:22.507Z`:

- Fixture path: `/tennis/v2/wta/fixtures/tournament/{id}` (`data[]`, 11 rows).
- Fixture identity fields: numeric `data[].id` and numeric `data[].matchId` (both 4-digit on this page).
- Live identity fields: string `results[].id` (length 7 on the compared rows) and string `results[].matchId` (`{player}-{player}-{tournament}-{round}`, 4 segments).
- For the 4 live rows whose `matchId` tournament segment was that fixture tournament, `results[].id` matched neither `data[].id` nor `data[].matchId`.

What would map a fixture id to a socket `eventId` is not in these files.

## Are player IDs identical between REST and live?

**Observed**, for one WTA tournament only.

| | |
|--|--|
| Files | `frames.ndjson` live body `2026-10-07T12:22:22.507Z`; fixtures body `2026-10-07T12:23:04.475Z` |
| Tour | WTA. The live `matchId` tournament segment was the id in the fixtures path. ATP fixtures were not stored beside a live list, so ATP equality was not checked. |
| Live path | `results[].matchId` segments 1 and 2 (digit strings). `results[].player1` and `results[].player2` contain `name` only. |
| REST path | `data[].player1Id`, `data[].player2Id`, `data[].player1.id`, `data[].player2.id` (numbers). On all 11 fixture rows, `player1Id` and `player1.id` are the same number, and the same for player 2. |
| Comparison | All 4 in-play pairs on that tournament used player ids that appear on a fixture row, in either order. 8 distinct live player ids, all 8 present in the fixture player-id set. |

Limit: one tournament, four in-play pairs, eleven fixture rows. This does not show that every live id space matches every REST id space. Live `results[].id` and fixture `data[].id` did not match (see the previous answer).

## Is seasonId present in live payloads?

**Observed.** The name `seasonId` is absent.

Live row keys in the later file (`2026-10-07T12:22:22.507Z` and `2026-10-07T12:24:42.435Z`): `dateOnly`, `id`, `indicator`, `league`, `matchId`, `name`, `participant1`, `participant2`, `player1`, `player2`, `points`, `roundId`, `score`, `startTimestamp`, `status`, `tourType`, `tournament`, `updatedAt`.

The earlier live body (`captures/live-raw.ndjson`, `2026-10-07T06:22:16.892Z`, 20 rows) uses that set without `updatedAt`.

`results[].tournament` is `{ name }` only. The tournament id used to call `/tennis/v2/wta/fixtures/tournament/{id}`, `/tournament/results/{id}`, and `/tournament/info/{id}` is the third segment of `results[].matchId`. On the four compared WTA rows, `results[].roundId` equals the fourth segment. Those segments are not labeled `seasonId`. The same key is also absent on the captured fixture, results, calendar, and info objects.

## What is the actual /ws-token path and authentication shape?

**Observed.**

| | |
|--|--|
| Files | Both capture files. Three HTTP 200 bodies. |
| Times | `2026-10-07T06:22:16.894Z`, `2026-10-07T12:22:22.966Z`, `2026-10-07T12:24:42.937Z` |
| Path | `/tennis/v2/extend/api/ws-token` |
| Body keys | `success` (`true`) and `token` |
| Token shape | Three segments, length 215 on each response. Decoded payload claim names: `exp`, `iat`, `plan`, `user`. |

Request headers are not in the NDJSON, and no socket handshake was stored, so this does not show how a client attaches the token to Socket.IO. Claim values for `plan` and `user` are omitted here.

## What is token lifetime?

**Observed** as a claim on the token, not as a waited expiry.

On all three responses, `exp - iat` is `86400` seconds. `iat` falls within the same minute as that response's capture time, and the two later responses carry different `iat` values. Nothing in the capture shows a rejected token after that interval.

## Is the payload sufficient to derive the MatchRead flag reliably?

**Observed.** The live row is not sufficient for the flag this repo actually computes.

Bracket eligibility is tour plus tier (`atp` or `wta`, and a public tier). Live rows carry `tourType` (`atp` or `wta` in every captured row) and do not carry `tier`. `results[].league` is a title string. `results[].tournament` has `name` only.

The info body for the joined WTA tournament (`2026-10-07T12:23:05.072Z`, path `/tennis/v2/wta/tournament/info/{id}`) does include `data.tier` (`ITF Event`). That is a second REST call, not a field on the live row. Calendar pages also include `tier` (`ATP 250`, `Finals`, `WTA 250`, `Championships` on the `pageSize=2` pages) and are not the live list.

## How do retirement, walkover, suspension, and cancellation appear live?

**Still unknown.**

Every live row in all three lists has `results[].status` equal to `InPlay` (20 rows at `06:22:16Z`, 63 at `12:22:22Z`, 60 at `12:24:42Z`). No live `status`, `score`, or `points` value in these files is a retirement, walkover, suspension, or cancellation.

The results archives stored beside those calls use `result_type` `completed` and `retired` only (ATP and WTA `data.singles`, and the doubles and qualifying arrays that were non-empty). One ATP `data.singles` array was empty (`/tennis/v2/atp/tournament/results/{id}` at `2026-10-07T06:23:38.515Z`) while that tournament id was on the `06:22` live list. Strings for walkover, suspension, and cancellation do not appear in those `result_type` / `result` / `status` fields. Archive `retired` is not a live rendering.

## What competitions appear in the all-feed, and at what volume?

**Observed** for `GET /tennis/v2/extend/api/events/live`.

Each body is `{ success, results, count }` and `count` equals `results.length`. `results[].league` is the competition label. Counts below are in-play rows, not unique matches across the day. League titles are grouped by the label prefix so event names stay out of this doc.

| Capture | ATP rows | WTA rows | Distinct league labels by class |
|---------|----------|----------|----------------------------------|
| `06:22:16.892Z` (20 rows) | 11 | 9 | M25 ×2, W15 ×1, W35 ×1, other title ×3 |
| `12:22:22.507Z` (63 rows) | 37 | 26 | M15 ×6, M25 ×4, W15 ×4, W35 ×5, W50 ×2, Challenger ×3, other title ×3 |
| `12:24:42.435Z` (60 rows) | 35 | 25 | same distinct labels as the `12:22` list; two fewer M15 rows |

Row counts for the `12:22` list: M15 20, W35 11, M25 10, W15 9, Challenger 5, W50 4, other title 4.

The socket name `live-events-all-update` does not occur in either file. This volume is the REST live list only.

## Can day/night sessions be inferred from start times?

**Not observable without a Slam.**

Live rows do carry a clock: `results[].startTimestamp` (10-digit unix seconds) and `results[].dateOnly` (`2026-10-07` on every live row in these files). The WTA fixture page carries `data[].startTime` as an ISO timestamp on 9 of 11 rows (2 empty). There is no session field on the live row, the fixture row, or the info object, and these live lists do not include a slam whose day and night sessions could be checked against those clocks. This remains a known unknown. It does not block Milestone 1.

## Is live-events-all-update a snapshot, delta, or another shape?

**Still unknown.**

That event name is not in either capture, and there is no socket payload to classify.

The REST live list, which is a different call, returned a full `results` array each time. From `12:22:22.507Z` (63 ids) to `12:24:42.435Z` (60 ids), 60 ids were present in both bodies and 3 ids were only in the first. That is the REST list. It is not evidence about `live-events-all-update`.

## Do actual field names match completedSets, currentGameScore, and servingPlayerId?

**Observed.** Those three names are absent on every live row.

Fields present for score state:

| Prototype name | Captured live field | Example values (both tours) |
|----------------|---------------------|-----------------------------|
| (none of the three) | `results[].score` | Comma-separated set text, e.g. `6-4,3-6,4-5` and `0-0` |
| (none of the three) | `results[].points` | Game-score text such as `15-40`, `40-A`, `0-0`; also `5-2` on some rows; `null` on 2 of the combined later rows |
| (none of the three) | `results[].indicator` | `0,1`, `1,0`, `0,0`, or `null` |

`indicator` is not labeled as a server. These names were checked on the 20-row body and both later live bodies.

## M1 verification evidence

Checked 2026-10-07. A discussion note is not a founder decision and is not an applied migration.

### Repository verification

| Check | Result |
|-------|--------|
| Migration head in `supabase/migrations` | `0022_match_official_facts.sql`. The live chain is `0001` through `0022`. |
| Local applied head | `supabase_migrations.schema_migrations` on the local database: latest version `0022`. Versions `0031` and `0032` are not in that table. |
| Hosted applied head | Not read. `DATABASE_URL` and `SUPABASE_DB_URL` are unset, so this check did not connect to the hosted database. |
| `0031` status | Not in the live chain. `supabase/migrations/archive/0031_wipe_nonfact_noise.sql` is archive SQL, not a reconciliation migration, and it is not applied locally. |
| `0032` status | No `0032` file in this repository. |
| `@matchread/core` registry | `npm view @matchread/core` on 2026-10-07 returned npm `E404` for `https://registry.npmjs.org/@matchread%2fcore`. The workspace package is `private` at version `0.0.0`. |

### Cron verification

SQL in the live chain schedules both jobs: reconciliation `sync-facts-5m` at `*/5 * * * *` (`0009_sync_facts_cron.sql`, `select public.invoke_sync_facts()`), settlement `settle-leagues` at `*/15 * * * *` (`0007_cron.sql`, `select public.invoke_settle_leagues()`).

Local database, read 2026-10-07 with `npx supabase db query --local`:

| Job | Schedule | Active | Latest `cron.job_run_details` row |
|-----|----------|--------|-------------------------------------|
| `settle-leagues` | `*/15 * * * *` | true | `2026-10-07T18:00:00.037351Z`, status `succeeded`, `return_message` `1 row` |
| `sync-facts-5m` | `*/5 * * * *` | true | `2026-10-07T18:00:00.034033Z`, status `succeeded`, `return_message` `1 row` |

`vault.decrypted_secrets` has no `project_url` or `ingest_secret` row on that local database. Both invoke functions return null without calling `net.http_post` when those secrets are missing. A local `succeeded` row is the SQL statement finishing. It is not an Edge execution.

Hosted run history is **BLOCKED**. `npm run prove:cron` exited 2: `DATABASE_URL` is not set. Cron job history on the hosted database was not read. The SQL that check needs is:

```sql
select jobname, schedule, active
  from cron.job
 where jobname in ('sync-facts-5m', 'settle-leagues')
 order by jobname;

select j.jobname, d.status, d.start_time, d.end_time
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
 where j.jobname in ('sync-facts-5m', 'settle-leagues')
 order by d.start_time desc
 limit 20;
```

### apply_bracket_state

| | |
|--|--|
| Location | No `apply_bracket_state` function in `supabase/migrations` or `supabase/migrations/archive`. Live `0012_draw_revisions_event_map.sql` creates `draw_revisions`, `draw_replacements`, and `event_map`. |
| Behavior | There is no body to execute. The live settlement comparison is `mergeSettledFact` in `packages/provider-rapidapi/src/normalize.js`, applied by `applyMatchResults`. A second official winner or void leaves the stored winner in place. `claim_settlement` (`0015_settlement_claims.sql`) runs on the first write. |
| Latched | The named function is absent, so it is not a latch in this repository. The live writer keeps the first settled winner. |
| M4 | A later pass that reads `matches.winner_player_id` sees that first winner. A differing later official winner is not applied here. The conflict signal, when a repair run id exists, is `ops_events.name = 'winner_conflict'`. M4 needs its own branch for that case. |

### Sentry

| | |
|--|--|
| Implementation | In place. Web: `@sentry/nextjs` via `apps/web/instrumentation.ts`, `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and `reportError`. Edge: `supabase/functions/_shared/sentry.ts`, called from `sync-facts` and `settle-leagues`. An empty DSN leaves the SDK disabled. |
| Receipt test | **BLOCKED.** Rechecked 2026-10-07. `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are unset in the process environment, `.env.local`, and `.env.docker`. No client exception was sent, and no Sentry project was queried. Configuration is not receipt. |

### Provider commercial dependency

M3 needs a written yes/no before a real socket deployment. This is not an engineering task. No code change in M1 closes it.

Searched this repository for a founder yes/no on the provider MEGA plan and on `/ws-token` licensing. None is recorded. The architecture notes state that absence and do not choose:

- `architecture/modules/provider-rapidapi.md` — `getWsToken` reads the token endpoint. "No commercial decision for that call — license, price, or plan entitlement — is recorded in this repository."
- `architecture/data-flows.md` — the capture path calls the same endpoint. "This repository has no commercial decision for that endpoint (price, entitlement, or whether it is in the contracted plan)."

A 2026-10-07 HTTP 200 from `/tennis/v2/extend/api/ws-token` is a response shape. It is not a license or purchase decision.

**PENDING — founder decision required before real M3 socket deployment**

- [ ] Provider MEGA plan: yes or no, in writing
- [ ] `/ws-token` licensing and access: yes or no, in writing

M1 code can be completed around this dependency. Do not deploy a real M3 socket client until both items are decided.
