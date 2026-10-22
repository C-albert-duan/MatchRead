# MatchRead × Matchstat Integration Manual
## slam event Launch Edition

**Document class:** Engineering implementation manual
**Audience:** Launch engineer (primary), backend on-call (secondary)
**Status:** Draft 1 — pending repository verification
**Target event:** slam event, main draw begins **31 Aug 2026** (T‑14 days from 17 Aug 2026)
**Authoritative inputs:** Matchstat API Response Summary (attached PDF); live production observation of `matchreadtennis.com`

---

## 0. Read this before anything else — the source gap

This manual was commissioned as a three-source document: the **repository**, the **Matchstat PDF**, and the **existing engineering documentation**.

**Only the PDF was provided.** No repository, no schema dump, no service inventory, no existing architecture docs were attached to this task. Nothing named `matchread` exists on this machine outside the uploaded PDF.

I did not want to hand you a manual full of invented file paths, so the audit was restructured:

| Phase as specified | What was actually possible | Confidence |
|---|---|---|
| Phase 1 — repository audit | **Black-box audit of production.** Every claim below about current MatchRead behaviour is derived from observed HTTP responses, cited by URL and timestamp. | High on *behaviour*, none on *code* |
| Phase 1 — file-level mapping | **Inferred.** Every file path in this document is a **hypothesis**, marked `⟨inferred⟩`, and paired with a `grep` command so you can confirm or correct it in under a minute. | Low — verify before acting |
| Phase 2 — comparison matrix | **Complete.** Observed behaviour vs. confirmed API behaviour. | High |
| Phase 3 — engineering manual | **Complete.** Design work does not depend on seeing the code. | High |

Everything in §1 that is inferred rather than observed is marked. **Do not treat an `⟨inferred⟩` path as real.** Run the verification command, correct the path, and the surrounding design still holds — the designs are keyed to subsystems, not to filenames.

If you attach the repo, §1, §9 and §13 should be regenerated against it. The rest will survive largely unchanged.

---

## 1. Executive Summary

### 1.1 What we learned

The Matchstat responses resolve one architectural question that everything else hangs off:

> **A bracket is a first-class object served by `/draws`. It is not derivable from fixtures.**

MatchRead currently behaves as though the opposite were true. Production evidence (§2) shows a system that assembles brackets from scheduled-match data and degrades as a tournament progresses — the precise failure mode the Matchstat team's answers predict.

Six confirmed behaviours drive this manual:

1. `/draws` is canonical for brackets; the numeric `draw` field carries slot order.
2. `/seeds` is canonical for the official seed list; `seed1`/`seed2` carry seed numbers **or** entry tags (`Q`, `WC`, `PR`, `LL`).
3. Byes are `null` opponents. Replacements are **silent player-ID mutations** — no event, no flag, no webhook.
4. Fixtures are for *scheduled and remaining* matches. Not for bracket reconstruction.
5. Core fixture IDs ≠ Socket.IO event IDs. The mapping is our problem to build.
6. There is **no replay** after socket disconnect, **no live coverage guarantee** below tour level, and **no SLA** on draw publication or replacement timing.

Items 3, 5 and 6 are the expensive ones. Each is a "we do not provide X" — and each therefore requires MatchRead to build a compensating mechanism: change-detection by diffing, an identity resolution service, and REST reconciliation.

### 1.2 Current readiness

**Not ready.** Three of the four subsystems that a bracket product cannot launch without are either wrong or unverifiable:

| Capability | State | Evidence |
|---|---|---|
| Publish a complete, correctly ordered bracket | **Broken** | §2.1, §2.2 |
| Advance winners through the bracket | **Broken** | §2.3 |
| Settle picks and move standings | **Broken / not observable** | §2.3 |
| Live score delivery | **Unverified** | §2.6 |
| Tournament & fixture ingestion | **Working** | §2.5 |
| Lifecycle state machine (pending → on court → complete) | **Working** | §2.4 |

The ingestion and lifecycle layers are genuinely good and should not be touched. The failure is concentrated in one place: **bracket construction and bracket progression**.

### 1.3 Overall confidence

**Confidence that the correct fix is identified: high.** The production symptoms match the Matchstat guidance so exactly that the diagnosis is close to overdetermined — a system reconstructing brackets from fixtures will show precisely the "full bracket is not published yet" behaviour observed on in-play tournaments, because fixtures shed completed matches.

**Confidence that it ships by 31 Aug: moderate, and conditional.** The work is bounded — one new ingest path, one new table set, one mapping service, one worker, one reconciler. Three of those five are net-new code rather than surgery on working code, which is the favourable case. The risk is not the draw work; it is the **settlement engine**, which is unobservable from outside and may need more repair than this document can scope.

### 1.4 Remaining risks

**R1 — Settlement is a black box (highest risk).** A completed tournament renders every round after R1 as "Not played" (§2.3). Either results never propagate, or progression never propagates, or both. Until someone reads that code we do not know whether this is a two-hour fix or a rewrite. **This is the first thing the launch engineer should open.**

**R2 — Pick identity under replacement.** If picks are stored as `player_id`, every lucky loser and every withdrawal silently corrupts user brackets, and Matchstat gives us no event to react to. If picks are stored as `slot_id`, this is a non-issue. This single schema question is worth more than any other five minutes in the codebase (§19, G7).

**R3 — Draw publication has no SLA.** The slam event draw ceremony is typically ~48h before play, but we have no contractual guarantee, and "entry locks" times are already published on our calendar. A late draw plus a slow poll interval equals a launch-day incident (§11).

**R4 — Event mapping has never run at Grand Slam scale.** 128 singles matches per draw × 2 draws, resolving on the same afternoon, against an ID-mapping service that does not exist yet.

**R5 — Fourteen days.** No slack. The roadmap in §15 is sequenced so P0 is independently shippable.

### 1.5 The one-sentence version

> Stop deriving brackets from fixtures; make `/draws` + `/seeds` the canonical bracket source persisted in a slot-indexed schema; build the three compensating services Matchstat explicitly told us they will not provide (event mapping, draw-diff replacement detection, REST reconciliation); and leave tournament ingestion and the lifecycle state machine alone.

---

## 2. Evidence base — production black-box audit

All observations taken 17 Aug 2026. Reproduce by fetching the same URLs.

### 2.1 In-play tournaments do not have a bracket

`GET /tournaments/t-atp-21347` — **Masters event**, an ATP Masters 1000, status *On court*:

> "This tournament is in play. The full bracket is not published yet. First-round matches already named below are open to pick."

The Masters event draw was published before the tournament started. It is not "not published yet" — **we no longer have it.** Identical string on `t-atp-21966` (M15 Targu Jiu) and every other in-play tournament sampled.

**Reading:** this is the signature of fixture-derived brackets. Fixtures cover *scheduled and remaining* matches (PDF §4). As rounds complete, those matches leave the fixture window, the reconstruction loses R1, and the bracket collapses. The bug is not that the draw is missing upstream — it is that we never persisted it and cannot rebuild it from a shrinking feed.

**Product consequence:** the flagship user action — fill a bracket — is unavailable on exactly the tournaments users care about most, from the moment play begins.

### 2.2 The one bracket that does render is mis-ordered

`GET /tournaments/t-wta-17199` — W35 small-field event, *Complete*. The Round of 64 renders 64 names, so bracket display works. But the slot layout is wrong:

- `1 Pedone ITA` appears in **multiple non-adjacent slots** across the round.
- Names repeat across the column (`Silva BRA`, `Brayotta ARG`, `Bosio ARG`, `Sanchez MEX` each appear more than once).
- Seeds appear in textbook synthetic positions (1, then 2 at the far end, then 3/4, then 5–8), which is what a **locally generated** seeded bracket looks like — not what an official draw looks like.

**Reading:** slot order is being *computed* from seeding convention plus arbitrary fill, rather than *read* from the Matchstat `draw` field. A generated bracket will be right at the seed lines and wrong everywhere else, which is exactly the observed pattern. Confirms the PDF's core instruction: `draw` determines bracket slot order (PDF §2).

### 2.3 Winners do not advance, on a finished tournament

Same page. The tournament is `Complete`. Yet:

- R64 shows exactly **one** settled result: `Won: Pedone`, dated `04 AUG`.
- **Round of 32, Round of 16, QF, SF, Final: every node reads "Not played."**

A completed 64-draw event has 63 results. We are displaying one.

**Reading:** the progression/settlement path is broken or never fires. Two candidate causes, both plausible, not distinguishable from outside:
- (a) results ingestion only captures matches seen live and never backfills from REST; or
- (b) results are captured but the advance-winner-into-parent-node step does not run because there is no persistent bracket tree to advance *into* (which follows directly from §2.1).

If (b), fixing the draw layer fixes settlement as a side effect. **Determine which before estimating.** This is R1.

### 2.4 What is working — lifecycle

The tournament state machine is sound and should be preserved:

`Draw pending` → `On court` → `Complete`, with `entry locks <local time>` surfaced per tournament, a 14-day countdown on unopened events (`t-atp-21349`, slam event ATP), and correct gating copy ("Picking opens when the official draw is published").

The *states are right*; only the **transition trigger** for `Draw pending → open for picks` needs rewiring, from "we have some fixtures" to "the draw is published and complete" (§15).

### 2.5 What is working — tournament ingestion

~200 tournaments across ATP/WTA/Challenger/ITF, correct dates, correct calendar bucketing (On court / Open now / Upcoming), stable IDs (`t-atp-21349`, `t-wta-16743`), and both slam event draws plus juniors already in the calendar 14 days out. Multi-locale (`en`, `es`, `ja`). **Do not redesign this.**

### 2.6 Secondary defects observed

| # | Observation | Reading | Severity |
|---|---|---|---|
| D1 | **Every** tournament shows surface `Hard` — including clay-week events. | Surface field defaulted, not ingested from Core metadata. | Low for slam event (hard court); erodes trust site-wide. |
| D2 | Homepage claims "17 draws are open right now" while listing ~44 in-play events. | Counter and bucket use different predicates. | Low |
| D3 | No live score visible on any in-play tournament page. | Socket layer unverified from outside — could be logged-out gating. **Verify from inside.** | Unknown — treat as P0 verification |
| D4 | `t-wta-17199` shows *Complete* alongside "Fill a bracket". | Entry gate not closed on terminal state. | Low, but embarrassing |

---

## 3. Phase 1 — Repository audit

Structured per the brief. Each subsystem: **Observed** (evidence-backed) → **Inferred implementation** (hypothesis) → **Verify** (command) → **Verdict**.

> **Convention:** `⟨inferred⟩` marks a guess. Confirm before quoting to anyone.

### 3.1 Tournament ingestion — **Correct, preserve**

- **Observed:** full ATP/WTA/CH/ITF calendar, correct dates, correct tour prefixes, forward calendar populated ~4 weeks.
- **Inferred:** a scheduled sync against Core `/tournaments`, upserting on `matchstat_tournament_id`, with slug `t-{tour}-{id}` ⟨inferred: `services/tournamentSync` , `workers/tournamentSyncWorker`⟩.
- **Verify:** `grep -rn "tournaments" --include=*.{ts,js} src/ | grep -i "sync\|ingest"`
- **Verdict:** **Already Correct.** Extend only to persist `surface`, `draw_size`, `tour_level` (D1).

### 3.2 Draw generation — **Delete**

- **Observed:** §2.2. Synthetic seed placement, duplicated names, no relation to an official draw.
- **Inferred:** a bracket builder that takes an entrant list plus seeds and emits a standard seeded bracket ⟨inferred: `services/drawGenerator`, `lib/bracket.ts`, `utils/generateDraw`⟩.
- **Verify:** `grep -rn "generateDraw\|buildBracket\|seedPosition\|byePosition" src/`
- **Verdict:** **Major Changes — remove from the production path.** Matchstat publishes the real draw; generating our own is not an approximation of it, it is a different bracket. Keep the module only behind a `DEV_SYNTHETIC_DRAW` flag for fixtures in tests.

### 3.3 Fixture ingestion — **Correct, but over-scoped**

- **Observed:** first-round matches appear on in-play tournaments; names and results exist.
- **Inferred:** Core `/fixtures` polling by tournament, upsert by fixture ID ⟨inferred: `services/fixtureSync`, `workers/fixturePoller`⟩.
- **Verify:** `grep -rn "fixtures" src/ | grep -v test | head -40`
- **Verdict:** **Minor Changes.** The ingestion is fine. Its **role** must shrink (§7): schedule, court, start time, status, result — never structure.

### 3.4 Player models — **Unknown, high risk**

- **Observed:** players render as `Surname` + 3-letter country. No player pages exposed.
- **Inferred:** a `players` table keyed by Matchstat player ID, or — worse case — players denormalised as strings onto fixtures ⟨inferred: `models/Player`, `db/schema/players`⟩.
- **Verify:** `grep -rn "player_id\|playerId" src/db/ src/models/ | head -40`
- **Verdict:** **Unknown → assume Moderate Changes.** Replacement detection (§8) and event mapping (§9) are both keyed on stable player IDs. If players are strings, both are impossible. **Check this in the first hour.**

### 3.5 Seed handling — **Numeric only, tags missing**

- **Observed:** numeric seeds render (`1`, `2`, `3`, `5`, `7`, `8`). No `Q`, `WC`, `PR`, or `LL` appears anywhere in the sampled bracket — including in a 64-draw ITF event, which certainly had qualifiers.
- **Inferred:** seed stored as `integer | null`, tags dropped on parse ⟨inferred: `models/Fixture.seed1`⟩.
- **Verify:** `grep -rn "seed1\|seed2\|parseSeed" src/`
- **Verdict:** **Moderate Changes.** `seed1`/`seed2` is a **union type** (PDF §2). Requires the parse split in §6.3 and a `/seeds` ingest.

### 3.6 Live score architecture — **Unverified**

- **Observed:** nothing. No live score on any public in-play page (D3).
- **Inferred:** either not built, built but logged-out-gated, or built against fixture polling only.
- **Verify:** `grep -rn "socket.io-client\|ws-token\|join-event" src/`
- **Verdict:** **Unknown.** If the grep is empty → **Missing**, and it is the second P0 after settlement.

### 3.7 Socket.IO integration — **Unverified; mapping definitely missing**

- **Inferred:** if a client exists, it almost certainly subscribes using **fixture IDs**, because nothing in the product suggests we knew event IDs differ.
- **Verify:** `grep -rn "join-live-events-all\|eventId\|event_id" src/`
- **Verdict:** **Missing** (the mapping layer, at minimum). PDF §5 is explicit: core fixture IDs ≠ socket event IDs. Subscribing with a fixture ID yields a silent no-op — a socket that connects, authenticates, joins, and never delivers. **This exact failure is invisible in logs unless you assert on message receipt.**

### 3.8 Settlement engine — **Broken (R1)**

- **Observed:** §2.3 — one result on a finished 64-draw event; all later rounds "Not played".
- **Inferred:** settlement keyed to fixtures, with no bracket tree to propagate into ⟨inferred: `services/settlement`, `workers/settlementWorker`, `jobs/settleMatch`⟩.
- **Verify:** `grep -rn "settle\|scoreBracket\|advanceWinner" src/`
- **Verdict:** **Major Changes.** See §14 and R1.

### 3.9 Polling workers / background jobs — **Present, needs new members**

- **Observed:** calendar and fixture freshness imply working scheduled jobs.
- **Inferred:** BullMQ/Redis or cron ⟨inferred: `workers/`, `queues/`⟩.
- **Verify:** `ls src/workers src/jobs 2>/dev/null; grep -rn "bullmq\|node-cron\|agenda" package.json`
- **Verdict:** **Already Correct** as infrastructure. Add three workers (§16.2).

### 3.10 Database schema — **Missing the bracket**

- **Inferred current shape:** `tournaments`, `fixtures`, `users`, `leagues`, `entries`/`picks`, `standings`. Almost certainly **no** slot-indexed bracket table — a system that had one would not lose brackets mid-tournament.
- **Verify:** `ls src/db/migrations | tail -30; grep -rn "draw_slot\|bracket" src/db/`
- **Verdict:** **Missing.** §16.3 defines the additions.

### 3.11 Tournament lifecycle — **Correct, retrigger**

- **Observed:** §2.4. Clean states, correct copy, entry-lock timestamps.
- **Verdict:** **Minor Changes.** Change what opens the gate, not the gate (§12).

### 3.12 API wrappers — **Partial**

- **Inferred:** a Core client exists ⟨inferred: `lib/matchstat/client`⟩. Draw and Extend clients likely absent.
- **Verify:** `grep -rn "matchstat\|api.matchstat" src/ | head -30`
- **Verdict:** **Moderate Changes.** Three surfaces, one client, shared retry/rate-limit/telemetry (§16.1).

### 3.13 Testing coverage — **Assume thin**

- **Reasoning:** the §2.3 defect (a finished tournament showing 62 unplayed matches) is the kind of thing one end-to-end test catches. Its survival to production implies no such test.
- **Verify:** `ls test/ __tests__/ 2>/dev/null; grep -c "describe(" -r src/ | sort -t: -k2 -rn | head`
- **Verdict:** **Missing** for the bracket path. §17 defines the minimum bar.

---

## 4. Architecture overview

### 4.1 Current architecture (inferred from behaviour)

```
                    ┌──────────────────────┐
                    │   Matchstat Core API  │
                    │  /tournaments  /fixtures
                    └───────────┬──────────┘
                                │  (only surface consumed)
                    ┌───────────▼──────────┐
                    │   Tournament Sync     │  ✅ working
                    │   Fixture Poller      │  ✅ working
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │      Postgres         │
                    │  tournaments, fixtures│   ✗ no bracket table
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │   Draw Generator      │   ✗ synthesises a bracket
                    │  (seed convention)    │     at read time
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │  Web app / Bracket UI │
                    └──────────────────────┘

   Draw API   ── not consumed
   /seeds     ── not consumed
   Extend API ── not consumed
   Socket.IO  ── not consumed / unverified
```

The defect is structural, not incidental: **the bracket is a derived view, recomputed from a feed that shrinks over time.** Everything in §2 follows from that one decision.

### 4.2 Target architecture

```
   ┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
   │  Core API   │   │  Draw API   │   │  Extend API  │   │  Socket.IO   │
   │ tournaments │   │   /draws    │   │  /ws-token   │   │  join-event  │
   │  fixtures   │   │   /seeds    │   │  /event/get  │   │  score push  │
   │  players    │   │             │   │              │   │              │
   └──────┬──────┘   └──────┬──────┘   └──────┬───────┘   └──────┬───────┘
          │                 │                 │                  │
          │  metadata       │  STRUCTURE      │  identity         │  volatile
          │  + results      │  (authoritative)│  + auth           │  display
          ▼                 ▼                 ▼                  ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                     Matchstat Client Layer                            │
   │   retry · backoff · token bucket · circuit breaker · telemetry        │
   └──────────┬──────────────────┬──────────────────┬───────────────┬─────┘
              │                  │                  │               │
   ┌──────────▼──────┐ ┌─────────▼────────┐ ┌───────▼────────┐ ┌───▼─────────┐
   │ Tournament Sync │ │ Draw Import      │ │ Event Mapping  │ │ Live Session│
   │   (unchanged)   │ │   Service        │ │   Service      │ │  Manager    │
   │ Fixture Poller  │ │ Draw Refresh Wkr │ │  (cache + TTL) │ │ + Reconciler│
   │   (rescoped)    │ │  diff → replace  │ │                │ │             │
   └──────────┬──────┘ └─────────┬────────┘ └───────┬────────┘ └───┬─────────┘
              │                  │                  │              │
              └──────────────────┴────────┬─────────┴──────────────┘
                                          ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                             Postgres                                  │
   │  tournaments · players · draw_slots · bracket_nodes · draw_revisions  │
   │  event_map · fixtures · picks(slot-keyed) · leagues · standings       │
   └──────────────────────────┬───────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   ┌────────────────────┐          ┌────────────────────────┐
   │ Settlement Engine  │          │  Web app / Bracket UI  │
   │  REST-authoritative│          │  SSE/WS live overlay   │
   │  idempotent        │          │  bracket = READ of DB  │
   └────────────────────┘          └────────────────────────┘
```

### 4.3 The three invariants this architecture enforces

**I1 — The bracket is persisted, never derived.** Once imported, a bracket survives fixture churn, upstream outages, and full cache loss. §2.1 becomes impossible by construction.

**I2 — Structure and volatility are separated.** `/draws` supplies structure (slow, authoritative, diffable). Socket.IO supplies volatility (fast, lossy, disposable). A socket message may never mutate bracket structure or settle a pick.

**I3 — Every write path is idempotent and content-addressed.** Draw imports are keyed by revision hash; settlement by `(node_id, result_hash)`. Replaying a day of events changes nothing. This is what makes reconnect-reconciliation (§10) safe to run aggressively.

---

## 5. Canonical sources of truth

Each row: where the data comes from, why that source and not another, and what happens when it disagrees with a second source.

| Datum | Canonical source | Why authoritative | On conflict |
|---|---|---|---|
| **Brackets** | Draw API `/draws` | Only endpoint that emits bracket *shape*. Fixtures explicitly are not a bracket (PDF §1). | Draw wins, always. |
| **Draw ordering** | `draw` field on `/draws` | The provider states this numeric field determines slot order (PDF §2). Any locally computed order is a different bracket. | Draw wins. Never re-sort. |
| **Seeds (official list)** | `/seeds` | Purpose-built official list (PDF §2). | `/seeds` wins for the seed *list*; `seed1/seed2` wins for *slot attribution*. |
| **Entry tags (Q/WC/PR/LL)** | `seed1`/`seed2` on `/draws` | Tags are slot-scoped, not tournament-scoped — the tag describes a player's route into *that slot*. | Draw wins. |
| **Byes** | `null` opponent on `/draws` | Byes exist only in bracket space; no fixture is generated for them. | Draw only. Fixtures cannot express a bye. |
| **Player IDs** | Core API player objects, echoed in `/draws` | Stable integer identity; the join key for mapping and diffing. | Draw's ID for slot occupancy; Core for the player record. |
| **Match status & schedule** | Core `/fixtures` | Fixtures are the scheduled/remaining view (PDF §4). | Fixtures win for time/court/status. |
| **Results (settlement)** | Core `/fixtures` (REST) | REST is durable and re-readable; sockets are lossy with no replay (PDF §7). | **REST always wins.** Socket results are display-only until REST confirms. |
| **Live scores (in-progress)** | Socket.IO via Extend | Only low-latency surface. Explicitly not guaranteed for all events (PDF §8). | Never persisted as truth. Discarded on reconnect, rebuilt from REST. |
| **Replacements** | Diff of consecutive `/draws` snapshots | Provider changes player IDs in place and emits **no event** (PDF §3). Detection is our responsibility. | Newest draw revision wins; prior revision retained for audit. |
| **Socket event IDs** | Event Mapping Service (`event/get` + heuristics) | Core fixture IDs are different from socket event IDs (PDF §5). | Mapping table wins; re-resolve on miss. |

**The rule to remember:** *structure from Draw, schedule and results from Core, pixels from Socket.* If you are ever unsure where a value should come from, ask which of those three categories it falls into.

---

## 6. Phase 2 — Comparison matrix

| Area | Current implementation (observed/inferred) | Confirmed Matchstat behaviour | Status | Required action |
|---|---|---|---|---|
| **Tournament Draw** | No persisted bracket; synthesised at read time; lost once play begins (§2.1) | `/draws` is canonical bracket source (PDF §1) | **Major Changes** | Build Draw Import Service; persist `draw_slots` + `bracket_nodes`; delete generator from prod path |
| **Fixtures** | Used both for schedule *and* to reconstruct structure | Fixtures = scheduled + remaining matches only (PDF §4) | **Moderate Changes** | Rescope to schedule/status/result; forbid structural inference |
| **Seeds** | Numeric seeds only; entry tags dropped (§3.5) | `seed1`/`seed2` = seed number **or** `Q`/`WC`/`PR`/`LL`; `/seeds` = official list (PDF §2) | **Moderate Changes** | Union-type parser; ingest `/seeds`; render tags |
| **Draw Ordering** | Computed from seeding convention (§2.2) | Numeric `draw` field determines slot order (PDF §2) | **Major Changes** | Order strictly by `draw`; remove all local ordering logic |
| **Byes** | Not represented | Byes appear as `null` opponents (PDF §3) | **Missing** | Model as first-class slot state; auto-advance at import; exclude from picks |
| **Qualifiers / WC / PR / LL** | Not represented | Represented by entry tags (PDF §3) | **Missing** | Persist `entry_tag`; render; handle placeholder→named transition |
| **Live Events** | None observable (§2.6 D3) | Socket.IO via Extend; coverage not guaranteed (PDF §6, §8) | **Missing / Unverified** | Live Session Manager + REST fallback polling |
| **Socket Mapping** | Absent; fixture IDs presumed usable | Fixture IDs ≠ event IDs (PDF §5) | **Missing** | Event Mapping Service (§9) |
| **Tournament Sync** | Working, broad, accurate (§2.5) | Core API metadata | **Already Correct** | Preserve. Add `surface`, `draw_size` (D1) |
| **Player IDs** | Unverified; possibly string-denormalised (§3.4) | Stable IDs; the join key for replacements and mapping | **Unknown → verify** | Normalise `players`; FK everywhere |
| **Replacement Detection** | Absent | Player IDs change silently; **no event emitted** (PDF §3) | **Missing** | Draw Refresh Worker with revision diffing (§11) |
| **Socket Recovery** | Absent | **No replay** after disconnect (PDF §7) | **Missing** | Reconcile-before-resume (§12) |
| **Coverage Fallback** | Absent | Live coverage not guaranteed at Challenger/ITF (PDF §8) | **Missing** | Automatic REST polling fallback (§13) |
| **Draw Publication Timing** | Not polled | No SLA on publication or replacements (PDF §9) | **Missing** | Adaptive polling schedule (§11.4) |
| **Settlement** | Broken — completed event shows 62 unplayed nodes (§2.3) | Results available via REST fixtures | **Major Changes** | Rebuild on bracket tree; idempotent; REST-authoritative (§14) |
| **Lifecycle states** | Correct states and copy (§2.4) | — | **Already Correct** | Retrigger `draw_published` from Draw API |
| **Surface metadata** | All tournaments display `Hard` (D1) | Core provides surface | **Minor Changes** | Ingest and render actual surface |
| **Testing** | No coverage of bracket path (§3.13) | — | **Missing** | §17 |

---

## 7. Draw integration

### 7.1 Why the Draw API must become the canonical bracket source

Three independent arguments converge:

**Correctness.** A draw is not a function of its entrants. Given 128 players and their seeds there are astronomically many valid brackets; the LTA/USTA draw ceremony picks one. Generating a bracket from seeding convention produces a bracket that is right at the seed lines and wrong everywhere else — exactly §2.2. For a bracket-picking product, "wrong everywhere except the seeds" is indistinguishable from wrong.

**Durability.** Fixtures are a *window* onto scheduled and remaining play. Windows move. A structure derived from a moving window is not stable, which is why Masters event's bracket vanished mid-event (§2.1). A persisted draw does not vanish.

**Provider contract.** The Matchstat team told us plainly: use `/draws`; fixtures are not a bracket (PDF §1). Building against a contradicted assumption is not a shortcut, it is unpaid debt with a due date of 31 August.

### 7.2 The `draw` field and slot mathematics

Treat `draw` as the **1-based bracket slot index** within the round. Persist it verbatim. Never renumber, never sort by seed, never sort by name.

For a draw of size `N` (slam event singles: `N = 128`):

```
Round r ∈ {1 … log2(N)}          r=1 is R128 for N=128
Slots in round r:      N / 2^(r-1)
Matches in round r:    N / 2^r
R1 match m occupies slots (2m − 1, 2m)          m ∈ [1, N/2]
Winner of round-r match m feeds round-(r+1) match ⌈m / 2⌉
   … entering as the LOW side  if m is odd
   … entering as the HIGH side if m is even
```

That last line is the one people get wrong. Encode it once, in one function, and test it exhaustively for N ∈ {8, 16, 32, 64, 128}.

```
      slot 1 ─┐
              ├─ R1 m=1 ─┐
      slot 2 ─┘          │
                         ├─ R2 m=1 ─┐
      slot 3 ─┐          │           │
              ├─ R1 m=2 ─┘           │
      slot 4 ─┘                      ├─ R3 m=1 …
      slot 5 ─┐                      │
              ├─ R1 m=3 ─┐           │
      slot 6 ─┘          │           │
                         ├─ R2 m=2 ─┘
      slot 7 ─┐          │
              ├─ R1 m=4 ─┘
      slot 8 ─┘
```

**Do not store the bracket as a tree of object references.** Store slots and nodes as integer-indexed rows and let the arithmetic above be the only traversal logic. It is diffable, it is idempotent, and it survives partial draws.

### 7.3 `seed1` / `seed2` is a union type

```
seed1 ∈ { null, 1..32, "Q", "WC", "PR", "LL", … }
```

Persist as **two columns**, never one:

| Column | Type | Meaning |
|---|---|---|
| `seed_number` | `int null` | Official seeding, when the entry is seeded |
| `entry_tag` | `enum null` | `Q` qualifier · `WC` wild card · `PR` protected ranking · `LL` lucky loser · `ALT` alternate |

They are **not mutually exclusive**. A wild card can be seeded (rare but real at slams); a qualifier is never seeded but must still render as `Q`. Parse defensively — an unknown tag is logged and stored raw, never dropped and never coerced to `null`.

Cross-check numeric seeds against `/seeds` on import. Disagreement is a **warning, not a failure**: `/seeds` is the official list, `/draws` is the slot attribution, and a mismatch usually means one of the two was fetched mid-publication. Log, alert, re-fetch — do not block the import.

### 7.4 Byes

A bye is a `null` opponent (PDF §3), not a player named "Bye".

Rules:
1. Model as a **slot state**, not a player: `draw_slots.is_bye = true`, `player_id = null`.
2. At import, immediately settle the parent node: the non-null side advances, `status = 'bye'`, no fixture exists and none is expected.
3. The UI must never offer a pick on a bye node. A user picking "Bye" is a bug the moment a lucky loser fills the slot.
4. Scoring must not award points for a bye advance.

**Edge case that will bite:** a bye can become a real player. If a main-draw entrant withdraws late, the slot may be filled from the qualifying pool rather than converted to a bye. Handle bye→player and player→bye as ordinary slot mutations in the diff (§11.3), not as special cases.

### 7.5 Qualifiers, wild cards, protected ranking, lucky losers

All four arrive as entry tags. The operationally distinct one is **LL**.

| Tag | When it lands | Placeholder risk | Handling |
|---|---|---|---|
| `WC` | Before the draw ceremony | None — named at publication | Render badge |
| `PR` | Before the draw | None | Render badge |
| `Q` | Draw published **before** qualifying ends → slot may read `Q` with **no player** | **High** | Render "Qualifier" placeholder; block picks on that node until named; re-poll aggressively |
| `LL` | After a withdrawal, often hours before play | **Highest** — arrives as a silent ID swap | §11.3 |

The `Q`-placeholder case is a slam event certainty: the main draw is published while qualifying is still being played. Your bracket UI must render an unnamed qualifier slot gracefully and your entry-lock logic must decide whether a bracket containing unnamed qualifiers can be submitted. **Recommendation: allow submission, treat the qualifier slot as a pick on the slot rather than the player** (§19, G7) — which is exactly the design that also makes replacements harmless.

### 7.6 Implementation

```
DrawImportService.import(tournamentId)

 1. draw   ← DrawAPI.getDraw(tournamentId)         # retry, 3 attempts, backoff
 2. seeds  ← DrawAPI.getSeeds(tournamentId)        # non-fatal on failure
 3. VALIDATE (see §7.7). Abort on hard failure. Never partially write a draw.
 4. revision_hash ← sha256(canonical_json(draw))
 5. IF revision_hash == tournaments.draw_hash → no-op, bump checked_at, return
 6. IN TRANSACTION:
      a. INSERT draw_revisions(tournament_id, hash, payload, detected_at)
      b. UPSERT draw_slots  keyed (tournament_id, round=1, slot_index)
      c. UPSERT bracket_nodes for all rounds via §7.2 arithmetic
      d. Auto-advance byes
      e. Re-link known fixtures to nodes by (tournament_id, round, player pair)
      f. tournaments.draw_hash = revision_hash
         tournaments.draw_published_at ||= now()
         tournaments.draw_size = N
 7. IF previous revision existed → emit DrawChanged(diff) to §11.3
 8. Invalidate bracket cache; enqueue event-mapping resolution for R1 nodes
```

**Transactional, all-or-nothing.** A half-imported slam event draw visible to users for even thirty seconds is worse than no draw.

### 7.7 Validation gates

Refuse the import if any of these fail:

- `N` is a power of two, `8 ≤ N ≤ 128`
- Exactly `N/2` first-round entries; no duplicate `draw` values
- `draw` values form a contiguous `1..N/2` sequence — **a gap means a partially published draw; wait and re-poll**
- No player ID appears in two slots (this is the §2.2 defect; assert against it forever)
- Numeric seeds are unique within the tournament

Soft warnings (import proceeds, alert fires): seed disagreement with `/seeds`; unknown entry tag; bye count > `N/4`.

### 7.8 Testing

- Golden-file import for a real 128 draw (capture the slam event draw the hour it publishes and freeze it as a fixture).
- Property test: for every `N`, every R1 slot maps to exactly one node, and every node has exactly one parent except the final.
- Idempotence: import the same payload 10× → one revision row, zero slot mutations.
- Partial-draw rejection: gapped `draw` sequence → import refused, previous draw intact.

### 7.9 Edge cases

Draw published in two halves (top/bottom) · draw republished with corrections after a ceremony error · qualifier slots still unnamed at publication · a 96-draw or 56-draw event with first-round byes for top seeds (Masters 1000 — relevant to Masters event, not to the slam event, but your code will meet it) · doubles draws sharing a tournament ID with singles (**verify how the API disambiguates — see §18 Q3**).

> **Engineering Decision**
> The Draw API becomes the sole source of bracket structure. `draw_slots` and `bracket_nodes` are persisted, revision-hashed, and treated as immutable-until-diffed. All local bracket generation is removed from the production path and retained only behind a test-only flag. Bracket rendering becomes a pure read of persisted state — never a computation over fixtures.

---

## 8. Fixture integration

### 8.1 What fixtures are for

Fixtures answer *"what is happening, when, and how did it end."* Concretely:

- Scheduled start time, court, session
- Match status: `scheduled` → `live` → `finished` / `retired` / `walkover` / `cancelled`
- **Final scores and the winner — the authoritative settlement input**
- The seed pair for a *specific* meeting (cross-check only)
- Identity inputs for event mapping (player IDs + round)

### 8.2 What fixtures must never be used for

Write these as lint rules if you can, comments if you can't:

- ❌ **Never** reconstruct a bracket from fixtures. (PDF §4; §2.1)
- ❌ **Never** infer draw slot position from fixture ordering, ID ordering, or scheduling order.
- ❌ **Never** infer that a match does not exist because no fixture exists. Fixtures cover scheduled and *remaining* play; the absence of a fixture is not the absence of a match.
- ❌ **Never** create a bracket node from a fixture. Nodes come from the draw; fixtures *attach* to nodes.
- ❌ **Never** treat a fixture disappearing as a cancellation.

### 8.3 Attachment

Fixtures attach to nodes; they do not define them.

```
attachFixture(fixture):
  node ← bracket_nodes WHERE tournament_id = f.tournament_id
                         AND round        = f.round
                         AND {slot_a.player_id, slot_b.player_id} == {f.p1_id, f.p2_id}
  if node found          → bind fixture_id, update status/time/court/result
  if no node             → quarantine + alert   # draw stale, or a replacement we missed
  if node already bound  → assert same fixture_id, else alert (data correction upstream)
```

**The `no node found` branch is a tripwire for silent replacements** (§11.3). Wire it to a real alert channel, not a log line.

> **Engineering Decision**
> Fixtures are demoted to a metadata and result feed attached to draw-derived nodes. All structural inference from fixtures is deleted. An unattachable fixture is quarantined and alerts, because it is the earliest external signal that our draw snapshot has drifted.

---

## 9. Event Mapping Service

### 9.1 The problem

> "Core fixture IDs are different from Socket.IO event IDs." (PDF §5)

Consequence: subscribing to a live match with a fixture ID **fails silently**. The socket connects, the token validates, `join-event` is accepted, and no messages ever arrive. Every health check passes. This is the single most dangerous failure mode in the integration, because it looks exactly like "no play right now."

**Design rule: the mapping service must assert on message receipt, not on subscription success.**

### 9.2 Contract

| | |
|---|---|
| **Input** | `(tournament_id, round, player_id_a, player_id_b)` — plus `fixture_id` for logging |
| **Output** | `{ event_id, method, confidence, resolved_at, expires_at }` or `null` |
| **Store** | Postgres `event_map` (durable) + Redis (hot, TTL 6h) |
| **Negative cache** | 90s TTL — coverage may begin mid-match; never cache a miss for long |
| **Refresh** | On draw change; on socket join yielding zero messages in 60s; on TTL expiry |

**Key on the player pair, not the fixture ID.** Player pair is stable across fixture reschedules and is the only key that survives an upstream fixture-ID change.

Normalise the pair: `(min(a,b), max(a,b))` so lookup is order-independent.

### 9.3 Resolution ladder

```
resolve(t_id, round, pA, pB):

  1. CACHE       redis[t_id:round:min:max]              → hit? return (confidence: cached)
  2. DB          event_map row, not expired             → hit? warm cache, return
  3. DIRECT      Extend event/get(tournament, round,
                 players)                               → hit? persist, return (HIGH)
  4. ENUMERATE   Extend live-events for tournament,
                 match on player pair                   → hit? persist, return (HIGH)
  5. FUZZY       match on tournament + round +
                 exactly one player                     → hit? persist (LOW), ALERT
  6. MISS        negative-cache 90s, schedule retry,
                 fall back to REST polling (§13)        → return null
```

Steps 5 and 6 both alert. A LOW-confidence mapping is allowed to drive the live overlay but is **never** allowed to drive settlement — settlement is REST-only regardless (§14), which is precisely why a mis-mapped event cannot corrupt user scores.

### 9.4 Pseudocode

```python
class EventMappingService:

    NEG_TTL = 90          # seconds
    POS_TTL = 6 * 3600

    def resolve(self, t_id, round_, p_a, p_b, fixture_id=None):
        lo, hi = sorted((p_a, p_b))
        key = f"evmap:{t_id}:{round_}:{lo}:{hi}"

        if (hit := self.redis.get(key)) is not None:
            return None if hit == "MISS" else Mapping.loads(hit)

        if (row := self.db.get_event_map(t_id, round_, lo, hi)) and not row.expired:
            self.redis.setex(key, self.POS_TTL, row.dumps())
            return row

        # ---- live resolution -------------------------------------------
        try:
            ev = self.extend.event_get(tournament_id=t_id, round=round_,
                                       player_ids=[lo, hi])
            if ev:
                return self._persist(key, t_id, round_, lo, hi,
                                     ev.id, "event_get", "HIGH")

            for ev in self.extend.live_events(tournament_id=t_id):
                if {ev.player1_id, ev.player2_id} == {lo, hi}:
                    return self._persist(key, t_id, round_, lo, hi,
                                         ev.id, "enumerate", "HIGH")

                # one-sided match → likely a replacement we have not ingested
                if len({ev.player1_id, ev.player2_id} & {lo, hi}) == 1:
                    metrics.incr("evmap.partial_match")
                    alert("Partial event match — draw may be stale",
                          tournament=t_id, round=round_, fixture=fixture_id)
                    self.draw_refresh.enqueue_priority(t_id)   # ← self-healing
                    return self._persist(key, t_id, round_, lo, hi,
                                         ev.id, "fuzzy", "LOW")

        except MatchstatError as e:
            metrics.incr("evmap.error", tags={"kind": e.kind})
            # do NOT negative-cache a transport failure
            return None

        self.redis.setex(key, self.NEG_TTL, "MISS")
        metrics.incr("evmap.miss")
        return None

    def invalidate_tournament(self, t_id):
        """Called by the Draw Refresh Worker on any slot mutation."""
        self.redis.delete_pattern(f"evmap:{t_id}:*")
        self.db.expire_event_map(t_id)
```

Note the self-healing loop: a partial player match tells the mapper that the *draw* is stale, and it enqueues a priority draw refresh. Mapping failures and replacement detection reinforce each other.

### 9.5 Failure handling

| Failure | Response |
|---|---|
| `event/get` 404 | Try enumeration, then negative-cache 90s, then REST fallback |
| Extend API 5xx / timeout | Circuit-break for 60s. **Never negative-cache a transport error** — that converts a blip into an hour of blindness |
| Rate limited (429) | Respect `Retry-After`; token bucket at 80% of documented ceiling; jittered backoff |
| Mapping resolves but zero messages in 60s | Treat as a miss: invalidate, re-resolve, fall back to REST (§13) |
| Player pair matches two events | Alert, prefer the one whose round matches, mark LOW |

### 9.6 Testing

Unit: ladder ordering, pair normalisation, negative-TTL expiry, transport-error non-caching. Integration: 128 concurrent resolutions against a stubbed Extend API (slam event day-one load). Chaos: 30% 5xx rate → assert no permanent negative caching and no unbounded retry storm.

> **Engineering Decision**
> A dedicated Event Mapping Service owns all fixture↔event identity resolution, keyed on the normalised player pair with a five-step resolution ladder, split positive/negative TTLs, and durable persistence. No other module may construct a socket event ID. Confidence is carried through to consumers, and LOW-confidence mappings are barred from the settlement path.

---

## 10. Live match system

### 10.1 What Matchstat guarantees

- Authenticate at `/extend/api/ws-token` (PDF §6).
- **One token can subscribe to multiple events** — so one connection per process, not one per match.
- Prefer `join-event` (per event) over `join-live-events-all` where practical (PDF §6).
- **No replay after disconnect** (PDF §7).
- **Coverage is not guaranteed** below tour level (PDF §8).

### 10.2 Architecture

```
                       ┌──────────────────────────────┐
                       │   Live Session Manager        │  singleton per process
                       │  ┌────────────────────────┐   │
   token refresh ──────┼─▶│ TokenProvider           │   │  refresh at 75% of TTL
   (before expiry)     │  └────────────────────────┘   │
                       │  ┌────────────────────────┐   │
                       │  │ SocketClient            │───┼──▶ Matchstat Socket.IO
                       │  │  connect / heartbeat    │   │
                       │  └────────────────────────┘   │
                       │  ┌────────────────────────┐   │
   desired set ───────▶│  │ SubscriptionReconciler │   │  desired vs joined,
   (from bracket +     │  │  join / leave diffing   │   │  converge every 30s
    Event Mapping)     │  └────────────────────────┘   │
                       │  ┌────────────────────────┐   │
                       │  │ MessageRouter           │   │  event_id → node_id
                       │  └───────────┬────────────┘   │
                       └──────────────┼────────────────┘
                                      ▼
                        ┌──────────────────────────┐
                        │  Redis live_state:{node} │   ephemeral, TTL 2h
                        │  (never the DB)          │
                        └────────────┬─────────────┘
                                     ▼
                        ┌──────────────────────────┐
                        │  SSE / WS fan-out to app  │
                        └──────────────────────────┘
```

### 10.3 Design rules

**One connection, many events.** The provider confirms a single token subscribes to multiple events. Opening a socket per match at a Grand Slam means ~64 concurrent connections on day one — needless, and likely to draw rate limiting.

**Prefer `join-event`.** Per PDF §6. Reserve `join-live-events-all` for two narrow uses: (a) event discovery when mapping has failed, and (b) a deliberate ops fallback if per-event joins are misbehaving. Firehose mode at slam event scale means receiving every ITF match on earth to render 64 of them.

**Live state never touches Postgres.** Socket payloads land in Redis with a TTL and are read only by the live overlay. If Redis is flushed mid-match, the next REST poll rebuilds it. Nothing durable is lost, because nothing durable was ever stored.

**Assert on receipt, not on join.** For each subscription, record `last_message_at`. If a node is `live` per REST and has received nothing for 60s, treat the mapping as suspect (§9.5) and fall back to REST (§13). This is the only defence against the silent-mapping-failure mode.

**Token lifecycle.** Fetch once per process, refresh at 75% of TTL, and refresh immediately on any auth-class disconnect. Never fetch a token per subscription.

### 10.4 Subscription set

Desired subscriptions = every `bracket_node` where:

```
node.status ∈ {live, scheduled}
AND node.scheduled_start  ≤ now + 30min
AND tournament.status      = 'on_court'
AND tournament is user-relevant (has entries, or is tour-level)
```

Reconcile desired-vs-actual every 30s. Join on entry, leave on completion — leaving matters, because an unbounded subscription set is a slow memory leak across a two-week slam.

### 10.5 Testing

Unit: token refresh at boundary; reconciler diffing; router mapping unknown event → quarantine. Integration: stub socket server emitting score deltas → assert Redis state and SSE fan-out. Load: 64 concurrent live nodes, 4 messages/sec each, for 30 minutes — assert flat memory and no subscription leak.

### 10.6 Edge cases

Match suspended for rain and resumed hours later (subscription must survive or be re-established) · a node going live before its scheduled time · score corrections arriving out of order (**apply last-write-wins on a server timestamp, never on arrival order**) · a message for an event we have since unsubscribed from · two nodes mapped to the same event ID.

> **Engineering Decision**
> A single Live Session Manager per process owns one authenticated socket connection and reconciles a desired subscription set every 30 seconds using per-event joins. Live state is written only to Redis with a TTL and is never authoritative. Subscription health is measured by message receipt, not by join success, and a silent subscription automatically degrades to REST polling.

---

## 11. Draw Refresh Worker

### 11.1 Why it exists

> "Replacements occur by changing player IDs rather than emitting a replacement event." (PDF §3)
> "No SLA is provided for draw publication or replacement timing. Poll the draw endpoint and detect changes automatically." (PDF §9)

Two explicit "we do not provide X" statements. The compensating mechanism is **diffing snapshots**. There is no alternative design — this is the entire mechanism by which MatchRead ever learns that a lucky loser has replaced a withdrawn player.

### 11.2 Responsibilities

1. Detect draw **publication** (transition from absent to present).
2. Detect **any** structural change via revision hash.
3. Classify each changed slot: replacement · lucky loser · qualifier named · bye conversion · correction.
4. Apply the change transactionally, preserving audit history.
5. Cascade: invalidate event mappings, re-attach fixtures, re-evaluate user picks, notify.

### 11.3 Change detection and classification

```
detectChanges(tournament_id):

  new  ← DrawAPI.getDraw(tournament_id)
  hash ← sha256(canonical_json(new))
  if hash == stored_hash: return NO_CHANGE

  prev ← latest draw_revision
  diff ← compare(prev.slots, new.slots) keyed on slot_index

  for each changed slot:
      old_p, new_p = prev.player_id, new.player_id
      tag          = new.entry_tag
      played       = node_for(slot).status != 'scheduled'

      if old_p is null and new_p is not null and tag == 'Q':
            → QUALIFIER_NAMED     (expected; low noise)
      elif old_p is null and new_p is not null and prev.is_bye:
            → BYE_FILLED          (rare; alert)
      elif old_p is not null and new_p is null:
            → SLOT_VACATED        (withdrawal pending replacement; alert)
      elif old_p != new_p and tag == 'LL':
            → LUCKY_LOSER         (expected; notify affected users)
      elif old_p != new_p and not played:
            → REPLACEMENT         (notify affected users)
      elif old_p != new_p and played:
            → DATA_CORRECTION     (⚠ PAGE ON-CALL — a played match changed identity)
```

That last branch deserves emphasis. **A player ID changing in a slot where a match has already been played is not a replacement — it is an upstream data correction, and it may have already produced wrong settlements.** It must page, not log.

### 11.4 Polling schedule

No SLA means the schedule must be adaptive rather than uniform. Intervals scale by tournament importance and proximity to play.

| Phase | Grand Slam / ATP-WTA main tour | Challenger / ITF | Rationale |
|---|---|---|---|
| T−14d → T−48h, draw absent | 15 min | 60 min | Cheap watch; publication unlikely |
| T−48h → publication (**slam draw-ceremony window**) | **60 s** | 10 min | The single highest-value poll in the system |
| Published → entry lock | 60 s | 5 min | Peak LL / withdrawal window |
| Entry lock → R1 complete | 2 min | 10 min | LLs still land right up to first ball |
| R2 onward, in play | 15 min | 30 min | Structure stable; guards corrections |
| Complete | 1 h for 24 h, then stop | same | Catches late corrections |

Additional triggers that jump the queue regardless of schedule: an unattachable fixture (§8.3); a partial player match in event mapping (§9.4); a manual ops trigger; any node whose two REST-reported players disagree with our slots.

**Rate-limit discipline.** ~200 active tournaments × frequent polls will hit a ceiling. Mandatory: a shared token bucket at 80% of the documented limit, per-tournament jitter of ±20% so polls never align, ETag/`If-Modified-Since` where supported, and a strict priority queue — Grand Slam draw-window polls preempt every ITF poll.

### 11.5 Cascade on change

```
  Draw change detected
        │
        ├─▶ Write draw_revisions row (full payload + diff)     [audit]
        ├─▶ Update draw_slots, bracket_nodes                    [transactional]
        ├─▶ EventMappingService.invalidate_tournament(t_id)     [IDs now stale]
        ├─▶ Re-attach quarantined fixtures                      [may now resolve]
        ├─▶ Re-evaluate picks touching changed slots            [§19 G7]
        ├─▶ Notify affected users ("Lucky loser X replaces Y in your bracket")
        └─▶ Emit metric draw.change{type=…} + ops feed entry
```

### 11.6 Testing

Golden diff pairs for each classification (build them by hand-editing a captured draw payload) · idempotence: same payload twice → one revision · concurrency: two workers on one tournament → advisory lock holds, one revision · a 128-draw with 4 simultaneous LL swaps → 4 classified changes, 4 notifications, 0 spurious.

### 11.7 Edge cases

Draw published in halves (top half first) — hash changes but this is not a replacement; classify `DRAW_EXTENDED` and do not notify · qualifying draw and main draw both present under one tournament (§21 Q3) · a player withdrawing and being replaced *twice* in the same day · replacement arriving between our poll and entry lock (**the pick-integrity case — §19 G7**) · upstream serving a stale cached draw, causing hash flapping (guard with a 3-poll confirmation before classifying a *reversal*).

> **Engineering Decision**
> A Draw Refresh Worker polls `/draws` on an adaptive, priority-aware schedule and detects all structural change by revision hashing plus slot-level diffing, since the provider emits no replacement events. Every change is classified, persisted as an immutable revision, and cascaded to event mappings, fixtures, picks, and users. Player-ID changes in already-played slots page on-call rather than log.

---

## 12. Socket recovery

### 12.1 The constraint

> "There is no replay after disconnects. Reconcile state using REST endpoints before resuming live updates." (PDF §7)

So: **reconcile first, resume second.** Never the reverse. A socket that resumes before reconciling will overwrite correct REST state with a partial live view and can leave a finished match displaying a stale in-progress score indefinitely.

### 12.2 Reconnect sequence

```
 App              LiveSessionMgr      Extend/REST        Socket.IO         DB/Redis
  │                     │                  │                 │                │
  │                     │◀── disconnect ───┤                 │                │
  │                     │                                                     │
  │                     │── state = DEGRADED ────────────────────────────────▶│
  │◀── "reconnecting" ──┤                                                     │
  │                     │                                                     │
  │                     │── backoff (1,2,4,8,16,30s ±jitter) ──               │
  │                     │                                                     │
  │                     │── POST /extend/api/ws-token ──────▶│                │
  │                     │◀───────────── token ──────────────┤                │
  │                     │                                                     │
  │                     │══ RECONCILE (blocking, before any join) ════════════│
  │                     │── GET /fixtures?tournament=…&status=live,finished ─▶│
  │                     │◀───────────── authoritative state ─────────────────┤
  │                     │── settle finished nodes (idempotent) ──────────────▶│
  │                     │── rebuild live_state in Redis ─────────────────────▶│
  │                     │── EventMapping.resolve() for still-live nodes ─────▶│
  │                     │                                                     │
  │                     │── connect + join-event × N ───────▶│                │
  │                     │◀────────── score deltas ───────────┤                │
  │                     │── state = HEALTHY ─────────────────────────────────▶│
  │◀── "live" + fresh ──┤                                                     │
```

### 12.3 Rules

- **Blocking reconciliation.** No `join-event` is issued until the REST sweep completes. Add a hard assertion.
- **Reconcile scope = every node in `live` or `scheduled` for any `on_court` tournament**, not just previously subscribed nodes — matches finish during a disconnect.
- **Settlement during reconciliation is idempotent** (§14). Reconciling the same window ten times settles nothing twice.
- **Backoff:** 1, 2, 4, 8, 16, 30s with ±20% jitter, capped at 30s, infinite retries. All processes jittered so a provider blip does not produce a thundering herd.
- **Watermark:** persist `last_reconciled_at` per tournament. A disconnect longer than 10 minutes triggers a full-tournament sweep rather than a delta.
- **User-visible honesty:** show a "reconnecting — scores may be delayed" state. Silent staleness is worse than acknowledged staleness.

### 12.4 Cold start is the same path

Process start = reconnect with no prior state. Use the identical code path. This guarantees the reconciler is exercised on every deploy, which is exactly the property you want in the code path you rely on during an incident.

### 12.5 Testing

Kill the socket mid-match, assert reconcile-before-join ordering · disconnect across a match completion, assert settlement happens via REST · 30-minute disconnect → full sweep · reconcile 10× → one settlement · assert no `join-event` is ever issued while `state = DEGRADED`.

> **Engineering Decision**
> Reconnect is a strict reconcile-then-resume sequence with blocking REST reconciliation, jittered capped backoff, and a per-tournament watermark. Since no replay exists, REST is the recovery mechanism and the socket is resumed only after durable state is known correct. Cold start reuses the identical path.

---

## 13. Graceful fallbacks

Every failure mode, its detection signal, its automatic response, and its user-visible behaviour. **Every row must degrade, never fail.**

| # | Failure | Detection | Automatic response | User sees |
|---|---|---|---|---|
| F1 | **Missing event ID** (mapping miss) | `resolve()` → null, or join with 0 messages in 60s | Negative-cache 90s; REST poll node every 30s; retry mapping every 2 min | Scores update slower; no error |
| F2 | **Socket unavailable** (Extend down) | Connect fails 3× or token endpoint 5xx | Circuit-break 60s; **whole-system REST polling at 30s** for live nodes; keep retrying | "Live scores delayed" banner |
| F3 | **Draw unavailable at publication time** | Draw poll 404/empty past expected window | Stay in `draw_pending`; escalate poll to 60s; alert ops at T−24h | "Picking opens when the official draw is published" (existing copy — already correct) |
| F4 | **Partial draw** (gapped `draw` sequence) | Validation gate §7.7 | **Refuse import**; keep prior state; re-poll in 60s; alert | Prior state, or still pending |
| F5 | **Coverage gap** (no live feed for this match — expected at ITF, PDF §8) | Node `live` per REST, mapping miss ≥3 attempts | Mark node `no_live_coverage`; REST poll 60s; stop mapping retries for that node | "Score updates periodically" |
| F6 | **Rate limited (429)** | HTTP 429 / `Retry-After` | Token bucket to 50%; shed ITF polls first; **never shed Grand Slam draw polls**; exponential backoff | Slower non-slam updates |
| F7 | **Player replacement pre-lock** | Draw diff (§11.3) | Pick follows the **slot**; notify affected users; re-open edit if before lock | "Lucky loser X replaces Y in your bracket" |
| F8 | **Player replacement post-lock** | Draw diff after `entry_locked_at` | Pick follows the slot; **no bracket edit**; log for audit | Notification only |
| F9 | **Fixture with no matching node** | Attachment failure (§8.3) | Quarantine; priority draw refresh; retry after refresh | Nothing |
| F10 | **Retirement / walkover / default** | Fixture status | Settle normally — a winner exists; render "ret." / "w/o" | Correct result with annotation |
| F11 | **Redis flush / live state loss** | Cache miss on live read | Rebuild from REST on next poll | One-cycle delay |
| F12 | **Core API down** | 5xx streak | Serve persisted bracket from DB (this is the payoff of I1); freeze settlement; alert | Bracket fully readable; results delayed |
| F13 | **Draw changes mid-tournament in a played slot** | `DATA_CORRECTION` (§11.3) | **Halt automatic settlement for that tournament**; page on-call; require manual confirmation | Standings frozen with notice |
| F14 | **Two nodes map to one event ID** | Mapping uniqueness assertion | Mark both LOW; REST-poll both; alert | Slower updates |
| F15 | **Token expiry mid-session** | Auth-class disconnect | Immediate token refresh → full reconnect path (§12) | Brief "reconnecting" |

**The invariant across all fifteen:** the bracket remains readable and settlement remains correct-or-frozen. We would rather show a correct bracket with delayed scores than a fast bracket with wrong scores — because a bracket product's entire value is that the standings are right.

> **Engineering Decision**
> Every external dependency has a defined degradation path terminating in REST polling over persisted state. Live delivery is best-effort; bracket structure and settlement correctness are not. Settlement freezes rather than guesses whenever draw integrity is in doubt, and every degraded state is surfaced honestly to the user.

---

## 14. Settlement engine

Not in the original section list, but §2.3 makes it unavoidable: a completed tournament displaying 62 unplayed matches is a launch blocker on its own.

### 14.1 Principles

1. **REST is authoritative.** Settlement reads `status = finished` from Core fixtures. A socket message may *trigger* a settlement check; it may never *be* the settlement input.
2. **Idempotent.** Key on `(node_id, result_hash)`. Re-running a day of settlement is a no-op.
3. **Ordered by round.** Never settle round `r+1` before round `r`; a bracket must not contain a player who has not arrived.
4. **Advance is a write, not a view.** On settlement, write the winner into the parent node's slot. §2.3's "Not played" strongly suggests advancement is currently a read-time computation over data that no longer supports it.
5. **Freeze over guess.** Any integrity violation (§13 F13) freezes settlement for that tournament and pages.

### 14.2 Flow

```
settleNode(node):
  fixture ← REST fixture bound to node
  guard   fixture.status ∈ {finished, retired, walkover, default}   else return
  guard   node.status != 'settled'                                  else return (idempotent)
  guard   parent-round-invariant holds                              else defer

  hash ← sha256(winner_id, score_string, status)
  if node.result_hash == hash: return

  TRANSACTION:
     node.winner_id, node.score, node.status='settled', node.result_hash=hash
     parent ← node_for(round+1, ceil(m/2))
     parent.slot[ m odd ? 'a' : 'b' ] ← winner_id          # §7.2
     score_picks(node)                                      # per-user, idempotent
     recompute_standings(affected leagues)
  emit NodeSettled(node)
```

### 14.3 Byes

Settled at import time (§7.4), `status = 'bye'`, no fixture, no points awarded, no pick offered.

### 14.4 Backfill

Because §2.3 shows historical data is wrong, ship a one-off backfill: re-import draws for all completed tournaments in the current season, re-attach fixtures, and re-run settlement round by round. Idempotence makes this safe to run repeatedly. Run it in staging first and diff the standings delta — some users' historical scores will change, and that needs a product decision before it goes live.

### 14.5 Testing

Full 128-draw simulation from R1 to champion, asserting 127 settled nodes · settle out of order → deferred, not corrupted · retirement mid-match → winner recorded, score annotated · re-run entire settlement → zero mutations · bye path → parent advanced, zero points.

> **Engineering Decision**
> Settlement is rebuilt as an idempotent, round-ordered, REST-authoritative state machine that writes winners into parent bracket nodes. Socket events may trigger checks but never supply results. A historical backfill re-settles the current season once the draw layer lands.

---

## 15. Tournament lifecycle

```
  Tournament announced ─────── Core /tournaments
        │                      Sync creates row; status = upcoming
        │                      ✅ working today (§2.5)
        ▼
  Draw published ───────────── Draw /draws  (detected by refresh worker §11)
        │                      No SLA → adaptive polling is the only trigger
        │                      ⚠ new
        ▼
  Bracket imported ─────────── Draw /draws + /seeds
        │                      draw_slots + bracket_nodes written transactionally
        │                      Byes auto-advanced; status = draw_published
        │                      ⚠ new — replaces synthetic generation (§2.2)
        ▼
  Entries open ─────────────── (internal) picks accepted against slot IDs
        │                      Existing UI/gating already correct (§2.4)
        │                      ✅ working — retrigger source only
        ▼
  Entries lock ─────────────── (internal, entry_locked_at)
        │                      Existing lock times already surfaced correctly
        │                      Post-lock replacements → F8
        │                      ✅ working
        ▼
  Live scoring ─────────────── Extend ws-token + Socket.IO  (primary)
        │                      Core /fixtures                (fallback + truth)
        │                      Event Mapping resolves IDs (§9)
        │                      ⚠ new
        ▼
  Settlement ───────────────── Core /fixtures (authoritative results)
        │                      Winner written into parent node (§14)
        │                      ⚠ broken today (§2.3)
        ▼
  Champion ────────────────── Final node settled → tournament.status = complete
        │                      League standings finalised
        ▼
  Archive ─────────────────── Draw poll → 1h for 24h, then stop
                              Socket unsubscribed; live_state expired
                              Bracket retained permanently (I1)
                              ⚠ new (unsubscribe/teardown)
```

**Endpoint ownership per stage**

| Stage | Core | Draw | Extend | Socket |
|---|:--:|:--:|:--:|:--:|
| Announced | ● | | | |
| Draw published | | ● | | |
| Bracket imported | ○ players | ● | | |
| Entries open/lock | ○ | ○ | | |
| Live scoring | ● results | | ● mapping | ● scores |
| Settlement | ● | ○ integrity | | |
| Champion / Archive | ● | ○ | | |

● primary · ○ supporting

> **Engineering Decision**
> The existing lifecycle state machine is preserved unchanged. Only the trigger for `upcoming → draw_published` is rewired, from fixture availability to a confirmed, validated draw import. Archive gains explicit socket teardown and poll wind-down.

---

## 16. Repository recommendations

Recommended only where the API demands it. Nothing here is refactoring for its own sake.

### 16.1 New services

| Module ⟨inferred path⟩ | Purpose | Justification |
|---|---|---|
| `services/matchstat/drawClient` | `/draws`, `/seeds` | New API surface (PDF §1–2) |
| `services/matchstat/extendClient` | `ws-token`, `event/get` | New API surface (PDF §5–6) |
| `services/drawImport` | Validate + persist brackets | Replaces synthetic generation (§2.2) |
| `services/eventMapping` | Fixture ↔ event identity | PDF §5 — no provider-side mapping |
| `services/liveSession` | Socket lifecycle + subscriptions | PDF §6 |
| `services/reconciliation` | REST recovery after disconnect | PDF §7 — no replay |
| `services/settlement` (rebuild) | Round-ordered idempotent settlement | §2.3 |

### 16.2 New workers

| Worker | Cadence | Purpose |
|---|---|---|
| `drawRefreshWorker` | Adaptive (§11.4) | Publication + replacement detection |
| `livePollingWorker` | 30s (live) / 60s (no coverage) | Fallback when socket unavailable (PDF §8) |
| `settlementWorker` | On fixture-finished + 5-min sweep | Idempotent settlement + catch-up |
| `mappingWarmupWorker` | T−2h before a round | Pre-resolve event IDs before the rush |

### 16.3 Database changes

```sql
-- Structure (new)
CREATE TABLE draw_slots (
  tournament_id   BIGINT NOT NULL REFERENCES tournaments,
  slot_index      INT    NOT NULL,             -- the Matchstat `draw` field, verbatim
  player_id       BIGINT NULL REFERENCES players,
  seed_number     INT    NULL,
  entry_tag       TEXT   NULL,                 -- Q | WC | PR | LL | ALT
  is_bye          BOOLEAN NOT NULL DEFAULT false,
  source_revision BIGINT NOT NULL REFERENCES draw_revisions,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, slot_index)
);

CREATE TABLE bracket_nodes (
  id            BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments,
  round         INT    NOT NULL,               -- 1 = R128 for a 128 draw
  match_index   INT    NOT NULL,               -- 1..N/2^round
  slot_a        BIGINT NULL REFERENCES players,
  slot_b        BIGINT NULL REFERENCES players,
  fixture_id    BIGINT NULL,
  event_id      TEXT   NULL,                   -- resolved socket event id
  winner_id     BIGINT NULL REFERENCES players,
  score         TEXT   NULL,
  status        TEXT   NOT NULL DEFAULT 'pending',  -- pending|scheduled|live|settled|bye
  result_hash   TEXT   NULL,                   -- idempotency key
  UNIQUE (tournament_id, round, match_index)
);

CREATE TABLE draw_revisions (
  id            BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments,
  revision      INT    NOT NULL,
  hash          TEXT   NOT NULL,
  payload       JSONB  NOT NULL,               -- full raw draw, for audit + replay
  diff          JSONB  NULL,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, revision)
);

CREATE TABLE event_map (
  tournament_id BIGINT NOT NULL,
  round         INT    NOT NULL,
  player_lo     BIGINT NOT NULL,               -- normalised min(a,b)
  player_hi     BIGINT NOT NULL,
  event_id      TEXT   NOT NULL,
  method        TEXT   NOT NULL,               -- event_get | enumerate | fuzzy
  confidence    TEXT   NOT NULL,               -- HIGH | LOW
  resolved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tournament_id, round, player_lo, player_hi)
);

-- Existing tables (additive only)
ALTER TABLE tournaments
  ADD COLUMN draw_size        INT NULL,
  ADD COLUMN draw_hash        TEXT NULL,
  ADD COLUMN draw_published_at TIMESTAMPTZ NULL,
  ADD COLUMN surface          TEXT NULL,        -- fixes D1
  ADD COLUMN last_reconciled_at TIMESTAMPTZ NULL;

-- ⚠ THE CRITICAL ONE — see §19 G7
ALTER TABLE picks
  ADD COLUMN node_id     BIGINT NULL REFERENCES bracket_nodes,
  ADD COLUMN chosen_slot TEXT   NULL;           -- 'a' | 'b'  ← survives replacements
```

**Backfill note:** `picks.chosen_slot` must be populated for open tournaments before the slam event draw lands, or every LL swap corrupts a bracket. This migration is on the critical path (§19 G7).

### 16.4 Utility modules

`lib/bracket/math` (the §7.2 arithmetic — one implementation, exhaustively tested) · `lib/matchstat/rateLimiter` (shared token bucket) · `lib/matchstat/circuitBreaker` · `lib/hash/canonicalJson` (stable key ordering — a hash that flaps on key order makes every diff useless).

### 16.5 What to leave alone

Tournament sync · calendar and bucketing · lifecycle states and copy · league/entry model · i18n (`en`/`es`/`ja`) · the bracket **rendering** component — §2.2 is a data-ordering defect, not a rendering defect. Feed it correct slots and it will draw correct brackets.

---

## 17. Testing plan

### 17.1 Unit tests

| Area | Assertions |
|---|---|
| Bracket math (§7.2) | For N ∈ {8,16,32,64,128}: slot→node mapping is bijective; parent index `⌈m/2⌉`; odd→slot A, even→slot B; round count `log2(N)` |
| Seed parsing | `1`→(1,null) · `"Q"`→(null,Q) · `"WC"`→(null,WC) · `"PR"` · `"LL"` · `null`→(null,null) · unknown tag → stored raw + warned, never dropped |
| Draw validation (§7.7) | Non-power-of-two rejected · gapped `draw` rejected · duplicate player rejected · duplicate seed rejected |
| Bye handling | `null` opponent → `is_bye` · parent auto-advanced · no pick offered · zero points |
| Diff classification (§11.3) | All 6 classes produced from golden payload pairs; `DATA_CORRECTION` pages |
| Event mapping ladder | Order preserved · pair normalisation · negative TTL 90s · transport error not negative-cached |
| Settlement idempotence | Same result 10× → one mutation · out-of-order deferred |
| Canonical JSON hash | Key reordering produces an identical hash |

### 17.2 Integration tests (stubbed Matchstat)

- Full draw import: 128-player payload → 128 slots, 127 nodes, correct ordering.
- Draw change: import → mutate one slot → re-import → 1 revision, 1 classified change, mappings invalidated, pick reassigned.
- Fixture attachment: attach by player pair; unattachable fixture → quarantine + priority refresh enqueued.
- Socket lifecycle: token → connect → join → deltas → Redis state → SSE fan-out.
- **Reconnect ordering: assert no `join-event` is issued before REST reconciliation completes.** (§12.3)
- Fallback: socket unavailable → REST polling engages within 60s; scores still advance.
- Rate limiting: 429 storm → bucket throttles, ITF polls shed, slam draw poll preserved.

### 17.3 End-to-end (staging, accelerated clock)

**E2E-1 — Full tournament.** 128 draw published → import → user fills bracket → lock → 127 matches settle round by round → champion → standings correct. **This is the test whose absence produced §2.3. It is the single most valuable test in the plan.**

**E2E-2 — Lucky loser before lock.** User picks player X → X replaced by LL Y → pick follows the slot → user notified → settlement scores correctly.

**E2E-3 — Post-lock withdrawal.** Replacement after lock → pick follows slot, no edit allowed, audit row written.

**E2E-4 — Socket outage during a live round.** Kill socket → REST fallback engages → matches settle correctly → socket returns → reconcile → no double settlement.

**E2E-5 — Coverage gap.** ITF match with no live event → node marked `no_live_coverage` → REST polling settles it → no error surfaced to the user.

**E2E-6 — Late draw.** Draw absent until T−12h → status stays `draw_pending` → publishes → import completes → picking opens automatically without human action.

### 17.4 Manual QA

Bracket visual diff against the official slam event draw on the official site — **slot by slot, all 64 first-round matches, both draws.** Do this by eye and do not delegate it; §2.2 is exactly the class of bug that passes every automated check and is obvious to a human who knows tennis.

Then: entry tags render (`Q`/`WC`/`PR`/`LL`) · byes render as byes and are unpickable · live score latency measured against a broadcast · locale check (`en`/`es`/`ja`) on bracket labels and tag badges · mobile bracket at 128 nodes.

### 17.5 Launch-day verification checklist (slam event, 31 Aug)

Run in order. **Stop and escalate on any failure — do not continue down the list.**

```
T−72h  ☐ Draw refresh worker at 60s cadence for t-atp-21349 / t-wta-16743
       ☐ Alerting live: draw.published, draw.change, evmap.miss, socket.disconnect
       ☐ Ops runbook open; on-call named and awake for the ceremony window

T−0h   ☐ Draw detected within 120s of publication   [metric: draw.detect_latency]
       ☐ Import validation passed, 0 warnings
       ☐ 128 slots present, contiguous 1..64 R1 nodes, no duplicate player IDs
       ☐ Seeds 1–32 present and agree with /seeds
       ☐ Entry tags rendering; qualifier placeholders handled
       ☐ MANUAL: slot-by-slot diff vs official slam draw  ← blocking gate
       ☐ Picking opens automatically; status flips to draw_published

T+2h   ☐ Event mapping resolved for ≥95% of day-one nodes (HIGH confidence)
       ☐ Socket connected, subscriptions = live node count
       ☐ Messages received on ≥90% of subscriptions within 60s of match start
       ☐ Fallback polling confirmed active on unmapped nodes

Day 1  ☐ First match settles within 60s of REST reporting finished
       ☐ Winner advanced into parent node; user picks scored; standings moved
       ☐ Deliberate socket kill → reconcile → resume → zero double settlement
       ☐ Any LL replacement classified and notified correctly
       ☐ Error budget: <1% mapping misses, 0 unclassified draw changes
```

---

## 18. slam event readiness checklist

### Critical before launch — non-negotiable

- [ ] **Draw API integration live** — `/draws` + `/seeds` ingested and persisted (§7)
- [ ] **`draw_slots` / `bracket_nodes` schema shipped and backfilled** (§16.3)
- [ ] **Local draw generation removed from the production path** (§3.2)
- [ ] **Settlement rebuilt and verified end-to-end** — R1 → champion (§14) — *fixes §2.3*
- [ ] **Picks migrated to slot-based identity** (`picks.chosen_slot`) (§19 G7)
- [ ] **Draw Refresh Worker running at slam cadence** (§11.4)
- [ ] **Replacement detection classifying and notifying** (§11.3)
- [ ] **Event Mapping Service live with fallback** (§9)
- [ ] **REST fallback polling proven with the socket disabled** (§13 F2)
- [ ] **Reconnect reconciliation proven** — reconcile-before-join asserted (§12)
- [ ] **Entry tags parsed and rendered** — `Q`/`WC`/`PR`/`LL` (§7.3)
- [ ] **Byes modelled, auto-advanced, unpickable** (§7.4)
- [ ] **E2E-1 passing in staging** (§17.3)
- [ ] **Manual slot-by-slot draw verification completed** (§17.4)
- [ ] **Rate limiting + priority queue** so slam polls are never shed (§13 F6)
- [ ] **Alerting + on-call runbook for the draw-ceremony window**

### Strongly recommended

- [ ] Historical settlement backfill for the 2026 season (§14.4)
- [ ] Mapping warmup worker before each round (§16.2)
- [ ] `no_live_coverage` state surfaced honestly in the UI (§13 F5)
- [ ] Live-score latency dashboard (socket vs REST)
- [ ] Draw revision audit UI for ops (who changed, when, what)
- [ ] Surface metadata ingestion (D1)
- [ ] Load test: 128 concurrent live nodes

### Nice to have

- [ ] Push notifications for replacements affecting a user's bracket
- [ ] Bracket diff view ("what changed since you picked")
- [ ] Qualifier-slot preview showing likely qualifiers
- [ ] Homepage counter fix (D2); entry CTA suppressed on complete tournaments (D4)

### Future improvements

- [ ] Doubles draw support
- [ ] Junior draw support (already on the calendar: `t-atp-21350`, `t-wta-16744`)
- [ ] Qualifying-draw brackets as their own product surface
- [ ] Point-by-point / momentum data if Extend exposes it
- [ ] Predictive standings ("if this match goes 3 sets, you take the lead")

---

## 19. Gap analysis

The most important section. Every mismatch between confirmed Matchstat behaviour and MatchRead as observed.

**Risk** = damage if unfixed at the slam event. **Complexity** = engineering days for one experienced engineer.

---

### G1 — Brackets are derived from fixtures instead of the Draw API
**Current:** No persisted bracket. Structure synthesised at read time; lost once play begins — Masters event, an ATP 1000, shows "The full bracket is not published yet" while in play (§2.1).
**Required:** `/draws` imported, validated, persisted in `draw_slots` + `bracket_nodes`; bracket rendering becomes a pure DB read.
**Affected:** ⟨`services/drawGenerator`, `services/fixtureSync`, `db/migrations`, bracket read model, tournament page⟩
**Risk: CRITICAL** — without this there is no slam event bracket product.
**Complexity:** High (4–5 days) · **Priority: P0**

### G2 — Draw ordering computed rather than read from the `draw` field
**Current:** Seed-convention placement producing duplicated players across slots (§2.2).
**Required:** Order strictly by the numeric `draw` field, persisted verbatim; all local ordering deleted.
**Affected:** ⟨`lib/bracket`, `services/drawGenerator`⟩
**Risk: CRITICAL** — a wrong bracket at a slam is unrecoverable reputationally. Users will notice within minutes.
**Complexity:** Low once G1 lands (1 day) · **Priority: P0**

### G3 — Settlement does not propagate
**Current:** Completed 64-draw event shows one result and 62 "Not played" nodes (§2.3).
**Required:** Round-ordered, idempotent, REST-authoritative settlement writing winners into parent nodes (§14).
**Affected:** ⟨`services/settlement`, `workers/settlementWorker`, standings⟩
**Risk: CRITICAL** — the product's core loop ("did I move?") does not function.
**Complexity:** High (3–5 days, **wide error bar** — may collapse to 1 day if the cause is purely G1) · **Priority: P0**

### G4 — No replacement detection
**Current:** None. Provider emits no replacement event (PDF §3), so we are blind by construction.
**Required:** Draw Refresh Worker with revision hashing and slot-level diff classification (§11).
**Affected:** ⟨new `workers/drawRefreshWorker`, `services/drawImport`, notifications⟩
**Risk: HIGH** — every slam event sees multiple LL/withdrawal events, typically in the final 24h before play.
**Complexity:** Medium (3 days) · **Priority: P0**

### G5 — No event mapping (fixture ID ≠ socket event ID)
**Current:** Absent. Any socket subscription attempted with a fixture ID **fails silently** (PDF §5).
**Required:** Event Mapping Service with the five-step ladder, split TTLs, durable persistence (§9).
**Affected:** ⟨new `services/eventMapping`, `db/event_map`, live layer⟩
**Risk: HIGH** — no live scores, and the failure is invisible to monitoring that checks joins rather than receipts.
**Complexity:** Medium (2–3 days) · **Priority: P0**

### G6 — No socket recovery / reconciliation
**Current:** Absent. No replay exists upstream (PDF §7), so a disconnect permanently loses the interval.
**Required:** Blocking reconcile-then-resume with watermarks and jittered backoff (§12).
**Affected:** ⟨new `services/reconciliation`, `services/liveSession`⟩
**Risk: HIGH** — a single disconnect during a busy afternoon leaves scores stale indefinitely.
**Complexity:** Medium (2 days) · **Priority: P0**

### G7 — Picks are probably keyed on player identity, not slot identity ⚠
**Current:** Unverified, but a system with no bracket table almost certainly stores picks as `player_id`.
**Required:** Picks store `(node_id, chosen_slot)`. A replacement then changes *who occupies the slot* without touching the pick, and the user's bracket stays valid automatically.
**Affected:** ⟨`models/Pick`, entry flow, scoring, `db/migrations`⟩
**Risk: CRITICAL** — silent, correlated corruption of many user brackets, with no upstream event to react to. The worst failure class in the system: wrong answers that look right.
**Complexity:** Medium (2 days including backfill) · **Priority: P0**
> **Verify this first.** `grep -rn "player_id" src/models/Pick* src/db/migrations/*pick*` — the answer determines whether G7 is a migration or a non-issue, and it changes the shape of G4's cascade.

### G8 — Entry tags dropped
**Current:** Numeric seeds only; no `Q`/`WC`/`PR`/`LL` anywhere (§3.5).
**Required:** Union-type parse into `seed_number` + `entry_tag`; `/seeds` ingested; tags rendered.
**Affected:** ⟨seed parser, bracket UI, i18n strings⟩
**Risk: MEDIUM** — visibly wrong to any tennis fan; qualifier slots become confusing.
**Complexity:** Low (1 day) · **Priority: P1**

### G9 — Byes not modelled
**Current:** No representation.
**Required:** Slot state, auto-advance at import, excluded from picks and scoring (§7.4).
**Risk: MEDIUM** — low for the slam event singles main draw (no byes at 128), **high for Masters event-class 96-draws** and for junior/qualifying events already on the calendar.
**Complexity:** Low (1 day) · **Priority: P1**

### G10 — No coverage fallback
**Current:** None. Provider states live coverage is not guaranteed at Challenger/ITF (PDF §8).
**Required:** `no_live_coverage` state + REST polling (§13 F5).
**Risk: MEDIUM** for the slam event itself, **HIGH** for the ~180 ITF/Challenger events that make up most of the calendar.
**Complexity:** Low (1 day, once G5 exists) · **Priority: P1**

### G11 — No adaptive draw polling
**Current:** None. No SLA on publication (PDF §9), so a fixed slow interval risks opening picks hours late.
**Required:** §11.4 schedule with priority queue.
**Risk: MEDIUM-HIGH** — entry-lock times are already published to users; a late-detected draw compresses their picking window.
**Complexity:** Low (1 day, part of G4) · **Priority: P0** (bundled with G4)

### G12 — No rate-limit strategy
**Current:** Unknown; likely none.
**Required:** Shared token bucket, jitter, priority shedding that never sheds slam draw polls (§13 F6).
**Risk: MEDIUM** — the new pollers materially increase call volume; being throttled during the draw ceremony is the worst possible moment.
**Complexity:** Low (1 day) · **Priority: P1**

### G13 — Surface metadata not ingested
**Current:** Every tournament renders `Hard`, including clay events (D1).
**Risk: LOW** for the slam event (hard court). Site-wide credibility cost.
**Complexity:** Trivial (2 hours) · **Priority: P2**

### G14 — No test coverage on the bracket path
**Current:** Inferred absent (§3.13); §2.3 survived to production.
**Required:** §17, with E2E-1 as the gate.
**Risk: HIGH** — without it, none of the above fixes can be trusted under change.
**Complexity:** Medium (3 days, parallelisable) · **Priority: P1**

### G15 — Cosmetic defects
D2 (counter mismatch), D4 (entry CTA on a complete tournament). **Risk: LOW** · Trivial · **P2**

### Gap summary

| Priority | Gaps | Est. days (serial) |
|---|---|---|
| **P0** | G1, G2, G3, G4, G5, G6, G7, G11 | ~18 |
| **P1** | G8, G9, G10, G12, G14 | ~7 |
| **P2** | G13, G15 | ~0.5 |

18 serial P0 days against 14 calendar days. **This does not fit one engineer.** It fits two working in parallel along the split in §20 — G1/G2/G3/G7 (the draw-and-settlement spine) on one track, G4/G5/G6/G11 (the live-and-sync services) on the other, since the second track depends on the first only at the `bracket_nodes` schema boundary. **Land the schema on day one and the two tracks decouple.**

---

## 20. Final engineering roadmap

### P0 — Launch blockers (days 1–8, two parallel tracks)

**Track A — Draw & settlement spine**

**P0.1 — Bracket schema**
*Objective:* `draw_slots`, `bracket_nodes`, `draw_revisions`, `event_map`, `picks.chosen_slot`.
*Reason:* Everything else depends on it; landing it first decouples both tracks.
*Modules:* `db/migrations`, `lib/bracket/math`. *Dependencies:* none. *Complexity:* Medium (1–2d).
*Outcome:* Both tracks proceed independently. **Day 1, non-negotiable.**

**P0.2 — Draw Import Service (G1, G2)**
*Objective:* Import, validate, persist `/draws` + `/seeds`; retire local generation.
*Reason:* `/draws` is the canonical bracket source (PDF §1–2); fixture-derived brackets vanish in play (§2.1).
*Modules:* `services/matchstat/drawClient`, `services/drawImport`, bracket read model. *Depends:* P0.1. *Complexity:* High (4d).
*Outcome:* Correct, complete, durable brackets — including for in-play tournaments.

**P0.3 — Slot-based picks (G7)**
*Objective:* Migrate picks to `(node_id, chosen_slot)`; backfill open tournaments.
*Reason:* Replacements are silent ID swaps (PDF §3); player-keyed picks corrupt silently.
*Modules:* `models/Pick`, entry flow, scoring, migrations. *Depends:* P0.1. *Complexity:* Medium (2d).
*Outcome:* Replacements become harmless by construction.

**P0.4 — Settlement rebuild (G3)**
*Objective:* Round-ordered, idempotent, REST-authoritative settlement with parent-node advancement.
*Reason:* §2.3 — a completed tournament shows 62 unplayed matches.
*Modules:* `services/settlement`, `workers/settlementWorker`, standings. *Depends:* P0.2, P0.3. *Complexity:* High (3–5d, wide error bar).
*Outcome:* Winners advance; picks score; standings move. The product's core loop works.

**Track B — Live & sync services**

**P0.5 — Draw Refresh Worker (G4, G11)**
*Objective:* Adaptive polling, revision hashing, diff classification, cascade, notifications.
*Reason:* No replacement events and no publication SLA (PDF §3, §9).
*Modules:* `workers/drawRefreshWorker`, `services/drawImport`. *Depends:* P0.2. *Complexity:* Medium (3d).
*Outcome:* Draws detected within 120s; every LL/replacement classified and surfaced.

**P0.6 — Event Mapping Service (G5)**
*Objective:* Five-step resolution ladder, split TTLs, durable `event_map`, confidence propagation.
*Reason:* Fixture IDs ≠ event IDs; failure is silent (PDF §5).
*Modules:* `services/eventMapping`, `services/matchstat/extendClient`. *Depends:* P0.1. *Complexity:* Medium (3d).
*Outcome:* Live subscriptions actually deliver messages, and misses degrade instead of disappearing.

**P0.7 — Live Session + reconciliation (G6)**
*Objective:* Single-connection socket manager, subscription reconciler, blocking reconcile-then-resume.
*Reason:* No replay after disconnect (PDF §7).
*Modules:* `services/liveSession`, `services/reconciliation`. *Depends:* P0.6. *Complexity:* Medium (2–3d).
*Outcome:* Disconnects are survivable and invisible in the final data.

### P1 — Strongly recommended (days 9–12)

| Item | Objective | Depends | Complexity | Outcome |
|---|---|---|---|---|
| **P1.1** Entry tags (G8) | Union-type seed parse; `/seeds`; render `Q`/`WC`/`PR`/`LL` | P0.2 | Low (1d) | Brackets read correctly to tennis fans |
| **P1.2** Byes (G9) | Slot state + auto-advance + unpickable | P0.2 | Low (1d) | Correct for 96-draws, juniors, qualifying |
| **P1.3** Coverage fallback (G10) | `no_live_coverage` + REST polling | P0.6 | Low (1d) | ~180 ITF/CH events behave sanely |
| **P1.4** Rate limiting (G12) | Token bucket, jitter, priority shedding | P0.5 | Low (1d) | Slam polls never throttled away |
| **P1.5** Test suite (G14) | §17.1–17.3, E2E-1 as gate | all P0 | Medium (3d) | The fixes stay fixed |

### P2 — Post-launch (September)

Historical settlement backfill (§14.4) · surface metadata (G13) · cosmetic fixes (G15) · draw revision audit UI for ops · mapping warmup worker · live-latency dashboard.

### P3 — Future

Doubles · juniors · qualifying brackets as a surface · richer live data if Extend exposes it · predictive standings · public bracket-integrity API.

### Sequencing

```
 Day  1    2    3    4    5    6    7    8    9   10   11   12   13   14
      │
 A  ┌─P0.1─┐
    │      └──── P0.2 Draw Import ────┐
    │                                  └── P0.4 Settlement ──┐
    │           └── P0.3 Slot picks ──┘                       │
 B  │      ┌──── P0.6 Event Mapping ──┐                       │
    │      │                           └── P0.7 Live+Reconcile┤
    │      └──────── P0.5 Draw Refresh Worker ────────────────┤
                                                              │
 P1                                          ├── P1.1 … P1.5 ─┤
                                                              │
 QA                                              ├─ E2E + manual draw diff ─┤
                                                                            │
                                                        SLAM DRAW ──────────┤ (~29 Aug)
                                                        MAIN DRAW BEGINS ───┤ 31 Aug
```

Two days of genuine slack. Spend them on §17.4 manual verification, not on scope.

---

## 21. Open questions for Matchstat

Send these today — answers may change P0 estimates.

1. **Draw completeness signal.** Is there a field or status indicating a draw is fully published versus partially released? Our validation currently infers this from `draw` contiguity (§7.7), which is a heuristic.
2. **Qualifier placeholders.** When the main draw publishes before qualifying concludes, do `Q` slots carry a null player ID, a placeholder ID, or a provisional real ID? This determines whether §11.3 sees `QUALIFIER_NAMED` or a `REPLACEMENT`.
3. **Doubles and qualifying draws.** How are these disambiguated — separate tournament IDs, or a draw-type parameter on `/draws`?
4. **`event/get` parameters.** Exact accepted parameter set and matching semantics — this is the highest rung of our mapping ladder (§9.3).
5. **Rate limits.** Documented request ceilings per endpoint, and whether `ETag`/`If-Modified-Since` are honoured on `/draws` (materially reduces our poll cost).
6. **`ws-token` TTL** and the recommended refresh strategy.
7. **Historical draws.** Are draws for completed tournaments retrievable? Determines whether the §14.4 backfill is possible.
8. **Coverage manifest.** Is there any endpoint listing which tournaments have live coverage, so we can pre-emptively mark `no_live_coverage` instead of discovering it by timeout (§13 F5)?

---

## 22. Appendix — verification commands

Run these first. Each answers a question this manual had to infer; each takes under a minute; together they convert §3 and §19 from hypothesis to fact.

```bash
# 1. Does a bracket table exist?                    → G1 confirmation
grep -rn "draw_slot\|bracket_node\|bracket" src/db/ src/models/ | head -20

# 2. Are picks keyed on player or slot?             → G7, the highest-value check
grep -rn "player_id\|playerId" src/models/Pick* src/db/migrations/*pick* 2>/dev/null

# 3. Is there local draw generation?                → G2
grep -rn "generateDraw\|buildBracket\|seedPosition\|byePosition" src/

# 4. Is the Draw API called at all?                 → G1
grep -rn "/draws\|/seeds" src/

# 5. Does any socket code exist?                    → G5, G6, D3
grep -rn "socket.io-client\|ws-token\|join-event\|join-live-events-all" src/

# 6. Are entry tags parsed?                         → G8
grep -rn "seed1\|seed2\|parseSeed\|'LL'\|\"WC\"" src/

# 7. How does settlement work today?                → G3, and the R1 estimate
grep -rn "settle\|advanceWinner\|scoreBracket\|winner" src/services src/workers | head -30

# 8. What workers exist?                            → §16.2 sizing
ls -1 src/workers src/jobs 2>/dev/null; grep -n "bullmq\|node-cron\|agenda" package.json

# 9. What test coverage exists on the bracket path? → G14
grep -rln "bracket\|draw" test/ __tests__/ src/**/*.test.* 2>/dev/null
```

**If check #2 shows picks keyed on `player_id`, escalate immediately.** That is the difference between a clean launch and silently corrupting user brackets on the first lucky loser — and it is the one defect users will never forgive, because it looks correct right up until standings are wrong.

---

*Document ends. §1, §3, §19 and §20 should be regenerated once the repository is available; §4–§18 are design work and should survive that regeneration substantially intact.*
