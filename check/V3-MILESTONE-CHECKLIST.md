# V3 milestone checklist (specific)

Derived from the [Four-Milestone Plan](../../../../MatchRead-V3-Four-Milestone-Plan.md).  
Record verdicts in [`worksheet.md`](./worksheet.md) (add a **V3** section) or a copy of this file.

**Verdict:** **Pass** / **Fail** / **Blocked** / **N/A**

**STOP** — do not mark the milestone Pass if any STOP item is Fail.

**Last engineering audit:** 2026-10-21 (local). Re-run [`V3-TEST-PLAN.md`](./V3-TEST-PLAN.md) before changing a verdict.

### Audit snapshot (2026-10-21)

| Check | Result |
|-------|--------|
| `npm run lint`, `npm run typecheck`, `npm run build` | **Pass** |
| `npm test` (all workspaces) | **Pass**: 472 tests (core 39, provider 266, web 134, listener 23, tokens 5) |
| `npm test` on a fresh clone (no gitignored captures) | **Pass**: the 5 capture-reading tests skip with a reason instead of failing CI |
| `ci:live-trust`, `ci:consumer-boundary`, `verify:settlement` | **Pass** |
| pgTAP (`npx supabase test db`) and DB integration tests | **Not run**: Docker engine not running |
| Playwright `live-client.spec.ts`, `raw-html.spec.ts` | **Not run**: needs local Supabase and Next |
| Hosted cron, Sentry receipt, MEGA decision, real provider chain | **Blocked**: ops, not code (see M1.7, M1.8, M1.10, M3-OPS) |

### Audit snapshot (2026-10-10)

| Milestone | Verdict | Blockers |
|-----------|---------|----------|
| **M1** | **Partial** | Cron *run* not proven this session (`prove:cron` / hosted `cron.job_run_details`). MEGA written decision **Blocked**. Score/winner/timezone/gap/Sentry-wiring/capture findings **Pass**. |
| **M2** | **Partial** | Tree, session/court, match route, TBA **Pass** in unit tests. `e2e/raw-html.spec.ts` **not run**. pgTAP `31` dirty on local DB. |
| **M3** | **Partial** | Trust boundary **Pass**. Playwright provisional **Fail** (M3-E10/E11). Real provider chain **Blocked**. Two-listener integration **Fail** (stale `listener_health` id `sync-facts`). |
| **M4** | **N/A** | Not started. Do not fail M3 for missing Stage. |

**M3 release rule:** M3.0 + M3.2 + M3-E5 + M3-E6 must stay **Pass**. M3 is not **Pass** until M3-E10 and M3-E11 are **Pass** and M3-OPS is **Pass** or explicitly **Blocked**.

---

## How to use

1. Read [`V3-PLAN-ANALYSIS.md`](./V3-PLAN-ANALYSIS.md) (plan vs repo names).  
2. Run automation from [`V3-TEST-PLAN.md`](./V3-TEST-PLAN.md) first; use this doc for gaps automation does not cover.  
3. For production eye checks, still use [`MANUAL-CHECKLIST.md`](./MANUAL-CHECKLIST.md) sections D–H.

---

## Cross-milestone — do not regress M1/M2 when shipping M3

| Id | Check | Pass criteria | Automation / surface |
|----|-------|---------------|----------------------|
| **X1** | Settled score renders | Official score visible on settled public match | `apps/web/tests/match-route.test.ts` |
| **X2** | Official winner renders | Winner presentation on settled match; no live provisional as official | same + bracket read-model tests |
| **X3** | Timezone / civil date | Evening UTC instant → correct viewer calendar day | `lib/tournaments/lock-when.test.ts`, `date.test.ts`, `format.test.ts` |
| **X4** | Withdrawal vs gap | Classified; unexplained absence does not settle | `absence-gap.integration.test.js` |
| **X5** | Cron / reconcile path | Migrations + pgTAP reconciliation exist; ops can prove cron | `0007_cron.sql`, `0009_sync_facts_cron.sql`, pgTAP `25_reconciliation.test.sql`; optional `npm run prove:cron` |
| **X6** | Sentry wired | Client/Edge can report when DSN set; no secrets in bundle | `report-error.ts`, `instrumentation.ts`; optional throw in dev with DSN |
| **X7** | Bracket server tree | Tournament page RSC; not client-only shell | `tournaments/[ref]/page.tsx` → `PublicOfficialDraw`; no `"use client"` on page |
| **X8** | Mobile tree usable | Horizontal round scroll / layout tests | `BracketGrid` / layout tests; manual narrow viewport |
| **X9** | Session / court | Stored labels render; date-only → TBA not fake clock | pgTAP `32_match_session`; `format.test.ts` |
| **X10** | TBA truthful | No invented kickoff from date-only row | `lock-when.test.ts`, pure-fact rules |
| **X11** | `/matches/[ref]` | Settled view; unknown ref 404 | `tests/match-route.test.ts` |
| **X12** | Raw HTML content | No `Loading…` shell in SSR HTML | `e2e/raw-html.spec.ts` (needs `LIVE_BASE_URL`) |
| **X13** | M3 island only | Live Realtime does not replace SSR bracket | `LiveMatchLayer` portals into cells; bracket still from RSC |

---

## M1 — Truth and capture

### M1.0 Day-one verification

| Id | Check | Pass criteria |
|----|-------|---------------|
| **M1.0a** | Migration head documented | Latest file under `supabase/migrations/` noted (expect **`0041_*`** live era) |
| **M1.0b** | Core Edge parity | `edge-grade.test.ts` or equivalent passes — **not** npm registry `@matchread/core` |
| **M1.0c** | Cron jobs defined | `cron.job` entries for sync + settle in migrations |
| **M1.0d** | Advancement latch understood | Document how official winner is written (`apply-results`, not live) |

### M1.1–M1.2 Capture and findings

| Id | Check | Pass criteria |
|----|-------|---------------|
| **M1.1** | Capture script | `npm run capture:live` appends NDJSON; no DB writes |
| **M1.2** | §24.0 questions | `docs/provider-capture-findings.md` marks Observed / Slam-only / Unknown |
| **M1.10** | MEGA / ws-token decision | Written founder decision for commercial socket — **Blocked** until recorded |

### M1.3–M1.6 Product truth

| Id | Check | STOP | Pass criteria |
|----|-------|------|---------------|
| **M1.3** | Scores on settled matches | | `official_score` populated via reconcile; UI shows score |
| **M1.4** | Viewer timezone | | Formatter tests multi-zone |
| **M1.5** | Settled ≠ upcoming | **STOP** | Distinct resolution / styling (`read-model`, status tests) |
| **M1.6** | Withdrawal vs gap | **STOP** | Integration absence tests 3/3 |
| **M1.7** | Cron actually ran | | `cron.job_run_details` rows on hosted DB, or `prove:cron` locally |
| **M1.8** | Sentry | | Config present; optional DSN |
| **M1.9** | Prototype timeline | | `fixtures/prototype-timeline.json` replays via `npm run replay:live` |

### M1 exit (plan §2)

- [ ] Every settled match on a walked published draw: score, winner, local time  
- [ ] Reconciliation/cron visible in ops evidence  
- [ ] Capture + findings for ATP and WTA paths  
- [ ] MEGA decision recorded or M3 real path explicitly **Blocked**

---

## M2 — Structure

| Id | Check | STOP | Pass criteria |
|----|-------|------|---------------|
| **M2.1** | Tree bracket | | `PublicOfficialDraw` / `BracketTree`; read-model one query |
| **M2.2** | Session + court | | pgTAP `32_match_session`, `33_match_start_clock`; backfill scripts documented |
| **M2.3** | Match route | **STOP** | `/matches/{public_ref}` 200; garbage ref 404 |
| **M2.4** | Server-first live page | **STOP** | Tournament page SSR; raw HTML spec |
| **M2.5** | Read model | | `loadTournamentReadModel` / bracket tests |
| **M2.6** | Synthetic bracket fixture | | `supabase/tests/fixtures/synthetic-bracket-16.sql` + pgTAP `31` |

### M2 exit

- [ ] Tree on desktop + mobile scroll  
- [ ] TBA for missing time  
- [ ] Match route + no Loading shell in HTML  
- [ ] Migration + pgTAP merged for session/court era  

---

## M3 — Live foundation (trust first)

### Preconditions (plan — do not skip)

| Id | Precondition | Status |
|----|--------------|--------|
| **M3-P1** | D1 MEGA / ws-token decision | |
| **M3-P2** | D4 captured bytes + findings | |
| **M3-P3** | M1 Sentry path | |

### Trust boundary (**day 1 — before listener**)

| Id | Check | STOP | Command / evidence |
|----|-------|------|-------------------|
| **M3.0** | Does not settle from socket/live terminal | **STOP** | `live-ingest.integration.test.js` suite “does not settle from a socket event” |
| **M3.1** | LiveOnly type boundary | | `apps/web/lib/live/trust.ts`, `trust.test.ts` |
| **M3.2** | CI grep | **STOP** | `npm run ci:live-trust` |
| **M3.2b** | No official winner writes in live ingest | **STOP** | integration “live boundaries” + socket-final case |

### Schema and ingest

| Id | Check | Pass criteria |
|----|-------|---------------|
| **M3.3** | `provider_event_map` | Migration `0029`; pgTAP `35`; map integration test |
| **M3.4** | `live_match_state` | Migrations `0027`–`0034`; pgTAP `37`–`46` (note env failures on legacy files) |
| **M3.5** | Monotonic upsert | RPC `upsert_live_match_state`; pgTAP `43`–`45` |
| **M3.9** | Ingest live branch | `sync-facts` + `project-live.ts`; `INGEST_SECRET` Bearer |

### Normalizer and client

| Id | Check | Pass criteria |
|----|-------|---------------|
| **M3.6** | Normalizer pure | `live-normalize.test.js`, captured shapes; flag null when underivable |
| **M3.8** | Provider client | `live-client.test.js`, `connectLive` REST + token lifecycle |

### Listener and deploy

| Id | Check | Pass criteria |
|----|-------|---------------|
| **M3.7** | Listener forward only | `@matchread/listener` tests; no DB in process |
| **M3.7b** | Graceful shutdown | deploy tests SIGTERM path |
| **M3.7c** | Single replica target, dual-safe | `.railway/railway.ts` replicas 1; overlap warning only |
| **M3-DEP** | Railway image | `apps/listener/Dockerfile`; secrets not in layers |

### Realtime and UI

| Id | Check | Pass criteria |
|----|-------|---------------|
| **M3.10** | Realtime granularity | One channel per tournament ref; subscribe → refetch |
| **M3.11** | Minimal UI | LIVE badge, score, serve when `a`/`b`; provisional copy |
| **M3.11b** | Stale label | Stale badge; not “Live” when past threshold |
| **M3.12** | Live repository | `server/repositories/live.ts`; `POST /api/live` |
| **M3.13** | Founder observability | `/founder/integrity`; `live-health.test.ts` |

### M3 failure modes (plan F01–F07, F15, F17–F21)

Mark each **Pass** when the mapped test in [`V3-PLAN-ANALYSIS.md`](./V3-PLAN-ANALYSIS.md) §7 is green.

### M3 exit criteria (M3-E1 … M3-E15)

| Id | Criterion |
|----|-----------|
| M3-E1 | Live update without refresh |
| M3-E2 | Survives listener restart |
| M3-E3 | Survives Realtime reconnect |
| M3-E4 | Flag / normalize on replay + captures |
| M3-E5 | Does not settle from socket event |
| M3-E6 | CI guard |
| M3-E7 | Background refetch, not replay |
| M3-E8 | Stale labelled |
| M3-E9 | Frozen score not shown as confident live |
| M3-E10 | Provisional final does not advance bracket |
| M3-E11 | Provisional distinguishable from official |
| M3-E12 | Founder heartbeat |
| M3-E13 | Founder mapped/unmapped |
| M3-E14 | Out-of-order cannot roll back |
| M3-E15 | Duplicate cannot alter official scoring |

### M3 operational (optional PASS tier)

| Id | Check | Blocked when |
|----|-------|--------------|
| **M3-OPS1** | Real provider → listener → sync-facts → DB | No `RAPIDAPI_KEY` / no live carried event |
| **M3-OPS2** | Browser LIVE without refresh on real event | Same |
| **M3-OPS3** | REST settlement after provisional | Official reconcile path on real match |

Mark **M3-OPS\*** **Blocked — real provider verification** when using replay-only acceptance (plan §89).

---

## M4 — Consequence and calm Stage (future)

Use this section when M4 work begins. **N/A for M3 sign-off.**

| Id | Check | Pass criteria |
|----|-------|---------------|
| **M4.1** | `reasonsFor` pure | `packages/core/src/live/consequence.ts` + tests |
| **M4.2** | `classify` / ImportanceConfig | No Stage strings in core (CI grep) |
| **M4.3** | Ceiling I1–I4 | Property tests on replay |
| **M4.9** | Stage states | `morning`, `live`, `next` only — not `urgent`/`cascade` |
| **M4.11** | i18n en/es/ja | Build gate for reason kinds |
| **M4.12** | a11y protocol | `docs/SCREEN-READER-PROTOCOL.md` executed |

**Deferred (must stay absent):** urgent takeover, cascade on socket, projected standings on public pages, visitor Pulse, Heat on shareable URLs.

---

## Milestone sign-off summary

| Milestone | Sign-off rule |
|-----------|----------------|
| **M1** | All **STOP** items Pass; M1 exit bullets checked |
| **M2** | All **STOP** items Pass; X7–X13 Pass |
| **M3** | M3.0, M3.2, M3-E5, M3-E6 **STOP**; ≥ M3-E1–E15 documented; OPS tier explicit Pass or Blocked |
| **M4** | Separate release; D5/D6 confirmed first |
