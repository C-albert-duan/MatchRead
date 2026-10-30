# V3 Definition of Done walk (plan §8)

**Run:** 2026-10-26, branch `v3/m4-core` (`main` @ `2756218` + M4 commits), local Supabase after a fresh `db reset`.
**Verdicts:** **Pass**, **Partial**, **Blocked** (ops or a missing input, not code), **N/A** (deferred by the plan or not in this repo).
**Decisions referenced:** [`docs/v3-m4-decisions.md`](../docs/v3-m4-decisions.md) (D-M4-1 … D-M4-11).

## Evidence from this run

| Suite | Result |
|---|---|
| pgTAP (`supabase test db`) | 32 files, 256 tests, **Pass** (includes `49` app_config, `50` stage_events) |
| DB integration (absence-gap, live-ingest, provider-event-map) | 18/18 **Pass** |
| Unit: core / web / provider / listener / scripts | 64 / 166 / 276 / 23 / 5, all **Pass** |
| `ci:live-trust`, `ci:core-vocabulary`, `ci:consumer-boundary`, `verify:settlement`, lint, typecheck, build | **Pass** |
| Playwright `my-tennis.spec.ts` | 8/8 **Pass** (9/9 with the League Swing test added 2026-10-27) (every rendered Stage state: morning, live, next, reckoning, empty; and a live leader change re-ranks without a reload) |
| Playwright `raw-html.spec.ts` | 2/2 **Pass** (now seeds its own calendar row when the target is local) |
| Playwright `live-client.spec.ts` | Before the F-1 fix: 6/6 on 8 of 10 runs (one cold-Realtime failure after `db reset`, one intermittent "shows stale"). After the F-1 fix: 20/20 warm runs. **After the F-2 fix: 10/10 runs each straight after `db reset`, plus 10/10 warm** |
| Playwright `founder-stage.spec.ts` | 1/1 **Pass** (`/founder/integrity` as a founder: 3 Stage changes, busiest user-hour 3, event mark) |
| Playwright combined `my-tennis` + `raw-html` | 5 runs, 44/45: one failure in the first run after the live-client loop was not captured and did not recur in 4 reruns (36/36) |
| Playwright, all four local specs together | 3 runs on the final build, 17/17 each (51/51). With `LiveRerank` removed, the re-rank test fails as it should ("under pressure" still shown after 15 s) |

## Trust boundary

| Item | Verdict | Evidence |
|---|---|---|
| A terminal socket event never sets a winner, advances a seat, moves a score or fires a cascade | **Pass** | Integration "does not settle from a socket event" |
| `settleAll()` remains the only writer of advancement | **Pass** | `ci:live-trust`; M4 reads only (its one write is `stage_events`) |
| CI grep proves the live branch cannot reach settlement | **Pass** | `ci:live-trust` in CI |
| REST reconciliation records disagreements; a settled winner is never overwritten | **Pass** | Integration "REST and socket disagreement"; latch per D-M4-6 |
| Absence from a draw is classified as withdrawal or gap, never assumed | **Pass** | `absence-gap.integration.test.js` |

## Correctness

| Item | Verdict | Evidence |
|---|---|---|
| Ceiling never rises over a replayed tournament | **Pass** | `ceiling.test.ts` (300 random 16-draws); `replay-day.test.ts` (50 replayed days through the rendered My Tennis view) |
| `BANKED ≤ PROJECTED ≤ CEILING` at every frame | **Pass** | Same two suites, live and settled frames |
| An eliminated champion zeroes every forward node naming them in one pass | **Pass** | `ceiling.test.ts` |
| I1–I5 | **Pass** | Core and web property tests; BANKED equals `gradeBracket` at every frame |
| I6 (duplicates cannot change official scoring) | **Pass** | Integration + `live-invariants.test.js` |
| I7 (stale or out-of-order cannot roll the UI back) | **Pass** | pgTAP `43`–`45`; client patch tests; `snapshot-order.test.ts`; `live-client` 20/20 after the F-1 fix |
| `reasonsFor` / `classify` deterministic, no clock reads | **Pass** | Determinism tests; no `Date.now`/`new Date()` in `packages/core/src/live` |
| `flag` derived, never parsed; underivable is null | **Pass** | `point-flag.test.ts`. Match point is derived on real data from the tournament format (D-M4-1, revised 2026-10-27; `my-tennis.test.ts`, `live-rerank.test.ts`); break point stays null without a server |
| Latch documented; the settled-differs path exists | **Pass** | D-M4-6: first winner kept, `winner_conflict` in `ops_events`, founder tile |
| Projected standings never write a settled number | **N/A** | Deferred (Handoff Phase 3) |

## Live behaviour

| Item | Verdict | Evidence |
|---|---|---|
| Live score updates without a refresh | **Pass** | `live-client` test 1 |
| Survives listener restart and client reconnect | **Pass** | Integration restart; `live-client` test 2 |
| Background → refetch, never replay | **Pass** | `live-client` test 3 |
| Stale layer labelled; frozen score never presented as live | **Pass** | `live-client` test 4; `/me` hides live rows while the overlay is closed (`my-tennis` test 3) |
| Bracket does not advance on a provisional final; the interim state is legible | **Pass** | `live-client` tests 5–6 |

## The Stage (calm states)

| Item | Verdict | Evidence |
|---|---|---|
| `morning`, `live`, `next`, `reckoning` render; `urgent`, `cascade` not shown | **Pass** | All five rendered states are browser-verified in `my-tennis.spec.ts` (tests 1, 4, 5, 6, 7), plus `stage-policy.test.ts`. `urgent` and `cascade` map to calm treatments (D-M4-1) |
| Inversion uses `--mr-inverse`; no new colour | **Pass** | No inversion is used yet (urgent not shipped); `packages/tokens` unchanged; M4 CSS adds no hex value |
| `ImportanceConfig` server-side and hot-reloadable; treatment map is a client constant | **Pass** | `app_config` row with a 60 s cache (D-M4-7); `STAGE_TREATMENT` |
| `packages/core` names no Stage, takeover, colour or sentence | **Pass** | `ci:core-vocabulary` (catches a planted violation) |
| Never on bracket entry; never steals focus | **Pass** | `tests/me-surface.test.ts` |
| `stage_events` counter on `/founder` | **Pass** | pgTAP `50`, `stage-health.test.ts`, and `founder-stage.spec.ts` opens `/founder/integrity` as a founder (`FOUNDER_EMAILS` set on the local app) |

## Product

| Item | Verdict | Evidence |
|---|---|---|
| Daily Picks resolve only through `settle-slate` | **N/A** | Not in this repo (mobile) |
| Heat internal-only or absent | **Pass** | Absent |
| Fan identity below the live experience | **N/A** | Stretch item; rating tables are not in this repo |
| League Swing | **Pass** | Added after the walk (D-M4-12): `swing.test.ts`, `my-tennis.test.ts` "a match swings the league", and `my-tennis.spec.ts` "a locked league…swings the league" (a rival's bracket read through the user's own session; 9/9 on 2026-10-27, fails when the rival backs the same player) |
| Pulse, visitor aggregates | **N/A** | Deferred |

## Platform

| Item | Verdict | Evidence |
|---|---|---|
| Bracket is a tree; sessions and courts render | **Pass** | M2 suites |
| Pages paint server-side; no `Loading…` shell | **Pass** | `raw-html` 2/2; `my-tennis` raw HTML test |
| Score row survives 320 px; Ceiling triad 2×2 on mobile | **Pass** | Screenshots; `/me` and `/tournaments` scroll width exactly 320 at 320 px |
| Live dot stops when the tab is hidden | **Pass** | Existing `html[data-tab-hidden]` rule and `motion.test.ts` |
| `prefers-reduced-motion` removes live motion | **Pass** | `my-tennis` test 4 (badge animation `none`); promoted-row highlight disabled |
| Screen-reader protocol executed against the Stage and the bracket | **Blocked** | [`docs/SCREEN-READER-PROTOCOL.md`](../docs/SCREEN-READER-PROTOCOL.md) added 2026-10-27; it still needs a person to run it with NVDA and VoiceOver and fill in its Results table. Structure is in place (one polite status region, no announced score ticks, no focus moves) |
| en/es/ja complete for every reason kind; build gate green | **Pass** | `reason-text.test.ts` checks every kind in all three locales; typecheck is the gate |
| Sentry reports client exceptions; `/founder` answers §22 | **Partial** | Founder tiles in place; Sentry receipt still **Blocked** (no DSN) |

## Findings

**F-1. Live layer stuck "recovering" (M3 code). Fixed.** Root cause, from a browser trace: a foreground refetch sets `recovering`; if the Realtime channel reconnected while it was in flight (`begin()` moved to a new generation), the refetch's `finally` returned early on the generation check and never cleared `recovering`. From then on every frame was dropped as "during recovery", so a cell could sit on older data than the database. Fix, with regression tests in `apps/web/lib/live/snapshot-order.test.ts`:
- `begin()` resets `recovering`; a new generation reads its own snapshot.
- Frames that arrive while a foreground refetch is in flight (after the tab is visible) are held and applied after the snapshot instead of dropped. Frames missed while hidden are still not replayed.
- The `/api/live` snapshot carries `sequence` and `sequence_source`, so held frames order against what the snapshot painted (`view.test.ts` updated: ids still never leave the server).
- A snapshot whose provider clock is strictly older than the cell's no longer paints over it (the stored row only moves forward on that clock, 0037). A lower sequence alone still lets a snapshot replace the cell, as before.

**F-2. Frames lost before Postgres changes start flowing. Fixed.** Not only a cold test server: socket logs from a failing run after `db reset` showed the join reply at 0.5 s, the first snapshot read at about 4 s, and Realtime's "Subscribed to PostgreSQL" notice at 8 s. The layer took the join reply as the start of delivery, so a frame written between the snapshot read and the notice reached neither. Production has the same gap, just much shorter. Fix:
- `channel.ts` reports the `system` notice (`extension: postgres_changes`, `status: ok`) as `onPostgresReady`.
- If it arrives after the first snapshot started, the layer reads one more snapshot (`snapshotAfterPostgresReady` in `catch-up.ts`), after the first one finishes so the two never race. A notice before the first snapshot needs nothing.
- Tests: `channel.test.ts` (notice reported only for `postgres_changes` ok, and only while open) and `snapshot-order.test.ts`. `live-client.spec.ts` also pushes one warm-up frame in `beforeAll`.
- Result: 10/10 `live-client` runs straight after `db reset`, where it had failed about one run in three.

**F-3. `gradeBracket().upside` was not a remaining maximum. Fixed.** It counted only players who had won in the furthest round played. Before play it was 0, so `bracketHealth` read every bracket as finished and the league page showed **"In Trouble"** for all of them; early in each round it undercounted (a perfect 16-draw read 22 left to play for instead of 39 after one match), and Pulse's "N still to play for" lines showed the same wrong numbers. `championAlive` was also false before play. Fix:
- `knownEliminated()` in `grade.ts`: a player is out once a decided match shows it (the other feeder winner, or a pick on that match that did not win it). `upside` counts every open match whose pick is not out, plus the champion bonus while the final is open; `championAlive` is "not out".
- `perfectPicksRemaining()` uses the same rule (it undercounted the same way).
- The Edge copy in `supabase/functions/_shared/core.js` changes in step.
- Tests: `packages/core/src/upside.test.ts`: before play, early in a round, a beaten pick in all its later rounds, perfect picks remaining, and 200 replayed draws where `upside` equals M4's Ceiling minus Banked at every step, on both the core and Edge copies. All five failed on the old code.

**F-4. `/me` did not re-rank on live patches.** Scores patched in place, but the order, reasons, the Stage and Projected only followed on the 45 s background refresh, so a match that turned pressing could wait up to 45 s to rise. Fixed per D-M4-11: the live layer announces each paint (`lib/live/paint-event.ts`), and `LiveRerank` refreshes `/me` when a patch changes whether a match is live or who leads (core `leader`), at most every 5 s. Tests: `lib/me/live-rerank.test.ts` and `my-tennis.spec.ts` "a live leader change re-ranks the page without a reload" (passes in about 1 s; fails without the component).

**F-5. Untranslated founder caption.** `/founder/integrity` showed a hard-coded English "freshness" in two places. Now `founder.integrity.freshnessWarning` in en/es/ja.

## Still blocked on ops (unchanged)

MEGA / `/ws-token` written decision · hosted `cron.job_run_details` proof · Sentry DSN receipt · listener deploy to Railway and a real-provider run (M3-OPS1–3) · Supabase Realtime connection ceiling (D-M4-8) · a screen-reader run of the protocol.
