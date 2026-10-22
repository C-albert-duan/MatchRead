# MatchRead V3 — Four-Milestone Execution Plan

**Four one-week milestones derived from the V3 Live Experience Engineering Handoff (9 September 2026)**

Current Platform (V1, done) → Truthful Data → Structure → Socket Foundation → Consequence Engine + Calm Stage

| | |
|---|---|
| **Plan date** | 6 October 2026 |
| **Source document** | `MatchRead-V3-Live-Engineering-Handoff.md` (referred to below as "the Handoff"), with section numbers (§) pointing into it |
| **North Star** | `matchread-live.html` (V3 prototype), its `README.md` and `PRODUCT-NOTES.md`. Approved, not reopened here |
| **Baseline** | V1 is complete: draws, settlement, brackets, leagues, Daily Picks (mobile), ceiling snapshots. V3 adds the live layer on top and **never touches settlement** |
| **Duration** | 4 milestones × 1 week = 4 weeks |
| **Migration head** | The Handoff assumes `0030_replacement_search.sql`, with `0031_reconciliation` and `0032_draw_type` proposed. **V3 numbering starts at `0033`. Confirm the real head on day 1 before writing any migration** |
| **Status** | Planning document. Every item traces to a Handoff section |

Path labels follow the Handoff: **held** (the Handoff author read the file), **VERIFY** (named in the corpus, source unseen), **new** (does not exist; to be created).

---

## 0. Read this first

### 0.1 The Handoff is about 12 weeks of work; this plan is 4

The Handoff's own phase estimates add up as follows.

| Handoff phase | Estimate | Content |
|---|---|---|
| Phase 0.0 | 96-hour window | Provider capture script |
| Phase 0A | ~2 weeks | V3 blocking prerequisites |
| Phase 1 | ~2 weeks | Socket foundation |
| Phase 2 | ~3 weeks | Personal live and the Stage (four calm states) |
| Phase 3 | ~2 weeks | Competitive live (projection, swing, both futures) |
| Phase 4 | ~3 weeks | Pulse, urgent, cascade, Heat, visitor surface |
| Phase 5 | open-ended | Tuning, 0B cleanup, scale work |

Four weeks cannot hold all of that. This plan delivers a **thin vertical slice**: truthful data, a tree bracket with sessions, a working and trustworthy socket pipeline, and the calm Stage on real data. It deliberately defers Phases 3, 4 and 5 (see §7). That ordering follows the Handoff's own advice: ship the four calm Stage states first, and tune the dramatic ones later against a real draw.

### 0.2 The Handoff's most time-critical item has expired

The Handoff's §24.0 says the 96-hour capture window ran "from today (9 September) to Sunday 13 September", the last days of the US Open. That window is closed. The next Grand Slam is the Australian Open in January.

What this changes:

- **Capture still happens, in Week 1, against whatever live ATP and WTA events are running.** The capture script is recorder-only (no tables, no routes, no product risk), and most of the ten blocking provider questions are about the provider's behaviour, not about Slams specifically.
- **Questions that only a Slam can answer stay open** until January: feed volume at Slam scale, Slam-specific retirement/walkover/suspension behaviour, 64-match-day behaviour. Treat these as known unknowns, not blockers.
- **Everything in the Handoff that says "before Melbourne" now has a real deadline.** Replay a 64-match day through the pipeline before January (§7).

### 0.3 Hard dependencies that can sink the plan

| # | Dependency | Needed by | Owner | If it slips |
|---|---|---|---|---|
| D1 | **Provider MEGA plan and `/ws-token` licensing**. Commercially uncommitted per the Handoff (§3, §20) | End of M1 | Founder | M3 cannot connect a real socket. Fallback: build M3 against recorded NDJSON and the prototype `TIMELINE` fixtures only, and ship nothing live |
| D2 | **Migration head confirmed**, and whether `0031` / `0032` have landed | Day 1 of M1 | Launch engineer | If `0031` has not landed, reconciliation (the authoritative half of the trust boundary) is incomplete. Landing it displaces part of M1 |
| D3 | **`npm:@matchread/core@^0.1.0` resolves** on the registry | Day 1 of M1 | Launch engineer | If it 404s, every Edge Function 500s on first invocation. That is a P0 before anything else |
| D4 | **Captured provider bytes** (M1) | Start of M3 | Launch engineer | The normalizer must be written from real bytes, never from documentation. The last parser written from documentation scored 0 of 27 |
| D5 | **Supabase plan's concurrent Realtime connection ceiling** confirmed | Before M4 | Launch engineer | Handoff §20 asks for this before Phase 2, not during |
| D6 | **`apply_bracket_state` latch behaviour** read and documented | Before any Ceiling UI (M4) | Launch engineer | A Ceiling that is wrong and confident is worse than no Ceiling (§8) |

### 0.4 Rules that hold in every milestone (the Handoff's "do not break" list)

1. **`settleAll()` is the only writer of advancement.** Live events update the display, never the ledger.
2. **REST reconciliation is authoritative.** Fill a hole automatically; never change an answer.
3. **The cascade fires on settlement, never on the socket.** (The cascade itself is deferred, but the rule shapes M3's provisional-final handling.)
4. **`apps/web` holds only the anon key.** RLS is the enforcement boundary.
5. **Internal ids never reach the wire.** `[ref]`, not `[matchId]`.
6. **Colour means something.** Charcoal is the read, green is the data, red is a wrong read. Urgency is inversion, not colour, and `--mr-inverse` already exists. **No new colour is added.**
7. **`packages/core/src/league/pulse.ts` is the daily narrative and is not V3's Pulse.** Do not touch it. V3 uses `live/consequence.ts` and `live/feed.ts`.
8. **Do not add a second scheduler or a second ingestion front door.** `pg_cron` → Edge Function and `ingest-events` are the existing patterns.
9. **Every migration ships its pgTAP suite in the same commit.**
10. **Exploratory items stay exploratory.** Heat weights, League Swing constants, the Rating formula, the urgent trigger and the reckoning headline are the Handoff's own flagged guesses. None are scheduled as specified work.

---

## 1. Milestone overview

| | Milestone | Theme | Handoff scope | Primary outcome |
|---|---|---|---|---|
| **M1** | Week 1 | **Truth and capture** | Phase 0.0 (re-planned), 0A.1, 0A.2, 0A.3, 0A.6, 0A.10, Sentry | Every settled match shows a score, a winner and correct local time; real provider bytes are archived; the settlement and reconciliation cron jobs are proven to run |
| **M2** | Week 2 | **Structure** | 0A.4, 0A.5, 0A.7, 0A.8 | The bracket is a tree with sessions; `/matches/[ref]` exists; live pages paint server-side |
| **M3** | Week 3 | **Socket foundation** | 0A.9, Phase 1 | `apps/listener` runs; a live match updates the bracket without refresh; the trust boundary is test-proven |
| **M4** | Week 4 | **Consequence and the calm Stage** | Phase 2 (trimmed) | `reasonsFor`, `classify`, Ceiling triad, ordered match rows, Stage states `morning` / `live` / `next` (+ `reckoning` if time allows) |

### Dependency chain

```
M1 truthful data ──► M2 tree + sessions + match route ──► M3 socket + live_match_state ──► M4 consequence + Stage
       │                                                         ▲
       └── capture (NDJSON) ─────────────────────────────────────┘   (normalizer built from real bytes)
       └── D1 MEGA decision ─────────────────────────────────────┘
```

A late M1 pushes everything. If M1 overruns, protect the capture and the scoreline work first (they unblock M3 and M4), and push 0A.2 and 0A.3 polish into M2.

---

## 2. Milestone 1 (Week 1): Truth and capture

### Goal

The platform today is a *draw viewer with an invisible engine behind it* (Handoff §1.3). Settlement resolves matches correctly, and then the UI renders none of the resolution. M1 fixes that and gathers the evidence M3 needs.

### Findings addressed

| Finding | Description | Severity |
|---|---|---|
| **L1** | No score rendered anywhere, on any match | P0 |
| **L2** | No winner marked on any settled match | P0 |
| **L3** | Bracket cannot distinguish "already happened" from "about to happen" | P0 |
| **L4** | Times render in UTC, filing evening US matches onto the next calendar day | P0 (it is the Daily Check's day boundary) |
| **L5** | Settled match carries a date with no time component | P1 |
| **P1** | Withdrawal and ingestion gap look identical (Sinner absent from the ATP draw) | P0 |

### Work items

| ID | Work | Files | Detail |
|---|---|---|---|
| **M1.0** | **Day-1 verification checklist** | — | Confirm migration head in `supabase/migrations`. Confirm `@matchread/core@^0.1.0` resolves on the registry. Run `select * from cron.job_run_details order by start_time desc limit 20` and record whether settlement and reconciliation are actually running. Read `0012`'s `apply_bracket_state` and write down whether it latches like `apply_grades` (`0004` L494). Confirm whether `0031` / `0032` have landed (D2) |
| **M1.1** | **Capture script (recorder, not a normalizer)** | `apps/listener/src/capture.ts` (**new**) | Node script that connects to the provider's live feed and appends every raw frame to NDJSON with a `receivedAt` stamp. Parses nothing. Touches no table, no migration, no route, so it needs no review gate. Run: `RAPIDAPI_KEY=… node capture.mjs --live --out fixtures/live-capture-oct-2026/`. **Capture the WTA path explicitly** (never exercised) and include REST fixtures for the same events so ids can be cross-checked |
| **M1.2** | **Answer the §24.0 questions from the captured bytes** | `docs/provider-capture-findings.md` (**new**) | Written findings for each question in the table below. Mark each as Observed, Not observable without a Slam, or Still unknown |
| **M1.3** | **0A.1 Render scores and winners** | `packages/settlement/src/reconcile.ts` (MODIFY), bracket match nodes (MODIFY) | Populate `matches.scoreline` from the completed-results archive in `reconcile.ts` (`matches.scoreline` has existed since `0001` L105). Render score plus a winner marker on every settled node. Includes a backfill for the ~250 existing US Open matches. Clear `provisional_winner` on settlement (the field arrives in M3, so add the clearing hook now and no-op it) |
| **M1.4** | **0A.2 One date formatter in the viewer's time zone** | `packages/…` shared formatter (**new**), consumers (MODIFY) | `preferences.time_zone` exists (`0020`). One shared formatter, asserted by a test that feeds evening-US UTC timestamps and checks the rendered calendar day for several time zones. Replace every ad-hoc date format on tournament, bracket and calendar surfaces |
| **M1.5** | **0A.3 A settled node never renders like an upcoming one** | bracket node component (MODIFY) | Distinct rendering for Scheduled / Official, with the ATP quarter-final pair (*Khachanov v Blockx* and *Zverev v van de Zandschulp*) as the regression case |
| **M1.6** | **0A.6 The withdrawal-versus-gap check** | `packages/settlement/src/reconcile.ts` (MODIFY) | Compare the local draw against the provider's entry list. A player absent from the draw **and** absent from the provider's fixture list is a withdrawal; absent locally but present upstream is an ingestion gap. **Never assume withdrawal. Never settle a draw with an unexplained absence.** Emit an S1 on any unexplained absence (Handoff §22). One query, since reconciliation already reads the authoritative archive |
| **M1.7** | **0A.10 Prove settlement and reconciliation are armed** | `cron.job`, `cron.job_run_details`, Founder dashboard | Verify by reading `cron.job_run_details`, not by reading code. Record `select jobname, schedule, active from cron.job` output in the findings doc |
| **M1.8** | **Connect Sentry** | `apps/web`, Edge Functions | Error tracking is absent everywhere today; a client exception is invisible. The live layer is the first continuously running browser code in the product. Handoff §22 requires Sentry before Phase 1 ships |
| **M1.9** | **Replay fixture from the prototype** | `fixtures/prototype-timeline.json` (**new**) | Extract `TIMELINE` from `matchread-live.html` to JSON. Sixteen steps across eleven hours of a scripted `live-events-all-update` sequence, including the break point, the champion's exit and the cascade. This is the replay harness's first fixture and is available before any real capture exists |
| **M1.10** | **Commercial decision: MEGA plan and `/ws-token`** | — | Not engineering work, but it is on the M1 checklist because it gates M3 (D1). Obtain a written yes/no from the founder by end of week |

### The ten blocking provider questions (Handoff §24.0)

| # | Question | Blocks |
|---|---|---|
| 1 | Is the fixture `id` the same as the Socket.IO `eventId`? | §5, the entire mapping chain |
| 2 | If not, what maps them? | §5 |
| 3 | Are player ids identical across REST and live? | §5, §6 |
| 4 | Is `seasonId` present in live payloads? | §5 tournament filtering |
| 5 | The actual `/ws-token` path and auth shape | §3, the listener cannot connect without it |
| 6 | Token lifetime | §3 refresh strategy |
| 7 | **Is there enough in the payload to derive `flag` reliably?** | §4, the field the whole interface reads |
| 8 | How retirement, walkover, suspension and cancellation appear live | §21 F09–F13 |
| 9 | Does the all-feed carry every ATP/WTA/Challenger/ITF match, and at what volume? | §3, §20 |
| 10 | Are day/night sessions inferable from start times? | P3, the basis of anticipation (used in M2) |
| 11 | **Is `live-events-all-update` a complete snapshot, a delta, or another shape?** | §3, gates `FEED_SHAPE` and the vanish path |
| 12 | **Are the payload field names what the prototype assumes?** (`completedSets`, `currentGameScore`, `servingPlayerId`) | §4, the normalizer is written from these |

Questions 8 (slam-specific cases) and 9 (Slam-scale volume) will only be partially answerable outside a Slam. Record what was observed and what remains open.

### Suggested day plan

| Day | Focus |
|---|---|
| 1 | M1.0 checklist; start M1.1 capture running in the background; M1.10 request to founder |
| 2 | M1.3 scoreline population and rendering (data side) |
| 3 | M1.3 rendering and backfill; M1.4 date formatter; M1.5 settled-node rendering |
| 4 | M1.6 withdrawal-versus-gap; M1.7 cron verification; M1.8 Sentry |
| 5 | M1.2 findings write-up; M1.9 replay fixture; M1 exit review |

### Tests

- **Unit:** the shared date formatter across at least UTC, `America/New_York`, `Europe/London`, `Asia/Tokyo` for evening-US matches (assert the correct calendar day).
- **Integration (real Postgres):** reconciliation populates `scoreline` for a completed match; a retirement scoreline round-trips; the gap check classifies one withdrawal and one injected gap correctly.
- **Regression:** the two ATP quarter-final rows render differently.

### Exit criteria

- [ ] Every settled match on both US Open draws shows a score, a winner marker and a correct local time
- [ ] A settled node never renders like an upcoming one
- [ ] A reconciliation run is visible in `cron.job_run_details`
- [ ] A player absent from a draw is classified as withdrawal or gap, never assumed
- [ ] Sentry reports a deliberately thrown client exception
- [ ] Raw captured frames (ATP and WTA) are archived and `provider-capture-findings.md` answers every §24.0 question it can
- [ ] The prototype `TIMELINE` exists as a JSON fixture
- [ ] Written MEGA / `/ws-token` decision from the founder
- [ ] `apply_bracket_state`'s latch behaviour is documented

### Risks

| Risk | Mitigation |
|---|---|
| `0031` / `0032` are not landed, so reconciliation is incomplete | Land `0031` first; defer M1.5 polish into M2 |
| No suitable live events are on during the capture week | Capture REST fixtures and the socket's idle behaviour anyway; extend the capture to run unattended across the week and into M3 |
| Capture shows the feed shape or field names differ from the prototype | That is the point. Record the real shape; M3's normalizer is written from it |
| Backfilling ~250 scorelines hits provider rate limits (100 req/min/IP) | Drive the backfill from the completed-results archive endpoint, which returns many matches per call |

---

## 3. Milestone 2 (Week 2): Structure

### Goal

Every V3 concept (the forward graph, ceiling exposure, "the winner plays your semi-finalist next", the anticipation model) assumes a **tree** with **sessions**. Building the Stage on a vertical list of 127 ties would mean building it twice (Handoff §1.3). M2 builds the structure the Stage stands on.

### Findings addressed

| Finding | Description |
|---|---|
| **P2** | The draw is a list of rounds, not a bracket (127 ties stacked vertically) |
| **P3** | Sessions are not modelled (no day/night concept; one QF has no scheduled time at all) |
| **P5** | No match-level route on web |
| **L8** | The pre-hydration shell ships `Loading…` and a stray `←Back` in server-rendered HTML |

### Work items

| ID | Work | Files | Detail |
|---|---|---|---|
| **M2.1** | **0A.4 Rebuild the bracket as a tree** | `apps/web/components/bracket/*` (VERIFY → **REBUILD**) | Render the draw as a tree, round by round, with feeder lines. Each node renders in the states from Handoff §13: Scheduled (viewer-time start plus session and court), Official (score plus winner marker), Advanced (seat filled by `settleAll()`), pick highlight (dashed rule for a pick still live, solid once settled). **The "live / flagged" and "provisional final" node states are left as hooks for M3.** Mobile: horizontally scrollable by round with the current round in view. The biggest single piece of M2, so it gets days 1–3 |
| **M2.2** | **0A.5 Model sessions** | `supabase/migrations/0033_…` or a prior-numbered migration (confirm head), `supabase/tests/…` | Add `matches.session` (`day` / `night` / `null`) with index `(tournament_id, slate_date, session)`. **Populate** `matches.court` (exists since `0001`; populate and render). **Backfill** session from provider start times, using the answer to question 10 from M1. Repair `starts_at` where the time component is missing (L5). pgTAP suite in the same commit. **Handle the null case explicitly**: a match with no scheduled time renders as "time to be announced", never as a guess |
| **M2.3** | **0A.8 The match route** | `apps/web/app/matches/[ref]/page.tsx` (**new**, Server Component), `loading.tsx` (**new**), `not-found.tsx` (**new**) | Route by `[ref]`, never `[matchId]` (`matches.external_ref` already exists and is unique). Render the settled view: players, score or scheduled time, round, court, session, and links back to the tournament. **Unknown ref → `not-found.tsx`. No live row → settled view with no island, which is the normal state for 99% of matches.** The live client island, both-futures columns and consequence layer land in M3 and M4 (and Phase 3). Match detail is a screen, not a sheet: matches are things people link to |
| **M2.4** | **0A.7 Server-render the live page** | `apps/web` tournament and My Tennis pages | First paint must not be a `Loading…` shell. *The stage is the page.* Remove the shell from the server-rendered HTML of every route (also closes L8). Assert in Playwright by fetching raw HTML and checking that real content is present and the string `Loading…` is not |
| **M2.5** | **Tournament-level read model for the tree** | `apps/web/server/repositories/*` (MODIFY) | A single repository query returns draw seats, matches and settled results in the shape the tree needs, so the page does not N+1 across 127 matches |
| **M2.6** | **Extend the replay fixture** | `fixtures/` | Add a 16- or 32-player synthetic bracket fixture with sessions, used for tree rendering tests and for M3's replay |

### Suggested day plan

| Day | Focus |
|---|---|
| 1 | M2.1 tree layout (desktop), M2.5 read model |
| 2 | M2.1 node states, connectors; M2.2 migration written with pgTAP |
| 3 | M2.1 mobile layout; M2.2 backfill and render of session/court |
| 4 | M2.3 match route; M2.4 server-render |
| 5 | Playwright coverage; accessibility pass on the tree; M2 exit review |

### Tests

- **pgTAP:** `matches.session` constraint and index; backfill leaves no row with an invalid value. Remember the environment quirk: `./scripts/db-run.sh` connects as `authenticator`, so `fk_ok` / `has_pk` cannot be used. Query `pg_catalog` instead (see `supabase/tests/27_locale.test.sql` for the worked example).
- **Playwright:** tournament page raw HTML contains no `Loading…`; `/matches/[ref]` resolves for a settled match and 404s for an unknown ref; the tree renders 127 ties for a 128 draw.
- **Visual:** a settled node and an upcoming node are visibly distinct (regression for L3).

### Exit criteria

- [ ] The bracket renders as a tree on desktop and mobile
- [ ] Sessions and courts render; matches without a time render as TBA
- [ ] `/matches/[ref]` resolves for a real match and 404s cleanly for an unknown ref
- [ ] The live page paints server-side, with no `Loading…` shell in raw HTML
- [ ] Migration plus pgTAP suite merged together

### Risks

| Risk | Mitigation |
|---|---|
| Tree rendering for 128 draws is heavy on mobile | Render by round with horizontal scroll and lazy-render off-screen rounds; keep it a Server Component, with no client island yet |
| Session inference (question 10) cannot be answered from start times | Fall back to a venue-schedule table seeded by hand for the current tournaments; mark the field `null` otherwise |
| `apps/web/components/bracket/*` is entangled with `BracketEditor` | Treat entry (editor) and viewing separately; V3 adds islands, it does not convert pages (Handoff §1.2) |

---

## 4. Milestone 3 (Week 3): Socket foundation

### Goal

Prove the live infrastructure end to end with the least possible UI: **a LIVE badge, a live score and a serve indicator. That is all.** A Stage on an unproven socket makes both harder to debug (Handoff, Phase 1).

> **LIVE CAN BE TEMPORARILY STALE. MATCHREAD MUST NEVER BECOME INCORRECTLY SETTLED.**

### Preconditions (do not start M3 without these)

- D1: written MEGA plan / `/ws-token` decision. If the answer is no, run M3 against replay only and do not deploy a listener
- D4: M1's captured bytes and findings document
- The Sentry integration from M1

### Work items

| ID | Work | Files | Detail |
|---|---|---|---|
| **M3.0** | **The contract test first: `does not settle from a socket event`** | `packages/settlement/src/*.test.ts` | Written **before the listener**. Feed a terminal socket frame; assert `matches.winner_side` is still null, `draw_seats` unchanged, `brackets.score` unchanged, and no cascade row written. If this ever goes green for the wrong reason, the trust boundary is gone |
| **M3.1** | **Type-level trust boundary** | `packages/core` | `LiveOnly<T>` branded type. `settleAll` accepts `OfficialResult`, never `LiveOnly<…>`, so a live frame reaching settlement is a compile error rather than a code-review catch |
| **M3.2** | **CI grep guard** | CI config | Fail the build if the live branch can reach `apply_grades`, `apply_bracket_state` or `settleAll` |
| **M3.3** | **`provider_event_map`** (0A.9) | `supabase/migrations/0033_live_state.sql`, `packages/settlement/src/repo.ts` (`findMatchByProviderEvent()`) | `(tour, provider_event_id) → match_id`. Unique `(tour, provider_event_id)`; index `(match_id)`; service-role plus founder access. **Backfill from `matches.external_ref`, using the answers to questions 1–3.** Identity is `(tour, providerMatchId)`, never a name. **An unmapped event is a log line and an archived payload, never a guess.** Verify the map against the M1 capture before the listener may write |
| **M3.4** | **`live_match_state`** | `0033_live_state.sql`, `supabase/tests/33_live_state.test.sql` | One row per match, upsert-only. Columns: `match_id` (pk), `tournament_id`, `status`, `sets`, `game`, `serving`, **`flag`**, `provisional_winner`, `occurred_at`, `received_at`, thin `stats`. Indexes: `(tournament_id, status)`; partial `where status='live'`; partial `where flag is not null`. RLS: read by **authenticated and anon** (scores are public); write by service role only. Swept 24 h after terminal. Add `match_status` values `default` and `suspended` as **its own migration step** (`ADD VALUE` cannot run in a transaction that also queries the value). pgTAP asserts `anon` reads `live_match_state` and gets zero rows from `pulse_events` once that table exists |
| **M3.5** | **Monotonic upsert** | `ingest-events` live branch | The ordering strategy in one statement (below). Out-of-order frames are a no-op |
| **M3.6** | **Normalizer with `flag` derivation** | `packages/core/src/live/state.ts`, `packages/core/src/live/normalize.ts` (**new**, pure, zero I/O) | `LiveMatchState` and `LiveFlag` types from Handoff §4. Provider → canonical: resolve to `Side` once; `game` as strings (`"40"`, `"AD"`, never integers); `serving` as `'a' \| 'b' \| null`; `provisionalWinner` (**never** `winner_side`). **Derive `flag` from `(sets, game, serving, format)`; when the format is ambiguous or the game score unparseable, emit `null`, not a guess.** Test every game state including tie-breaks and advantage. Field names come from **captured bytes** (M1), not documentation |
| **M3.7** | **`apps/listener`** | `apps/listener/` (**new**), `Dockerfile`, `railway.json`, `src/session.ts` | Railway container (ADR-0018 Tier 1). Holds the socket and forwards to `ingest-events`; **parses nothing, writes to no table.** Token lifecycle: fetch from `/ws-token`, refresh on `TOKEN_EXPIRED` (routine, INFO level), proactive timer **shipped disabled** until token lifetime is observed. Backoff `[1, 2, 4, 8, 15, 30, 60]s` with jitter; `STALE_AFTER_MS = 90_000`. **Shape-agnostic change detection** (compare each event to last known state for that `providerEventId`, forward only what differs; compare normalized state excluding `receivedAt`). `FEED_SHAPE` unset and the vanish path disabled by default. One batched POST per frame. One structured log line per tick (format below). Single active instance, but **no code that assumes it is alone** |
| **M3.8** | **Provider client additions** | `packages/provider-rapidapi/src/client.ts`, `parse.ts` (VERIFY → MODIFY) | `getWsToken()` and `connectLive()` if absent. The socket transport already exists and is tested, so **reuse, do not rewrite**. Live field aliases named from captured bytes |
| **M3.9** | **`ingest-events` live branch** | `supabase/functions/ingest-events/index.ts` (VERIFY → MODIFY) | Add `mode:"live"`. **Add no logic**: delegate to core. Pipeline: normalize → map → upsert `live_match_state` → record raw to `platform_events` (content-derived dedupe). A live event may set `matches.status = 'live'` and **nothing else** on that table |
| **M3.10** | **Realtime delivery** | `apps/web/components/live/useLiveTournament.ts` (**new**), publication on `live_match_state` | Supabase Realtime, Postgres Changes, **tournament granularity** (`live:tournament:{ref}`), not per match. Subscribe **then** refetch (never fetch then subscribe). `visibilitychange → visible`: refetch the projection, never replay. `CHANNEL_ERROR` / `TIMED_OUT`: backoff, then 30 s poll, then staleness banner. Unmount → `removeChannel` |
| **M3.11** | **Minimal live UI** | `apps/web/components/live/LiveScore.tsx` (**new**, client island), bracket node (MODIFY) | LIVE badge, live score, serve indicator. Stop the live-dot animation when the tab is hidden. Staleness banner after 60 s with no update. **Provisional final**: show the final score and a subdued "awaiting official result"; do **not** mark a winner in the data colour, do **not** fill the next-round seat |
| **M3.12** | **Live repository** | `apps/web/server/repositories/live.ts` (**new**) | The only place `live_match_state` is read in the web tier |
| **M3.13** | **Observability** | `apps/web/server/repositories/founder.ts` (MODIFY), `listener_health` | Heartbeat every 30 s. Tiles and thresholds from Handoff §22: socket connected (S1 > 2 min during play), last provider event (S2 at 5 min), `mapped=0` while `events_in>0` (S2), unmapped inside a carried tournament (S2), REST/socket disagreement (S1), `provider_freshness` finally rendered |
| **M3.14** | **Replay harness** | `packages/core/src/live/*.test.ts`, integration tests | Replay the prototype `TIMELINE` and the M1 capture through normalize → ingest. Chaos cases: kill the socket mid-set; expire the token mid-match; replay a frame twice; replay out of order; REST contradicts socket; restart the listener mid-tournament |

#### The monotonic upsert (Handoff §26)

```sql
insert into live_match_state as l (match_id, tournament_id, status, sets, game,
       serving, flag, provisional_winner, occurred_at, received_at)
values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
on conflict (match_id) do update
   set status = excluded.status, sets = excluded.sets, game = excluded.game,
       serving = excluded.serving, flag = excluded.flag,
       provisional_winner = excluded.provisional_winner,
       occurred_at = excluded.occurred_at, received_at = now()
 where excluded.occurred_at > l.occurred_at;   -- out-of-order frames are a no-op
```

#### Type-level boundary

```ts
declare const LIVE: unique symbol;
export type LiveOnly<T> = T & { readonly [LIVE]: true };
// settleAll accepts OfficialResult, never LiveOnly<…>.
```

#### Listener log line (one per tick)

```
ts=…14:02:11Z job=listener conn=up events_in=41 mapped=12 unmapped=29
changed=6 posted=6 flags=2 lag_ms=310 token_age_s=2044
```

A high `unmapped` count is healthy: the feed carries Challenger and ITF events MatchRead has no tournaments for. **`mapped=0` while `events_in>0` during a carried event is the alarm.**

### Failure modes to implement this week (Handoff §21)

| # | Failure | Behaviour |
|---|---|---|
| F01 | Socket disconnect | Backoff reconnect. Clients hold last state plus a staleness banner after 60 s. Settlement unaffected; the 5-minute REST sweep is the floor |
| F02 | Token expired | Clear, re-fetch, reconnect. Routine, INFO, not an incident |
| F03 | Duplicate event | Dropped twice: `equalForIngest`, then the content key in `platform_events` |
| F04 | Out-of-order event | Upsert rejects `occurred_at <= stored`; stale frame is a no-op |
| F05 | Unknown match | Archive and log. No table touched. Alarm only if the season id is a carried tournament |
| F06 | Missing player mapping | Persist with `serving = null`. Never guess a side |
| F07 | Flag underivable | Emit `flag = null`. A missing badge costs nothing; a false match point fires a takeover |
| F15 | REST / socket disagree | REST wins, always. Silent to the user, visible on `/founder` |
| F17 | Stale client from background | Refetch the projection; never replay |
| F18 | Realtime disconnect | Backoff → 30 s poll → staleness banner. Never a frozen score presented as live |
| F19 | Listener restart | Cache empty, so every event in the next frame is forwarded and dedupe absorbs it. First POST is large; batch it |
| F20 | Two listeners running | Duplicate POSTs absorbed by dedupe. Wasteful, not corrupting. Alert; do not architect against it |
| F21 | Provider down entirely | No live layer. The product degrades to REST-swept scores and **still works** |

F09–F14 and F16 (suspension, vanish path, retirement, walkover, cancellation, correction, withdrawal gap) are partly covered: F16 shipped in M1; F09–F14 are handled by recording and not settling. Full UI treatment is deferred.

### Suggested day plan

| Day | Focus |
|---|---|
| 1 | M3.0 contract test, M3.1 type guard, M3.2 CI grep, M3.3 and M3.4 migration plus pgTAP |
| 2 | M3.6 normalizer and flag derivation (unit-tested against capture and prototype fixtures), M3.8 client additions |
| 3 | M3.7 listener, M3.9 `ingest-events` live branch, M3.5 upsert |
| 4 | M3.10 Realtime hook, M3.11 minimal UI, M3.12 repository |
| 5 | M3.13 observability, M3.14 replay and chaos, deploy listener to Railway, M3 exit review |

### Tests

- **Unit (pure):** flag derivation for every game state, tie-break and advantage; unparseable → `null`; normalizer on every captured frame shape.
- **Property tests:** **I5** determinism; **I7** a stale or out-of-order frame cannot roll the UI backward; **I6** replaying duplicate frames cannot change official scoring (integration, real Postgres, snapshot `matches`, `draw_seats`, `brackets` before and after).
- **Integration:** unmapped event touches nothing; socket-final does not advance a seat; reconciliation fills a null winner and refuses to change a set winner.
- **RLS (pgTAP):** `anon` reads `live_match_state`; service role writes.
- **E2E:** score updates without refresh; state survives reconnect; provisional final does not advance the bracket.

### Exit criteria

- [ ] A live match updates on the bracket without a refresh
- [ ] Live state survives a listener restart and a client reconnect
- [ ] `flag` is derived correctly across the replayed prototype timeline and the captured frames
- [ ] `does not settle from a socket event` is green, and the CI grep is green
- [ ] A client returning from background recovers by refetch, never by replay
- [ ] A stale live layer is labelled; a frozen score is never presented as live
- [ ] The bracket does not advance on a provisional final, and the interim state is legible
- [ ] Founder dashboard shows the listener heartbeat and the `mapped` / `unmapped` health tiles

### Risks

| Risk | Why | Mitigation |
|---|---|---|
| **Provider identity mapping** | Whether `fixture.id === socket eventId` is unknown until M1 answers it | Until answered, unmapped events are a no-op. If M1 shows no direct mapping, M3.3 gains a mapping step (match by season, round and player ids) and the schedule is at risk |
| **Assuming the feed's shape** | Snapshot versus delta is documented but unobserved | Change detection works either way; the shape-dependent vanish path is gated off by default |
| **`flag` derivation** | The provider does not supply it; the whole interface reads it | Derive server-side; emit `null` rather than guess; if M1 shows the payload cannot support derivation, ship without flags and defer `critical` importance in M4 |
| **Settlement contamination** | The single failure that makes MatchRead untrustworthy | Type-level guard, CI grep, named test, all in the first day of M3 |
| **MEGA plan not approved** | Blocks any real connection | Fall back to recorded replay; do not deploy a listener |

---

## 5. Milestone 4 (Week 4): Consequence and the calm Stage

### Goal

Turn one normalized live state into **one consequence engine**, and render it as the calm half of the Stage.

> The API tells MatchRead what happened. MatchRead determines why it matters.
> One provider state → one normalization → one consequence engine → many user experiences.

### Scope note

The Handoff budgets about three weeks for this phase. In one week the scope is trimmed as follows (see §7 for the full defer list). The ordering of the work is the cut line:

| Priority | Items |
|---|---|
| **Must ship** | `reasonsFor()`, `classify()` + `ImportanceConfig`, `ceilingMaths()`, `myMatches` ordering, `MatchRow`, `CeilingTriad`, `stagePolicy.ts`, Stage states `morning`, `live`, `next`, i18n for every reason kind in en/es/ja, Ceiling monotonicity assertions |
| **Stretch** | Stage state `reckoning`, fan identity slot (four numbers, below the live experience, backed by existing rating tables), live state on Daily Picks `MatchCard.tsx` (mobile, Handoff §14 reading A) |
| **Cut** | `urgent`, `cascade`, projected standings, swing, Pulse, Heat, visitor surface, notifications |

### Preconditions

- D5: Supabase concurrent Realtime connection ceiling confirmed
- D6: `apply_bracket_state` latch behaviour known; if it latches, add the *settled and outcome differs → raise, record conflict* branch before any Ceiling UI

### Work items

| ID | Work | Files | Detail |
|---|---|---|---|
| **M4.1** | **`reasonsFor()` and `MATTERS_FLOOR`** | `packages/core/src/live/consequence.ts` (**new**, pure, zero dependencies, zero I/O) | Ported from the prototype. Returns `{prio, kind, params}` sorted ascending; **priority 0 is the most urgent thing in the product.** Priority table below. `MATTERS_FLOOR = 5` (a match with no reason at or above priority 5 does not appear in My Tennis). **Reasons carry parameters, not sentences**: `{ prio: 0, kind: 'flag', params: { flag: 'break-point', against: true, playerRef: 'alcaraz' } }`, because `packages/i18n` is build-gated on catalogue completeness (427 keys across en/es/ja) |
| **M4.2** | **`classify()` + `ImportanceConfig`** | `packages/core/src/live/importance.ts` (**new**) | `normal \| important \| critical`. Default thresholds `criticalAtOrBelow: 0` (and requires a live flag), `importantAtOrBelow: 2`. Config is **server-side and hot-reloadable**. Exports `MatchConsequence` with domain fields only: `matchRef`, `importance`, `reason`, `params`, `ceilingDeltaIfLost`, `leagueRankIfLost`, `affectedForwardNodes`, `reasons[]`. **The words "stage", "takeover", a colour, a component name or a rendered sentence appear nowhere in `packages/core`** (asserted by a CI grep) |
| **M4.3** | **`ceilingMaths()`, `forwardStatus()`, `POINTS`** | `packages/core/src/live/ceiling.ts` (**new**); reconcile with `packages/core/src/tournament/scoring.ts` (VERIFY) | `POINTS = { R16: 40, QF: 80, SF: 160, F: 320 }`. BANKED (awarded, cannot fall), PROJECTED (if today holds as it stands, using `leader(m)`: sets first, then games; **never a probability**), CEILING (the most the bracket can still score). Banked only rises, Ceiling only falls, Projected moves both ways. `forwardStatus()` returns `dead`, `standing` or `open`; an eliminated champion zeroes every forward node that named them in one pass. **PROJECTED is never stored.** Verify existing round weights against `POINTS` and record any mismatch |
| **M4.4** | **Forward exposure** | `0034_…` migration, `bracket_forward_exposure` | Reverse index `(match_id, bracket_id, forward_node_id, pts)`, materialised at lock, so `ceilingDeltaIfLost` is an indexed read instead of a full bracket walk per live match per viewer. pgTAP in the same commit. Backfill for any locked, in-progress tournament. *If M3 overruns, compute on the fly for the single-user case and defer the table; record it as debt* |
| **M4.5** | **`viewMyTennis` use case** | `apps/web/server/use-cases/viewMyTennis.ts` (**new**) | Assembles context for the candidate set (matches in tournaments the user has a bracket in), calls core, sorts with `myMatches`. 15-second per-user context cache. Live patches re-sort client-side using the same core function compiled into the bundle (one function, two runtimes) |
| **M4.6** | **`myMatches` ordering** | `packages/core` + web | Adopt the prototype exactly: (1) top reason `prio` ascending, (2) status rank (live > scheduled > final), (3) Heat breaks ties. **Heat is not built yet, so the third key is a stable fallback (e.g. start time).** One ranking function used by the list **and** the Stage. **Never re-shuffle under the reader's cursor**: sort on load; on a live patch update values in place; animate reordering only when a row crosses into the top three; no animation for reduced-motion users |
| **M4.7** | **`MatchRow`** | `apps/web/components/live/MatchRow.tsx` (**new**) | **Rows, not cards.** Each row: why it matters (from reason), both players, the score, one line of consequence. The full consequence layer stays one tap away on match detail. Score row must survive **320 px** (three sets plus current game plus serve dot) |
| **M4.8** | **`CeilingTriad`** | `apps/web/components/live/CeilingTriad.tsx` (**new**) | BANKED / PROJECTED / CEILING. **2×2 on mobile.** Uses `--mr-read` (charcoal) for the user's commitment, `--mr-data` (green) for verified fact, `--mr-miss` only for a wrong read. No new colour |
| **M4.9** | **Stage policy and the calm states** | `apps/web/components/live/stagePolicy.ts`, `Stage.tsx` (**new**) | State machine ported from the prototype's `stageState()` with the Handoff's priority order. Only `morning`, `live`, `next` (+ `reckoning` stretch) are implemented; `cascade` and `urgent` branches exist in the type but are not rendered. **`morning`**: four facts about the day, then **one number** (e.g. "55 min until Tiafoe v Michelsen") and nothing else; this depends on sessions from M2 and the viewer-time formatter from M1. **`live`**: the single most relevant live match, large: names at display size, score in tabular mono, points at stake. **`next`**: what just settled, then the countdown to the next thing of the user's. **`reckoning`**: the day's verdict, four numbers. *The reckoning headline is hand-written in the prototype and generating it from state is unsolved (Handoff §0): ship it with a conservative template or keep it behind a flag, because a template that gets the tone wrong on a bad day is worse than no sentence.* The Stage belongs to My Tennis only |
| **M4.10** | **Server-side first paint of the Stage** | My Tennis page | The Server Component renders settled truth and the Stage shell; the client island only patches the live layer. The island never renders an empty Stage |
| **M4.11** | **i18n** | `packages/i18n/src/messages/{en,es,ja}.ts` (VERIFY → MODIFY) | A sentence for every reason kind in all three locales. **The build gate fails on an incomplete catalogue, so budget for all three; do not ship English to a Japanese page** |
| **M4.12** | **Accessibility and motion** | Stage components | `prefers-reduced-motion` removes live motion; non-modal `role="status"` `aria-live="polite"`; never steal focus; never announce score updates; stop the live-dot animation when the tab is hidden. **Execute `docs/SCREEN-READER-PROTOCOL.md` against the Stage and the live bracket** (no screen reader has ever been run against this product) |
| **M4.13** | **Correctness suite** | `packages/core/src/live/*.test.ts` | **I1** BANKED never decreases; **I2** CEILING never increases under normal authoritative progression (a provider correction is a separate asserted exception); **I3** `banked ≤ projected ≤ ceiling` at every frame (a range property, not a monotonicity one); **I4** an eliminated forward selection contributes zero remaining Ceiling; **I5** determinism (same input, same output, no clock read). Run over the replayed prototype timeline and the M1 capture |
| **M4.14** | **Stage telemetry** | `apps/web/server/repositories/founder.ts` | Even without `urgent`, add the `stage_events` counter now so the takeover counter exists from day one when `urgent` ships later |
| **M4.15 (stretch)** | **Fan identity slot** | My Tennis page | Four numbers (2026 record, upset-accuracy percentile, current streak, Rating), **below** the live experience, backed by existing `user_ratings` / `rating_events` tables. Do not invent a second rating |
| **M4.16 (stretch)** | **Live state on Daily Picks (mobile)** | `MatchCard.tsx` | Subscribe to `live_match_state`; render score and status. `settle-slate` unchanged; the streak moves on settlement only |

#### Reason priority table (from the prototype, Handoff §6)

| `prio` | Condition | `kind` |
|---|---|---|
| **0** | A flag (`break-point` / `match-point`) **against** your pick | `flag` |
| **1** | Your champion is out here, or your champion is under pressure | `champion` |
| **2** | Champion on court · a forward pick eliminated or under pressure · this match decides first place | `champion` · `forward` · `swing` |
| **3** | Flag **for** your pick · your pick is losing while ≥60% of MatchRead agree with you · your last Daily Pick of the day | `flag` · `consensus` · `daily` |
| **4** | You are the only league member on this player | `alone` |
| **5** | You are contrarian (≤30% of MatchRead share your read) | `contrarian` |
| **6** | A non-urgent forward pick · another of today's Daily Picks · the winner plays your semi-finalist next | `forward` · `daily` · `future` |

Two properties carry the design. A threatened read outranks a champion cruising (a break point against any of your picks is `prio 0`; a champion comfortably winning is `prio 2`), so the screen reorders on jeopardy rather than stake. And the rows involving league-dependent reasons (`swing`, `alone`, `consensus`) need data from the League model; where that data is not yet available (projection is deferred), those reason kinds are emitted only when their inputs exist, and the others still work.

#### Stage state machine (presentation, not core)

```ts
// apps/web/components/live/stagePolicy.ts   PRESENTATION, not core.
export function stageState(v: ViewModel): StageState {
  if (v.cascadeOpen)                                   return 'cascade';   // not rendered in V3-M4
  if (v.top?.importance === 'critical')                return 'urgent';    // not rendered in V3-M4
  if (v.myMatches.some(m => m.status === 'live'))      return 'live';
  if (v.myMatches.every(m => m.status === 'scheduled')) return 'morning';
  if (v.myMatches.every(m => m.status === 'final'))     return 'reckoning';
  return 'next';
}
```

In M4, a `critical` consequence falls back to the `live` treatment (with the flag badge on the row). The mapping from importance to treatment is a client constant, so enabling `urgent` later is a presentation change with no core deploy.

### Suggested day plan

| Day | Focus |
|---|---|
| 1 | D5 and D6 checks; M4.1 `reasonsFor`, M4.2 `classify`; unit tests (I5) |
| 2 | M4.3 `ceilingMaths`, M4.13 invariants I1–I4; M4.4 forward exposure migration |
| 3 | M4.5 `viewMyTennis`, M4.6 ordering, M4.7 `MatchRow`, M4.8 `CeilingTriad` |
| 4 | M4.9 Stage and states, M4.10 server-first paint, M4.11 i18n ×3 |
| 5 | M4.12 accessibility protocol, M4.14 telemetry, replay run over a full day, stretch items if on schedule, final review against the Definition of Done |

### Tests

- **Unit:** `reasonsFor` returns `prio 0` for a flag against your pick and `prio 2` for a champion cruising; `classify` at every threshold boundary; `myMatches` ordering; determinism (**I5**) over shuffled input.
- **Property tests:** **I1–I4** over replayed frame sequences.
- **Integration:** forward-exposure table is correct at lock; `apply_bracket_state` latch behaviour covered by a test.
- **E2E (Playwright):** a member opening the product at 11 am sees the morning stage and a countdown; during play their own matches appear first, ordered by consequence, with a stated reason; the Stage renders server-side, not behind a `Loading…` shell; reduced-motion path.
- **CI:** grep that `packages/core` contains no reference to a Stage, takeover, colour or rendered sentence; i18n build gate green.

### Exit criteria

- [ ] A member opening My Tennis at 11 am sees the morning Stage and a countdown to the next thing that is theirs
- [ ] During play they see their own matches first, ordered by consequence, with a stated reason
- [ ] `reasonsFor` and `classify` are deterministic and pure
- [ ] Ceiling never rises and `BANKED ≤ PROJECTED ≤ CEILING` holds at every frame of a replay
- [ ] An eliminated champion zeroes every forward node naming them, in one pass
- [ ] Inversion token and colour system unchanged; **no new colour was added**
- [ ] en/es/ja catalogue complete for every reason kind; build gate green
- [ ] The screen-reader protocol has been executed against the Stage and the live bracket
- [ ] The Stage never appears on bracket entry
- [ ] `/founder` shows the live health tiles and the `stage_events` counter

### Risks

| Risk | Mitigation |
|---|---|
| **One week for what the Handoff budgets at three** | The cut line in the scope note above. Cut `reckoning`, then the stretch items, before cutting tests or i18n |
| **Ceiling monotonicity**: a rising Ceiling is a visible lie at the product's emotional peak | I1–I4 plus a replay assertion; resolve the `apply_bracket_state` latch first |
| **Thresholds are tuned for eight matches and two sessions** (Handoff §20) | Keep thresholds in server config; a Slam-scale replay is on the post-M4 list |
| **i18n gate** | Write the reason catalogue as reasons are added, not at the end of the week |
| **Exploratory items tempting to ship** | Heat, Rating formula and the reckoning headline stay out unless explicitly gated (see §7) |

---

## 6. Cross-milestone view

### 6.1 Migration plan

Confirm the head on day 1 (D2). Numbers below assume `0030` is the head and `0031` / `0032` land before V3 work; renumber if they do not.

| Migration | Milestone | Content |
|---|---|---|
| `0031_reconciliation` (proposed by prior P0 brief) | Before or during M1 | Reconciliation, per-tour identity, `match_status` widened (its own step) |
| `0032_draw_type` (proposed) | Before or during M1 | Draw type |
| `0033_live_state.sql` | M3 (session column may land in M2 as its own earlier migration) | `matches.session`, `provider_event_map`, `live_match_state` (with `flag`, `occurred_at`, `provisional_winner`), indexes, RLS, Realtime publication |
| `0034_forward_exposure.sql` | M4 | `bracket_forward_exposure` |
| Deferred | After M4 | `pulse_events`, `match_league_exposure`, `public_live_summary()` |

Deliberately **not created** (Handoff §19): `user_match_consequences`, a `live_events` log (`platform_events` is the log), a projected-standings table, a `heat_scores` table, a `stage_state` table.

### 6.2 File map by milestone

| Path | State | M1 | M2 | M3 | M4 |
|---|---|---|---|---|---|
| `apps/listener/src/capture.ts` | new | ● | | | |
| `apps/listener/` (Dockerfile, `railway.json`, `session.ts`) | new | | | ● | |
| `packages/provider-rapidapi/src/{client,parse}.ts` | VERIFY | | | ● | |
| `packages/settlement/src/reconcile.ts` | VERIFY | ● | | | |
| `packages/settlement/src/repo.ts` | VERIFY | | | ● | |
| `supabase/functions/ingest-events/index.ts` | VERIFY | | | ● | |
| `supabase/migrations/0033_live_state.sql` + test `33_live_state.test.sql` | new | | ◐ | ● | |
| `supabase/migrations/0034_…` + pgTAP | new | | | | ● |
| `packages/core/src/live/state.ts`, `normalize.ts` | new | | | ● | |
| `packages/core/src/live/consequence.ts`, `importance.ts`, `ceiling.ts` | new | | | | ● |
| `packages/core/src/tournament/scoring.ts` | VERIFY (reconcile with `POINTS`) | | | | ● |
| `packages/core/src/league/pulse.ts` | VERIFY | **DO NOT TOUCH** | | | |
| `apps/web/components/bracket/*` | VERIFY → REBUILD | ◐ | ● | ◐ | |
| `apps/web/app/matches/[ref]/*` | new | | ● | | |
| `apps/web/components/live/{useLiveTournament,LiveScore}.ts(x)` | new | | | ● | |
| `apps/web/components/live/{MatchRow,CeilingTriad,Stage,stagePolicy}.ts(x)` | new | | | | ● |
| `apps/web/server/repositories/live.ts` | new | | | ● | |
| `apps/web/server/repositories/founder.ts` | VERIFY | | | ● | ● |
| `apps/web/server/use-cases/viewMyTennis.ts` | new | | | | ● |
| `packages/i18n/src/messages/{en,es,ja}.ts` | VERIFY | | | | ● |
| `packages/tokens/src/index.ts` | VERIFY (`--mr-inverse` already exists; no new colour) | | | | ✓ |

● primary work · ◐ partial or supporting · ✓ verify only

### 6.3 Invariants and where each is first enforced

| # | Invariant | Milestone |
|---|---|---|
| I1 | BANKED never decreases | M4 |
| I2 | CEILING never increases under normal authoritative progression | M4 |
| I3 | `banked ≤ projected ≤ ceiling` | M4 |
| I4 | An eliminated forward selection contributes zero remaining Ceiling | M4 |
| I5 | Determinism: same state plus same context gives the same output | M3 (normalizer), M4 (consequence) |
| I6 | Replaying duplicate frames cannot change official scoring | M3 |
| I7 | A stale or out-of-order frame cannot roll the UI backward | M3 |

### 6.4 Observability by milestone

| Signal | Source | Threshold | Milestone |
|---|---|---|---|
| Cron jobs running | `cron.job_run_details` | existing | M1 |
| Client exceptions | Sentry | any | M1 |
| Unexplained absence from a draw | entry-list comparison | S1 at ≥ 1 | M1 |
| Socket connected | `listener_health` heartbeat every 30 s | S1 if > 2 min old during play | M3 |
| Last provider event | `max(live_match_state.received_at)` | S2 at 5 min during play | M3 |
| Events mapped | listener log | S2 if `mapped=0` while `events_in>0` | M3 |
| Unmapped inside a carried tournament | `platform_events` `kind='live_unmapped'` | S2 at ≥ 1 | M3 |
| REST/socket disagreement | `reconciliation_runs.conflicts` | S1 at ≥ 1 | M3 |
| Live freshness | `provider_freshness` (exists, renders nowhere today) | S2 at 30 min | M3 |
| Stage events per user per hour | `stage_events` | S2 above 2 | M4 (counter only) |

### 6.5 Master risk register

| Risk | Milestone hit | Mitigation |
|---|---|---|
| MEGA plan not approved | M3 | Replay-only fallback; no listener deploy |
| Provider feed shape or field names differ from the prototype | M3 | Normalizer written from captured bytes; shape-agnostic change detection; vanish path gated off |
| `fixture.id !== socket eventId` | M3 | Mapping step; unmapped events are a no-op |
| `flag` not derivable from payload | M3, M4 | Emit `null`; defer `critical` importance |
| `apply_bracket_state` latches | M4 | Add the settled-differs-conflict branch before Ceiling UI |
| Tree rebuild larger than estimated | M2 | Protect days 1–3; defer connector polish |
| Settlement contamination from live | M3 | Test first, type guard, CI grep |
| Scale beyond eight matches | After M4 | Slam-scale replay before January (§7) |
| M4 scope too large | M4 | Cut line in the M4 scope note |

---

## 7. Deferred beyond Milestone 4

Everything below is real V3 work, in the Handoff's order. None of it is on the four-week path.

### 7.1 Competitive live (Handoff Phase 3, ~2 weeks)

`projectStandings(settled, live, picks, weights, overrides)` with override map (never persisted; always labelled "projected"; debounced to 5 s per league), projected standings visibly distinct from settled, `match_league_exposure` and League Swing (`swingsLeagues`, `swingMatch`, filtered to set completions and status or flag changes, only leagues with divided picks, top of table only), **both-futures columns** on match detail (two pure calls to `projectStandings`), and Daily Picks as a web surface inside My Tennis. *League positions swinging* is flagged exploratory (extrapolated from one six-person league); do not show it publicly without a real count.

### 7.2 Intelligence and the dramatic states (Handoff Phase 4, ~3 weeks)

- **Pulse:** `pulse_events` with bands 1–5 (relevance, not recency), semantic dedupe key `(scope, scope_id, match_id, kind, epoch)` as a unique index, rate limit of one band-1 event per user per 90 seconds and a hard cap of 20 per user per day. Not a notification channel.
- **`urgent` stage:** inversion using `--mr-inverse`, two intensities (level 2 only for a threatened champion, half the viewport), arbitration (higher level wins, then lower `prio`, then earlier `occurredAt`; incumbency wins ties), cooldown (5 minutes per user after dismissal, 10 minutes per `(user, match, reason)`), a daily cap on level-2 takeovers, never on the bracket entry route, one 2.8-second rule sweep as the only motion. The trigger is exploratory; tune against a real draw.
- **`cascade`:** four beats (what happened · why you care · what changed · what's next), a required non-empty fourth beat, and a required dismissal. **Fires on settlement, never on the socket.**
- **Heat:** internal-only (`heatOf`). Weights are guesses tuned on eight matches. Not on any shareable page until it survives a full 128 draw. First thing to cut if Phase 4 runs long.
- **Visitor surface:** `public_live_summary()` with k≥10 suppression, percentages not counts, no league named, no Heat score; CDN-cached at `s-maxage=30`; no Realtime for anonymous visitors.

### 7.3 Tuning and optimisation (Handoff Phase 5)

Heat retuned and made public only after a full 128 draw; takeover threshold and treatment map tuned against real usage; MatchRead Rating as a proper design problem; notification groundwork (quiet hours, per-league opt-in, hard cap); caching and analytics; the §20 scale work (Redis, read replica, moving `settle-tournament` into the Railway container only at 25,000+ concurrent users or ~100,000 brackets).

### 7.4 Phase 0B cleanup (parallel, unscheduled, not blocking)

| # | Work | Finding |
|---|---|---|
| 0B.1 | Delete the literal `{` from the wordmark | L7 |
| 0B.2 | Per-tournament `og:image` | L9 |
| 0B.3 | Reconcile `www` and apex; make `canonical` agree with the served host | P4 |
| 0B.4 | Reconcile tournament start dates across calendar card, header and rows (one source) | L6 |
| 0B.5 | Ship the `draw_types_seen=` structured log line on discovery | L10 |

### 7.5 Before the Australian Open

- Replay a **64-match day** through the pipeline and tune thresholds against it. Every threshold in V3 is tuned for eight matches and two sessions.
- Capture the **Slam-only unknowns** noted in §0.2 (volume, retirement, walkover, suspension behaviour).
- Decide whether simultaneous multi-tournament live is in scope (the Handoff puts it on the "should wait" list).

---

## 8. Definition of done (V3 slice, mapped from Handoff §27)

Items marked *(deferred)* belong to the post-M4 work in §7.

**Trust boundary**

- [ ] A terminal socket event never sets `winner_side`, never advances a seat, never moves a score, never fires a cascade (`does not settle from a socket event`)
- [ ] `settleAll()` remains the only writer of advancement
- [ ] A CI grep proves the live branch cannot reach `apply_grades`, `apply_bracket_state` or `settleAll`
- [ ] REST reconciliation records every socket disagreement; a differing settled winner is never overwritten
- [ ] A player absent from the draw is classified as withdrawal or gap, never assumed

**Correctness**

- [ ] Ceiling never rises, asserted over a replayed tournament
- [ ] `BANKED ≤ PROJECTED ≤ CEILING` at every frame
- [ ] An eliminated champion zeroes every forward node naming them in one pass
- [ ] I1–I5 pass as property tests (I6–I7 in M3); I1–I7 all green by the end of M4
- [ ] `reasonsFor` and `classify` are deterministic, no clock reads
- [ ] `flag` is derived, never parsed downstream; underivable is `null`
- [ ] `apply_bracket_state` latch behaviour documented, and the settled-differs branch exists if it latches
- [ ] Projected standings never write a settled number *(deferred)*

**Live behaviour**

- [ ] Live score updates without a refresh
- [ ] Live state survives a listener restart and a client reconnect
- [ ] A client returning from background recovers by refetch, never by replay
- [ ] A stale live layer is labelled; a frozen score is never presented as live
- [ ] The bracket does not advance on a provisional final, and the interim state is legible

**The Stage (calm states)**

- [ ] `morning`, `live`, `next` render (and `reckoning` if shipped); `urgent` and `cascade` are not shown *(deferred)*
- [ ] Inversion uses `--mr-inverse`; no new colour was added
- [ ] `ImportanceConfig` thresholds are server-side and hot-reloadable; the importance→treatment map is a client constant
- [ ] `packages/core` contains no reference to a Stage, a takeover, a colour or a rendered sentence (CI grep)
- [ ] Cannot appear on bracket entry; never steals focus
- [ ] The `stage_events` counter is on `/founder`

**Product**

- [ ] Daily Picks resolve only through `settle-slate` (unchanged)
- [ ] Heat is internal-only or absent; no Heat score on any shareable page
- [ ] Fan identity, if shipped, sits below the live experience and uses the existing rating tables
- [ ] Pulse, visitor aggregates, League Swing *(deferred)*

**Platform**

- [ ] The bracket is a tree; sessions and courts render
- [ ] The page paints server-side; no `Loading…` shell on a live page
- [ ] Score row survives 320 px; Ceiling triad is 2×2 on mobile
- [ ] The live dot stops when the tab is hidden
- [ ] `prefers-reduced-motion` removes all live motion
- [ ] The screen-reader protocol has been executed against the Stage and the live bracket
- [ ] en/es/ja complete for every reason kind; build gate green
- [ ] Sentry reports client exceptions; `/founder` answers the §22 questions in the M3 and M4 observability tables above

---

## 9. First-day checklist (Day 1 of M1)

1. Confirm the migration head in `supabase/migrations`; confirm whether `0031` and `0032` landed.
2. Confirm `npm:@matchread/core@^0.1.0` resolves on the registry. If it 404s, every Edge Function 500s on first invocation. That is P0 zero.
3. Write `capture.ts` and point it at whatever live feed is available. Run it in the background all week.
4. Ask the founder for the MEGA plan / `/ws-token` licensing decision. It gates M3.
5. Open `matchread-live.html`, press nothing, and let all sixteen steps run in order. The arc only works in order, and it is the specification.
6. Extract its `TIMELINE` to JSON as the replay harness's first fixture.
7. Load a tournament page and read a pair of quarter-finals: one played, one not, indistinguishable. This is the product problem in one screenshot.
8. `select * from cron.job_run_details order by start_time desc limit 20`. Settlement and reconciliation are either running or they are not.
9. Read `0012`'s `apply_bracket_state` and determine whether it latches like `apply_grades` (`0004` L494).
10. Write the failing test `does not settle from a socket event` before writing the listener (this lands in M3, but write down the contract now).

---

> **THE API TELLS MATCHREAD WHAT HAPPENED. MATCHREAD DETERMINES WHY IT MATTERS.**
>
> One provider state → one MatchRead normalization → one consequence engine → many user experiences.

*Tournament names are used descriptively. This document is not affiliated with, endorsed by or connected to the ATP, the WTA, the USTA or the US Open.*
