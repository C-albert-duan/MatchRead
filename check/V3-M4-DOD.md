# V3 Definition of Done walk (plan §8)

**Run:** 2026-10-26, branch `v3/m4-core` (`main` @ `2756218` + M4 commits), local Supabase after a fresh `db reset`.
**Verdicts:** **Pass**, **Partial**, **Blocked** (ops or a missing input, not code), **N/A** (deferred by the plan or not in this repo).
**Decisions referenced:** [`docs/v3-m4-decisions.md`](../docs/v3-m4-decisions.md) (D-M4-1 … D-M4-10).

## Evidence from this run

| Suite | Result |
|---|---|
| pgTAP (`supabase test db`) | 32 files, 256 tests, **Pass** (includes `49` app_config, `50` stage_events) |
| DB integration (absence-gap, live-ingest, provider-event-map) | 18/18 **Pass** |
| Unit: core / web / provider / listener / scripts | 59 / 154 / 276 / 23 / 5, all **Pass** |
| `ci:live-trust`, `ci:core-vocabulary`, `ci:consumer-boundary`, `verify:settlement`, lint, typecheck, build | **Pass** |
| Playwright `my-tennis.spec.ts` | 4/4 **Pass** |
| Playwright `raw-html.spec.ts` | 2/2 **Pass** (now seeds its own calendar row when the target is local) |
| Playwright `live-client.spec.ts` | 6/6 on 8 of 10 runs. **2 failures**: the first run after `db reset` (cold Realtime, seen before), and 1 intermittent "shows stale" failure (see Finding F-1) |

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
| I7 (stale or out-of-order cannot roll the UI back) | **Partial** | Database (pgTAP `43`–`45`) and client patch tests pass; the browser shows an intermittent rollback by a snapshot paint (F-1) |
| `reasonsFor` / `classify` deterministic, no clock reads | **Pass** | Determinism tests; no `Date.now`/`new Date()` in `packages/core/src/live` |
| `flag` derived, never parsed; underivable is null | **Pass** | `point-flag.test.ts`. On real REST data it is always null (D-M4-1), so `critical` is unreachable there by design |
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
| `morning`, `live`, `next`, `reckoning` render; `urgent`, `cascade` not shown | **Partial** | `morning` and `live` are browser-verified; `next`, `reckoning` and `empty` are unit-tested (`stage-policy.test.ts`) only. `urgent` and `cascade` map to calm treatments |
| Inversion uses `--mr-inverse`; no new colour | **Pass** | No inversion is used yet (urgent not shipped); `packages/tokens` unchanged; M4 CSS adds no hex value |
| `ImportanceConfig` server-side and hot-reloadable; treatment map is a client constant | **Pass** | `app_config` row with a 60 s cache (D-M4-7); `STAGE_TREATMENT` |
| `packages/core` names no Stage, takeover, colour or sentence | **Pass** | `ci:core-vocabulary` (catches a planted violation) |
| Never on bracket entry; never steals focus | **Pass** | `tests/me-surface.test.ts` |
| `stage_events` counter on `/founder` | **Pass (code)** | pgTAP `50`, `stage-health.test.ts`; the founder page itself was not opened in a browser (needs `FOUNDER_EMAILS`) |

## Product

| Item | Verdict | Evidence |
|---|---|---|
| Daily Picks resolve only through `settle-slate` | **N/A** | Not in this repo (mobile) |
| Heat internal-only or absent | **Pass** | Absent |
| Fan identity below the live experience | **N/A** | Stretch item; rating tables are not in this repo |
| Pulse, visitor aggregates, League Swing | **N/A** | Deferred |

## Platform

| Item | Verdict | Evidence |
|---|---|---|
| Bracket is a tree; sessions and courts render | **Pass** | M2 suites |
| Pages paint server-side; no `Loading…` shell | **Pass** | `raw-html` 2/2; `my-tennis` raw HTML test |
| Score row survives 320 px; Ceiling triad 2×2 on mobile | **Pass** | Screenshots; `/me` and `/tournaments` scroll width exactly 320 at 320 px |
| Live dot stops when the tab is hidden | **Pass** | Existing `html[data-tab-hidden]` rule and `motion.test.ts` |
| `prefers-reduced-motion` removes live motion | **Pass** | `my-tennis` test 4 (badge animation `none`); promoted-row highlight disabled |
| Screen-reader protocol executed against the Stage and the bracket | **Blocked** | `docs/SCREEN-READER-PROTOCOL.md` is not in this repo and no screen reader was run. Structure is in place (one polite status region, no announced score ticks, no focus moves) |
| en/es/ja complete for every reason kind; build gate green | **Pass** | `reason-text.test.ts` checks every kind in all three locales; typecheck is the gate |
| Sentry reports client exceptions; `/founder` answers §22 | **Partial** | Founder tiles in place; Sentry receipt still **Blocked** (no DSN) |

## Findings

**F-1. Intermittent snapshot rollback in the live layer (M3 code).** One warm `live-client` run failed "shows stale": the cell ended with `data-live-sequence="0"` and an older observation than the frame the test had just written. The spec writes only sequences 1–6; sequence 0 is what a `/api/live` snapshot paint produces (the snapshot carries no sequence), and snapshot paints skip the ordering check in `acceptLiveEvent` by design. A snapshot fetched before a newer realtime frame but applied after it can therefore paint older state over newer. Rate here: 1 in 9 warm runs. Suggested fix: carry `occurred_at`/`sequence` in the snapshot columns and let a snapshot paint only when it is not older than the cell, or drop realtime frames received during a refetch and re-request. Not changed in this pass.

**F-2. Cold Realtime after `db reset`.** The first `live-client` run after a reset fails test 1 while Realtime warms up; reruns pass. A warm-up subscription in the spec's `beforeAll` would remove the noise.

**F-3. `gradeBracket().upside` is not a ceiling.** It counts only players who have already won a match, so it is 0 before play and rises as results arrive. M4 does not use it (D-M4-3). Any existing screen showing "upside" as a remaining maximum understates it early in a draw.

## Still blocked on ops (unchanged)

MEGA / `/ws-token` written decision · hosted `cron.job_run_details` proof · Sentry DSN receipt · listener deploy to Railway and a real-provider run (M3-OPS1–3) · Supabase Realtime connection ceiling (D-M4-8) · screen-reader protocol document.
