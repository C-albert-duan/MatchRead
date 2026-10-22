# Module: Listener (`apps/listener`)

**Package:** `@matchread/listener`  
**Role:** Long-running provider client. It connects, notices changed raw rows, and posts that batch.

## What it does

1. `connectLive` from `@matchread/provider-rapidapi` (REST). It does not open a provider socket.
2. Read the live list.
3. Remember the last raw row per provider event id (`id`, or `providerEventId` when that field is present). `equalForIngest` is that comparison. Forward the row only when it is not equal. `receivedAt` and the other local receipt fields are not part of the comparison. A batch that omits an id does not forget it. A new process starts with an empty comparison, so the next read posts every current row in that one batch. `platform_events` already has those content hashes, so the repeat is not projected and does not change `matches`. `FEED_SHAPE` is unset by default. `snapshot` and `delta` are labels only. Absence is recorded for an explicit snapshot label and is not treated as completion, suspension, or removal.
4. `POST` one `{ mode: "live", liveFrames, listenerInstanceId }` body per read to `MATCHREAD_INGEST_URL`. The array is every changed row from that tick, in feed order. A match is not a separate request. A URL ending in `/ingest-events` is sent to `/sync-facts` with `Authorization: Bearer`. `sync-facts` is the only ingest function. A successful response's `carriedProviderIds` are remembered. A failed post puts those rows back, so the next read sends them again. A dry run does not post, so it does not learn those ids. One REST client is kept across polls. When its token `exp` is reached during a match, the client logs `token_expired` at info, clears that token, fetches another, and reads again. The changed-frame memory is not cleared, and the tick stays `conn=up`. A failed read drops the client and the next poll connects again.
5. Log one JSON line per tick on the info channel: `ts`, `job` (`listener`), `conn`, `events_in`, `mapped`, `unmapped`, `changed`, `posted`, `flags`, `lag_ms`, `token_age_s`. `posted` is the frame count in that one request. `mapped` counts frames whose `seasonId` or `matchId` tournament segment is already in `carriedProviderIds`. The rest of the tick is `unmapped`. `flags` is 1, and `level` is `warn`, only when the ingest response `unmappedCarried` is greater than 0: a frame whose `seasonId` or `matchId` tournament segment is a carried provider id did not map to one match. A high `unmapped` count from other tours stays `info`. Player names are not that identity. A response without `unmappedCarried` does not raise the flag. `lag_ms` is the age of the newest numeric `updatedAt`. `token_age_s` is seconds since the token `iat` claim. The token is not logged.
6. POST `{ mode: "live", liveFrames: [], listenerHeartbeat }` to the same ingest URL about every 30 seconds (`HEARTBEAT_MS`). The empty array keeps an older `sync-facts` on the live return. A poll longer than that still wakes for the heartbeat and does not read the provider early. The heartbeat is the latest tick: connected, last provider event time, events received, mapped, unmapped, lag, and token age. It does not include the token, provider key, or ingest secret. `sync-facts` upserts `listener_health` id `listener`. A dry run does not post it.

`LISTENER_POLL_MS` repeats a healthy cycle. Without it, or with `--once`, the process runs one cycle and exits. On Railway, a missing poll exits with an error so the container does not stop after one cycle and look healthy. `LISTENER_DRY_RUN=1` does not post.

`GET /health` on `PORT` (Railway sets `8080`) is the container check. The body is `{ status }` and nothing else. `starting` is 503 until the first provider read succeeds. `ok` is 200 while that success is inside `STALE_AFTER_MS` (90 seconds). `stale` is 503 after that. `draining` is 503 once shutdown has started. Railway waits up to 120 seconds for the first 200 before it keeps the deployment.

`SIGTERM` or `SIGINT` aborts the provider HTTP client and the in-flight ingest POST, and it does not start another reconnect. `close()` drops the token. A batch that has not finished is released, so those rows are not treated as posted. A POST that already returned success stays committed. The process then posts one heartbeat with `connected: false`, bounded by 2 seconds, closes the health server, and exits. A new process posts the current rows again. `platform_events` keeps one content hash, so that repeat is not projected again and does not write `matches`.

A failed read logs the same tick line with `conn=down` and zero counts, then waits 1, 2, 4, 8, 15, 30, then 60 seconds. Each wait is that step ±20%. The next failure stays on 60 seconds. A successful read starts the schedule over at 1 second. `--once` does not wait. A missing ingest URL or provider key exits. No successful read for `STALE_AFTER_MS` (90 seconds) is stale for the listener. The bracket label stays on its own 45-second threshold.

A second process posts the same raw rows. This process does not check whether it is the only one.

## What it does not do

- Parse set scores, game points, or serving.
- Treat a missing id as completed, suspended, or removed.
- Open a database connection. `sync-facts` writes the `listener` health row.
- Settle matches or call the settle function.
- Render UI.

`sync-facts` owns the write. A body with `liveFrames` projects those rows and does not run calendar, draw, results, or settlement.

## Deploy

`.railway/railway.ts` is one `listener` service with `replicas: 1`. Railway no longer reads `railway.json` for a new service, so that file is not in this repo. The image is `apps/listener/Dockerfile`, selected with `RAILWAY_DOCKERFILE_PATH`. The root Dockerfile remains the web app.

The replica count is the deploy target. Correctness does not depend on it. Two processes can both post a new row. `platform_events` keeps one content hash, and the second copy is not projected. `upsert_live_match_state` keeps a newer `occurred_at` and returns `duplicate` for the same frame. It does not write `matches`. When two instance ids arrive within 15 minutes, `sync-facts` writes `ops_events` `listener_overlap` and continues. There is no leader election.

`apps/listener/Dockerfile` is a two-stage image from the repository root, the same workspace install as the web image. The runtime stage also copies `packages/core`, which the provider client imports. It does not take `RAPIDAPI_KEY`, `INGEST_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or a Sentry token as a build argument, and `.dockerignore` keeps env files out of the context. Those values are Railway variables (`preserve()` in `.railway/railway.ts`). The listener process does not receive the service-role key or a Sentry secret.

`npm run listen:provider` is one local cycle. The Railway command is `npm run start -w @matchread/listener` with `LISTENER_POLL_MS` set. Secrets stay in Railway as preserved variables.

## Related

- Provider client: [provider-rapidapi.md](./provider-rapidapi.md)
- Ingest: [../infrastructure/edge-functions.md](../infrastructure/edge-functions.md)
- Env: [../infrastructure/environment.md](../infrastructure/environment.md)
