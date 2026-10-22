# V3 test plan (repository scripts only)

Commands below exist in root [`package.json`](../package.json), workspace packages, or [`architecture/infrastructure/ops-scripts.md`](../architecture/infrastructure/ops-scripts.md).  
Do **not** invent script names.

Record **command + exit code + counts** in [`worksheet.md`](./worksheet.md).

---

## 0. Environment prerequisites

| Requirement | Verify |
|-------------|--------|
| Node ≥ 20.11 | `node -v` |
| Local Supabase (integration + pgTAP) | `npx supabase status` |
| Migrations applied | `npx supabase db reset` (destructive) or migrate profile per ops docs |
| Playwright chromium | `npx playwright install chromium` from `apps/web` |
| Secrets for live ops | `RAPIDAPI_KEY`, `INGEST_SECRET`, `MATCHREAD_INGEST_URL` in env or `.env.provider` — **never commit** |

---

## 1. Trust boundary first (M3 day 1 — run before listener changes)

Run in this order. **Any failure blocks M3 merge.**

| Step | Command | Expect |
|------|---------|--------|
| T0.1 | `npm run ci:live-trust` | exit 0, “live trust guard ok” |
| T0.2 | `node --test packages/provider-rapidapi/src/live-ingest.integration.test.js --test-name-pattern "does not settle"` | both tests in suite pass |
| T0.3 | `npm run test -w @matchread/provider-rapidapi -- src/trust-contract.test.js` | includes CI guard spawn |
| T0.4 | `npm run test -w @matchread/web -- lib/live/trust.test.ts` | type boundary |

**Trust proof artifact:** integration asserts `matches`, seats, settlement claims unchanged after terminal live frame; pgTAP `42_live_match_limits` (no `winner_side` on matches).

---

## 2. Full automation matrix (STEP 87 equivalent)

### 2.1 Static / CI-shaped (no DB)

| Area | Command | Notes |
|------|---------|-------|
| Lint | `npm run lint` | all workspaces |
| Typecheck | `npm run typecheck` | listener + web + core |
| Consumer boundary | `npm run ci:consumer-boundary` | public_calendar |
| Live trust | `npm run ci:live-trust` | repeat after live edits |
| Settlement math | `npm run verify:settlement` | also runs inside core test script |

### 2.2 Unit / package tests

| Area | Command | Typical count |
|------|---------|---------------|
| Core (+ settlement script) | `npm run test -w @matchread/core` | 39 + verify script |
| Provider (normalizer, client, chaos, invariants) | `npm run test -w @matchread/provider-rapidapi` | 266 |
| Listener | `npm run test -w @matchread/listener` | 23 |
| Web unit | `npm run test -w @matchread/web` | 131 (known unrelated fail: synthetic SQL CRLF) |
| All workspaces | `npm run test` | fails if web fail |

### 2.3 Postgres integration (“ingest-events” path)

Plan name **`ingest-events`** → run:

```bash
node --test packages/provider-rapidapi/src/absence-gap.integration.test.js packages/provider-rapidapi/src/live-ingest.integration.test.js packages/provider-rapidapi/src/provider-event-map.integration.test.js
```

Or root:

```bash
npm run test:db
```

**Note:** `test:db` runs **`npx supabase test db` first**; if pgTAP fails, Node integration may not run. For M3-only gate, run Node line above after live pgTAP subset passes.

**M3-critical integration suites:**

- `does not settle from a socket event`
- `live boundaries` (4 tests)
- `out-of-order live frame`
- `REST and socket disagreement`
- `listener restart`
- `two listeners` (fix isolation if fail)

### 2.4 pgTAP

```bash
npx supabase test db
```

**M3-focused files (prioritize when full suite is red on legacy tests):**

- `36_unmapped_live_event.test.sql`
- `37_live_match_state.test.sql` through `46_live_state_access.test.sql`
- `35_provider_event_map.test.sql`
- `40_live_state_rls.test.sql`
- `41_live_realtime_publication.test.sql`
- `41_platform_events.test.sql`
- `42_live_match_limits.test.sql`
- `43_live_monotonic_upsert.test.sql` … `45_live_monotonicity.test.sql`

**Pre-existing failures (record separately, do not disable):**

- `0028`–`0030` — schema name drift vs tests
- `31_match_structure` — duplicate `syn-16` if DB dirty
- `apps/web/lib/brackets/server-render.test.ts` — CRLF fixture sync

### 2.5 Replay and chaos (M3.14)

| Command | Purpose |
|---------|---------|
| `npm run replay:live` | Prototype timeline → `acceptForwardedLive` dry-run |
| `npm run test -w @matchread/provider-rapidapi -- src/live-chaos.test.js` | Failure-mode analogues |
| `npm run test -w @matchread/provider-rapidapi -- src/live-invariants.test.js` | I5/I6/I7 property-style |
| `npm run test -w @matchread/provider-rapidapi -- src/live-replay-harness.test.js` | Harness + captures |

### 2.6 Playwright E2E

From `apps/web`:

```bash
# Production checklist (hosted)
npm run test:live

# Local M3 client suite (requires Next on 3002 + local Supabase)
# Start server with E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY — see e2e/live-client.spec.ts header
$env:LIVE_CLIENT_URL="http://127.0.0.1:3002"
npx playwright test e2e/live-client.spec.ts

# M2 raw HTML (server content)
$env:LIVE_BASE_URL="http://127.0.0.1:3001"
npx playwright test e2e/raw-html.spec.ts
```

**M3 E2E mapping:**

| Test file | M3-E ids |
|-----------|----------|
| `live-client.spec.ts` | E1, E3, E7, E8, E9, E10, E11 |
| `live-checklist.spec.ts` | broader product live (hosted) |

---

## 3. Milestone-specific minimum gates

### M1 minimum

```bash
npm run test -w @matchread/core
npm run test -w @matchread/provider-rapidapi -- src/reconcile-provider.test.js src/match-facts.test.js
node --test packages/provider-rapidapi/src/absence-gap.integration.test.js
npm run test -w @matchread/web -- lib/tournaments/lock-when.test.ts lib/tournaments/format.test.ts tests/match-route.test.ts
```

Manual: cron evidence (`prove:cron` or SQL on hosted).

### M2 minimum

```bash
npm run test -w @matchread/web -- lib/brackets/read-model.test.ts tests/match-route.test.ts
npx supabase test db -- supabase/tests/31_match_structure.test.sql supabase/tests/32_match_session.test.sql supabase/tests/33_match_start_clock.test.sql
npx playwright test e2e/raw-html.spec.ts
```

Manual: tree on mobile width.

### M3 minimum (release candidate)

All of **§1 Trust boundary** plus:

```bash
npm run test -w @matchread/listener
npm run test -w @matchread/provider-rapidapi
npm run ci:live-trust
node --test packages/provider-rapidapi/src/live-ingest.integration.test.js
npx playwright test e2e/live-client.spec.ts
```

pgTAP: live block **38–46** green on clean DB.

Optional ops:

```bash
npm run listen:provider
npm run probe:rapidapi
```

### M4 minimum (when implemented)

```bash
npm run test -w @matchread/core -- src/live/consequence.test.ts src/live/ceiling.test.ts
npm run ci:live-trust   # extended grep for Stage in core
# Playwright Stage specs (to be added with M4)
```

---

## 4. Failure-mode test map (plan M3 § F01–F21)

Run the bundle once for audit:

```bash
npm run test -w @matchread/provider-rapidapi -- src/live-chaos.test.js src/reconnect.test.js src/listener-overlap.test.js src/live-archive.test.js
npm run test -w @matchread/web -- lib/live/patch.test.ts lib/live/provider-down.test.ts lib/live/disconnect.test.ts
npm run test -w @matchread/listener
```

| Code | Primary test owner |
|------|-------------------|
| F01 | `reconnect.test.js`, listener reconnect tests |
| F02 | `live-client.test.js`, chaos token |
| F03 | `live-archive.test.js`, `live-invariants.test.js` |
| F04 | pgTAP 43–45, integration out-of-order |
| F05 | integration unknown match |
| F06 | integration missing player mapping |
| F07 | `point-flag.test.js` / `normalize.test.ts` |
| F15 | integration REST/socket disagreement |
| F17 | `live-client.spec.ts` background |
| F18 | `live-client.spec.ts` reconnect |
| F19 | integration listener restart |
| F20 | `listener-overlap.test.js`, integration two listeners |
| F21 | `provider-down.test.ts`, integration provider unavailable |

---

## 5. Invariants I1–I7

| Invariant | When | Command |
|-----------|------|---------|
| I5 | M3 | `live-invariants.test.js`, `normalize.test.ts` |
| I6 | M3 | `live-invariants.test.js`, integration duplicate/restart |
| I7 | M3 | `patch.test.ts`, integration out-of-order |
| I1–I4 | M4 | **Not yet** — add with `ceiling.test.ts` |

---

## 6. Manual / ops tests (not npm)

| Action | When |
|--------|------|
| Founder `/founder/integrity` tiles | M3.13 sign-off |
| `POST sync-facts` with `mode:live` + `INGEST_SECRET` | ingest auth |
| Railway deploy + `GET /health` on listener | M3-DEP |
| Browser: no service role in bundle | search built `.next` for `service_role` (should absent) |
| Real provider E2E chain | M3-OPS — **Blocked** without key + live event |

---

## 7. Recording template

```text
Date:
Git ref:
Supabase: local | hosted

| Command | Exit | Pass/Fail | Notes (counts) |
|---------|------|-----------|----------------|
| npm run ci:live-trust | | | |
| … | | | |

Pre-existing failures (do not count against M3 if unchanged):
- server-render.test.ts CRLF
- pgTAP 0028–0030
- …
```

---

## 8. Last recorded run (2026-10-10, local)

Re-run before sign-off. Counts are from that session, not a guarantee of the next run.

| Command | Result | Counts / notes |
|---------|--------|----------------|
| `npm run lint` | Pass | all workspaces |
| `npm run typecheck` | Pass | provider JS skips tsc by design |
| `npm run ci:live-trust` | Pass | 41 files |
| `npm run ci:consumer-boundary` | Pass | |
| `npm run verify:settlement` | Pass | |
| `npm run test` | Fail | web 130/131; `server-render.test.ts` synthetic SQL **CRLF** drift (pre-existing) |
| `npm run test -w @matchread/listener` | Pass | 23 |
| `npm run test -w @matchread/provider-rapidapi` | Pass | 266 |
| `npm run test -w @matchread/core` | Pass | 39 + settlement script |
| `npm run test:db` | Fail | pgTAP `0028`–`0030` schema drift; `31` duplicate `syn-16`; `37` test 6 `occurred_at` |
| `node --test` absence + live-ingest + provider-event-map | Fail | 17/18; **two listeners** overlap assertion |
| `npm run replay:live` | Pass | prototype timeline dry-run |
| `npx playwright test e2e/live-client.spec.ts` | Fail | 4 pass, 1 fail (provisional), 1 skipped (serial) |
| `e2e/raw-html.spec.ts` | Not run | needs `LIVE_BASE_URL` |
| Real provider listener → browser | Blocked | `RAPIDAPI_KEY` not in shell |

**Do not disable** the failing tests. Record them as pre-existing or M3-open in [`worksheet.md`](./worksheet.md).

## 9. Suggested CI parity (GitHub Actions)

Current [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs: lint, typecheck, `npm run test`, consumer boundary, live trust, verify settlement, build.

**Not in CI today (add before M3 “done”):**

- `npm run test:db` or live pgTAP subset
- Playwright `live-client.spec.ts`
- Integration `live-ingest.integration.test.js`

Document any local-only Pass in worksheet until CI catches up.
