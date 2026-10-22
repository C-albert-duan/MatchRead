# V3 implementation plan

**Written:** 2026-10-10, after the checklist in [`V3-MILESTONE-CHECKLIST.md`](./V3-MILESTONE-CHECKLIST.md) and the commands in [`V3-TEST-PLAN.md`](./V3-TEST-PLAN.md).

**Do this in order.** Do not start Milestone 4 until Wave A is green. Do not weaken the trust boundary to make a test pass.

Names in the four-milestone plan that this repo does not use: `ingest-events` → `sync-facts`; socket listener → REST `connectLive`; `matches.scoreline` → `official_score`; `0033_live_state.sql` → migrations `0027`–`0041`.

---

## What this audit proved

| Check | Result | Evidence |
|-------|--------|----------|
| `npm run ci:live-trust` | **Pass** | `live trust guard ok (41 files)` this session |
| Web unit suite | **Fail 1** | `server-render.test.ts` “synthetic bracket scripts stay the same” — LF vs CRLF, same SQL |
| Live patch / match route | **Pass** (inside that suite, before the one fail) | `patch.test.ts` includes “equal clock” skip |
| Playwright `live-client` (prior run) | **4 pass, 1 fail, 1 skipped** | Provisional cell stayed `data-resolution="live"` |
| Integration “two listeners” (prior run) | **Fail** | First `noteListenerInstance` already logged overlap |
| pgTAP `37` test 6 (prior run) | **Fail** | `occurred_at` NULL; function only stores it when `sequence_source = 'updatedAt'` |
| Real provider browser chain | **Blocked** | `RAPIDAPI_KEY` not loaded |
| M4 files (`consequence.ts`, Stage) | **Absent** | Correct until Wave A closes |

---

## Wave A — close M3 (do these first)

### A1. Provisional E2E (M3-E10, M3-E11)

**Cause.** `acceptLiveEvent` skips a frame when `occurred_at` is equal to the cell clock (`apps/web/lib/live/patch.ts`, covered by `patch.test.ts`). The stale Playwright step writes `occurred_at` to now. The provisional step in `apps/web/e2e/live-client.spec.ts` does not send a later `occurred_at`, so the upsert keeps the same clock and the cell never becomes `provisional`. The official-replaces-provisional test never runs because the file is serial.

**Change.** In the provisional `writeLive` call, set `occurred_at` strictly after the stale step’s clock (and keep `sequence` higher). Do not remove the equal-clock skip.

**Done when.** From `apps/web`, with Next on port 3002 and `E2E_SUPABASE_*` pointed at local Supabase:

```text
npx playwright test e2e/live-client.spec.ts
```

All 6 tests pass. The provisional cell has `data-resolution="provisional"`, note “Awaiting official result”, and the parent has no filled seat.

### A2. Two-listener integration (F20)

**Cause.** `describe("two listeners")` in `packages/provider-rapidapi/src/live-ingest.integration.test.js` does not reset `listener_health` id `sync-facts`. Earlier cases upsert that row and leave a recent `instance_id`. `noteListenerInstance(instanceA)` then treats the first post as an overlap (`listener-instance.js`, 15-minute window).

**Change.** In that `before`, upsert id `sync-facts` with `instance_id` null (or equal to `instanceA`) and a fresh `updated_at`, before the first `noteListenerInstance`. Leave overlap detection itself unchanged.

**Done when.**

```text
node --test packages/provider-rapidapi/src/live-ingest.integration.test.js
```

The suite “two listeners” passes, and “does not settle from a socket event” still passes.

### A3. pgTAP `37` occurred_at

**Cause.** `upsert_live_match_state` sets `v_occurred` only when `p_sequence_source = 'updatedAt'` (`supabase/migrations/0037_live_monotonic_upsert.sql`). Test 6 in `supabase/tests/37_live_match_state.test.sql` passes source `receivedAt` and still expects a stored provider clock, so the row’s `occurred_at` is null.

**Change.** In that test, use `updatedAt` on the frame that must store `2026-10-09 18:00:40+00`. Do not store a receipt clock as `occurred_at`.

**Done when.** `npx supabase test db` file `37_live_match_state.test.sql` is 8/8. Re-run `43`–`45` in the same session so monotonic tests stay green.

### A4. Synthetic SQL line endings (web suite)

**Cause.** `assert.equal(copy, fixture)` in `apps/web/lib/brackets/server-render.test.ts` compares `supabase/fixtures/synthetic-bracket-16.sql` and `supabase/tests/fixtures/synthetic-bracket-16.sql`. On Windows one file is CRLF and the other is LF. The SQL text matches.

**Change.** Compare after replacing `\r\n` with `\n` in both strings. Optional: `.gitattributes` `*.sql text eol=lf` so the copies stay identical.

**Done when.** `npm run test -w @matchread/web` is 131/131.

### A5. Legacy pgTAP so `npm run test:db` can finish

**Cause.** `0028_anon_public_reads.test.sql` inserts `tournaments.ref` (column is `slug`). `0029` expects `bracket_snapshots`. `0030` expects `league_members`. `31_match_structure` fails when slug `syn-16` is already in the local database.

**Change.** Rewrite `0028`–`0030` against the current public read model (`public_calendar`, current league tables), or move them under `supabase/tests/archive` and drop them from the pgTAP runner. For `31`, delete fixture slug `syn-16` inside the test transaction (it already rolls back) or document a clean `db reset` before the suite. Do not disable the files.

**Done when.** `npm run test:db` exits 0, including the Node integration files that run after pgTAP.

### A6. Record ops blockers (no code)

| Item | Action |
|------|--------|
| Real provider chain | Load `RAPIDAPI_KEY` from `.env.provider` in the shell (do not commit it). Run `npm run probe:rapidapi`, then one listener cycle `npm run listen:provider` against a carried tournament. If no match is in play, mark checklist **M3-OPS1–3** as **Blocked — real provider verification** and keep `npm run replay:live` as the replay pass. |
| Cron actually ran | `npm run prove:cron` or `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 20` on the database that runs cron. |
| MEGA / socket | Written founder yes/no. Until yes, do not open a provider socket. REST + `/ws-token` stays the listener. |
| Raw HTML | `LIVE_BASE_URL=http://127.0.0.1:3001 npx playwright test e2e/raw-html.spec.ts` from `apps/web`. |

**Wave A exit.** Checklist M3-E1–E15 are Pass or explicitly Blocked (ops only). `ci:live-trust` still passes. No new settlement call in live files.

---

## Wave B — only after Wave A

Milestone 4 from the plan. Create these files; do not fold them into live ingest.

| Step | File | Rule |
|------|------|------|
| B1 | `packages/core/src/live/consequence.ts` | `reasonsFor()` pure. Params, not sentences. Priority 0 is a flag against the user’s pick. |
| B2 | `packages/core/src/live/importance.ts` | `normal` / `important` / `critical`. No Stage, colour, or sentence strings. Add a CI grep beside `ci:live-trust`. |
| B3 | `packages/core/src/live/ceiling.ts` | BANKED / PROJECTED / CEILING. Tests I1–I4 on `fixtures/prototype-timeline.json`. PROJECTED is not stored. |
| B4 | Confirm advancement latch | Read `applyMatchResults` / parent advance. If a settled winner cannot change, document that before any Ceiling UI. There is no `apply_bracket_state` in this repo. |
| B5 | `apps/web` Stage | `stagePolicy.ts` renders `morning`, `live`, `next` only. `urgent` and `cascade` stay unrendered. Server page paints first; the island only patches live fields. |
| B6 | i18n | Every new reason kind in `en`, `es`, and `ja` in the same change. |
| B7 | Realtime ceiling | Confirm the Supabase concurrent-connection limit before a load test. |

**Still do not build:** Heat on a public page, League Swing, projected standings, visitor Pulse, `pulse_events`, Redis, a read replica, a second ingest function.

---

## What not to change

- `settleAll` / `apply-results` remain the only advancement writers.
- Equal or older `occurred_at` stays a no-op (`0037`, `patch.ts`).
- Duplicate raw payloads stay one `platform_events` hash.
- Unknown match → archive, no invented seat. Unknown serve → null. Underivable flag → null.
- `packages/core/src/pulse.ts` is the daily league narrative. Do not turn it into V3 Pulse.
- Bracket pages stay server components. `LiveMatchLayer` only portals into existing cells.

---

## Acceptance commands (Wave A)

```text
npm run ci:live-trust
npm run test -w @matchread/web
npm run test -w @matchread/listener
npm run test -w @matchread/provider-rapidapi
node --test packages/provider-rapidapi/src/live-ingest.integration.test.js
npx supabase test db
npm run replay:live
```

From `apps/web`, after the local Next server is up:

```text
npx playwright test e2e/live-client.spec.ts
npx playwright test e2e/raw-html.spec.ts
```

Record exit codes in [`worksheet.md`](./worksheet.md). Update the snapshot at the top of [`V3-MILESTONE-CHECKLIST.md`](./V3-MILESTONE-CHECKLIST.md) when a wave finishes.
