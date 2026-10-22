# V3 Four-Milestone Plan — analysis vs this repository

**Source plan:** [`MatchRead-V3-Four-Milestone-Plan.md`](../../../../MatchRead-V3-Four-Milestone-Plan.md) (6 Oct 2026; lives beside the `mh-2` folder under `Study/`)  
**Runtime truth:** [`architecture/README.md`](../architecture/README.md), [`architecture/data-flows.md`](../architecture/data-flows.md)  
**This analysis does not change product code.**

---

## 1. What the plan optimizes for

The plan compresses a ~12-week Handoff into **four one-week milestones**:

| Milestone | Theme | Product outcome |
|-----------|--------|-----------------|
| **M1** | Truth and capture | Settled scores/winners/times; provider bytes archived; cron proven; Sentry |
| **M2** | Structure | Tree bracket, sessions/courts, `/matches/[ref]`, server-first HTML |
| **M3** | Socket foundation | Listener → ingest → `live_match_state` → Realtime → minimal live UI; **trust boundary test-proven** |
| **M4** | Consequence + calm Stage | `reasonsFor`, Ceiling, `morning` / `live` / `next` — **not** Pulse/urgent/cascade |

Non-negotiables repeated in every milestone: **`settleAll()` / official reconciliation own advancement**; live never settles; anon-only web; public refs on the wire; no second ingest front door.

---

## 2. Critical plan ↔ repo mappings (read before checking)

| Plan assumption | This repo (Oct 2026) | Check impact |
|-----------------|----------------------|--------------|
| `ingest-events` Edge function | **`sync-facts`** only; legacy URLs rewrite to `/sync-facts` | Use `POST /functions/v1/sync-facts`, `mode: "live"` |
| `apps/listener` opens **Socket.IO** | **REST** `GET …/events/live`; **`/ws-token` for HTTP auth only**; no production socket | M3 “socket” checks = **live pipeline**, not socket bytes, until MEGA/socket ships |
| Migration **`0033_live_state.sql`** | Live chain **`0027`–`0041`** (`live_match_state`, `provider_event_map`, `platform_events`, monotonic RPC, Realtime, heartbeat) | Confirm head with `ls supabase/migrations` — do not renumber blindly |
| `packages/settlement/src/reconcile.ts` | Reconcile lives in **`packages/provider-rapidapi`** + **`supabase/functions/_shared/apply-results.ts`** | M1.6 / scoreline checks target provider + Edge, not a `settlement` package path |
| `matches.scoreline` | **`matches.official_score`** (+ fact fields from `0022`) | Plan wording “scoreline” → **`official_score`** in checks |
| `npm:@matchread/core@^0.1.0` on registry | **Private workspace `0.0.0`**; Edge uses **`_shared/core.js` mirror** | M1.0 item is **N/A for publish**; verify **`edge-grade.test.ts`** parity instead |
| Listener **`railway.json`** | **`.railway/railway.ts`** ADR | Deploy checks read Railway TS, not JSON |
| M3.4 column `status` on live row | **`phase`** (`in_play`, `suspended`, `provisional_final`) | Normalizer/DB docs in `architecture/data-model.md` |
| M3.11 staleness **60 s** | Product label **`LIVE_STALE_MS` = 45 s** (listener stale **90 s**) | Assert documented thresholds, not plan prose alone |

---

## 3. Dependency register (plan §0.3) — current read

| ID | Dependency | Plan gate | Repo status | Evidence |
|----|------------|-----------|-------------|----------|
| **D1** | MEGA + `/ws-token` commercial | End M1; blocks real M3 socket | **Open** — REST token path **observed** in capture; **socket not built** | `docs/provider-capture-findings.md` |
| **D2** | Migration head + `0031`/`0032` | Day 1 M1 | **Head `0041_live_overlay_open.sql`**; reconciliation via **`apply-results`** + pgTAP `25_reconciliation` | `supabase/migrations/` |
| **D3** | Published `@matchread/core` | Day 1 M1 | **N/A** — use mirror + `npm run test -w @matchread/core` | `architecture/infrastructure/edge-functions.md` |
| **D4** | Captured provider bytes | Start M3 | **Present (gitignored)** + **`fixtures/prototype-timeline.json`** | `npm run capture:live`, `npm run replay:live` |
| **D5** | Realtime connection ceiling | Before M4 | **Not recorded in repo** — confirm in Supabase dashboard before M4 load test |
| **D6** | `apply_bracket_state` latch | Before M4 Ceiling | **Document in M1.0** — settlement uses **`applyMatchResults` / parent advance**, not Handoff RPC name | Read `settle-advance.js`, league settle path |

---

## 4. Milestone completion snapshot (engineering audit, not a sign-off)

Use [`V3-MILESTONE-CHECKLIST.md`](./V3-MILESTONE-CHECKLIST.md) to re-verify. Summary:

| Milestone | Likely status | Why |
|-----------|---------------|-----|
| **M1** | **Mostly complete** | Score/winner/TBA/timezone/absence tests exist; Sentry wired (DSN optional); capture + findings doc; cron migrations present |
| **M2** | **Mostly complete** | `PublicOfficialDraw` / tree, session/court pgTAP, `/matches/[ref]`, `raw-html.spec.ts`, read-model tests |
| **M3** | **PARTIAL** | Trust boundary + ingest + listener + Realtime island shipped; **Playwright provisional E2E fail**; **no real-provider E2E**; **two-listener integration flake** |
| **M4** | **Not started (by design in plan defer)** | No `consequence.ts` / Stage in live path; Pulse in core is **league daily**, not V3 Pulse |

---

## 5. Architecture the plan draws vs what M3 built

**Plan diagram (conceptual):** provider frames → listener → ingest → `platform_events` + normalize → `live_match_state` → Realtime → **small client island** → **server bracket**.

**Repo implements that split**, with these explicit differences:

1. **Transport:** listener polls **REST live list**, not socket frames (socket remains future / MEGA-dependent).
2. **Settlement path stays separate:** `sync-facts` draw/results branches and **`settle-leagues`** / league **`settleAll()`** — live branch does not call them (`npm run ci:live-trust`).
3. **Dual-instance safety:** Railway **one replica** target; **dedupe authoritative in Postgres** (`platform_events.content_hash`, monotonic upsert) — not in-memory leader election.

---

## 6. Invariants and where to test them

| Invariant | Milestone | Automated owner |
|-----------|-----------|-----------------|
| **I5** Determinism (normalize) | M3 | `packages/core/src/live/normalize.test.ts`, `live-normalize.test.js`, `live-invariants.test.js` |
| **I6** Duplicate frames ≠ official change | M3 | `live-invariants.test.js`, `live-archive.test.js`, `live-ingest.integration.test.js` |
| **I7** Stale/out-of-order ≠ UI rollback | M3 | `apps/web/lib/live/patch.test.ts`, integration out-of-order, Playwright stale case |
| **I1–I4** Ceiling monotonicity | M4 | **Not shipped** — defer until `packages/core/src/live/ceiling.ts` exists |

---

## 7. Failure modes (plan M3 § F01–F21)

Plan lists **F01–F07, F15, F17–F21** for M3 week. Map to repo tests:

| Code | Plan meaning | Repo test / behavior |
|------|--------------|-------------------|
| F01 | Socket disconnect | **Analog:** provider read fail → reconnect backoff (`reconnect.test.js`, listener deploy tests) |
| F02 | Token expired | `live-client.test.js`, `live-chaos.test.js` token case |
| F03 | Duplicate | `equalForIngest`, `platform_events` hash, `live-invariants` I6 |
| F04 | Out-of-order | `upsert_live_match_state` RPC, integration + pgTAP `43`–`45` |
| F05 | Unknown match | `persistUnknownLive`, integration “unknown match” |
| F06 | Missing player → serve null | integration “missing player mapping” |
| F07 | Flag underivable → null | `point-flag.test.ts`, underivable tests |
| F15 | REST vs socket disagree | integration REST/socket disagreement; **`live_rest_disagreement`** ops row |
| F17 | Background → refetch | Playwright background test; `catch-up.ts` |
| F18 | Realtime disconnect | Playwright reconnect; `disconnect.ts` |
| F19 | Listener restart | integration + listener unit “restart” |
| F20 | Two listeners | `listener-overlap.test.js`; integration overlap (**fix isolation**) |
| F21 | Provider down | `provider-down.test.js`, overlay closed |

F09–F14 UI treatment remains **record, do not settle** (M1 gap/withdrawal + live archive).

---

## 8. Deferred scope (plan §7) — do not fail M3 for missing M4

Explicitly **out of four-week path:** `urgent`, `cascade`, projected standings, League Swing, visitor Pulse, Heat on public pages, Redis/read replica, `pulse_events` product table.

CI guard [`scripts/ci-live-trust.mjs`](../scripts/ci-live-trust.mjs) encodes “live branch must not reach” those product surfaces.

---

## 9. Recommended reading order for QA

1. This file (terminology + drift).  
2. [`V3-MILESTONE-CHECKLIST.md`](./V3-MILESTONE-CHECKLIST.md) — mark Pass / Fail / Blocked per item.  
3. [`V3-TEST-PLAN.md`](./V3-TEST-PLAN.md) — run automation in order; attach counts to worksheet.  
4. [`worksheet.md`](./worksheet.md) — copy a section for the milestone under review.  
5. Existing [`MANUAL-CHECKLIST.md`](./MANUAL-CHECKLIST.md) — production eye checks (still valid for M1/M2 regression).

---

## 10. Definition of Done (plan §8) vs this repo

| DoD item | Milestone | Repo status (2026-10-10) |
|----------|-----------|--------------------------|
| Terminal live frame does not set official winner, seat, or score | M3 | **Pass** — `live-ingest.integration` “does not settle” + “live boundaries” |
| `settleAll()` only advancement writer | M3 | **Pass** — live path does not call it; league UI `settleAll` is product-only |
| CI grep blocks settlement from live files | M3 | **Pass** — `npm run ci:live-trust` (41 files) |
| REST disagreement does not overwrite a settled winner | M3 | **Pass** — integration “REST and socket disagreement” / live boundaries |
| Withdrawal vs gap, never assumed | M1 | **Pass** — `absence-gap.integration.test.js` 3/3 |
| Live score without refresh | M3 | **Pass** — Playwright `live-client` test 1 |
| Survives listener restart + client reconnect | M3 | **Pass** — integration restart + Playwright reconnect |
| Background refetch, never replay | M3 | **Pass** — Playwright background test |
| Stale labelled; frozen score not “Live” | M3 | **Pass** — Playwright stale test |
| Provisional final does not advance; distinguishable | M3 | **Fail** — Playwright provisional stayed `data-resolution="live"` |
| Ceiling I1–I4, Stage morning/live/next | M4 | **N/A** — files not created |
| No new colour / `--mr-inverse` only | M4 | **N/A** until Stage ships |
| Tree, sessions, courts, server HTML | M2 | **Partial** — unit Pass; raw HTML E2E not run this audit |
| Sentry + founder health tiles | M1/M3 | **Partial** — code + `live-health.test.ts` Pass; DSN receipt and hosted cron not proven |
| Heat / Pulse / Swing / projected standings public | Deferred | **Absent on live path** (required) |

## 11. Highest-risk gaps to close before calling M3 “PASS”

1. **Trust boundary** — already green: `does not settle from a socket event` + `ci:live-trust`. Re-run on every M3-touching PR.  
2. **Provisional final E2E** — Playwright must show provisional UI **without** parent advance (plan exit + M3-E10/E11).  
3. **Real provider path** — optional for code complete, required for **operational** sign-off: listener → `sync-facts` → DB → browser with `RAPIDAPI_KEY` + carried tournament.  
4. **pgTAP hygiene** — legacy `0028`–`0030` / dirty DB failures are **environment debt**; live suite `36`–`46` is the M3 gate.  
5. **M4 not started** — do not conflate M3 socket foundation with Stage/consequence.
