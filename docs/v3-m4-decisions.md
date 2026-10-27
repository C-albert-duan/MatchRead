# V3 Milestone 4 decisions

**Date:** 2026-10-26. **Basis:** `main` @ `2756218` (migration head `0043`, pgTAP up to `48`).
Each decision applies the recommended default from the remaining-work plan (Phase 2). Revisit a decision here before changing code that depends on it.

## D-M4-1 Point flags: ship without them on real data

REST live rows carry neither sets-to-win nor a server id, so `live-normalize.js` sets `pointFlags: null` (see `provider-capture-findings.md`). M4 ships with that as it stands.

- `reasonsFor` emits `kind: "flag"` only when the caller passes `pointFlags`. Replay and tests can do that; real ingest cannot yet.
- `classify` returns `critical` only for a `flag` reason, so `critical` is unreachable on real data. That is the intended degraded mode, not a bug.
- Revisit when a socket feed (MEGA decision) or a reliable server indicator exists. Persisting flags would then be migration `0044_live_point_flags.sql`.

## D-M4-2 The Stage lives on `/me`

A new authenticated Server Component route, `/me` ("My Tennis"), lists matches in tournaments where the user has a bracket. Signed-out users are redirected to sign-in. The Stage never renders on `/enter/[ref]` or `/leagues/[slug]/t/[ref]/bracket`.

## D-M4-3 Ceiling uses the product's real weights

`POINTS = { R16: 40, QF: 80, SF: 160, F: 320 }` from the prototype is **not** used. `ceiling.ts` uses `roundWeight(r) = 2^r` and the champion bonus from `grade.ts`, so at full settlement `banked` equals `gradeBracket(...).score`, and on an untouched complete bracket `ceiling` equals `maxBracketScore(drawSize)`.

Elimination is derived from each player's seat path: a player is out once any match on their path has a different official winner. `gradeBracket().upside` is **not** reused for the Ceiling. When M4 was built, its `computeAlive` treated a player who had not yet won a match as not alive, so `upside` could rise when that player won their first match, which would break invariant I2. F-3 later made `upside` a true remaining maximum (`knownEliminated`); it now equals Ceiling minus Banked on every replayed step, but the Ceiling keeps its own seat-path code, which also handles live leads.

## D-M4-4 Reason kinds this repo can feed

| kind | Source | Status |
|---|---|---|
| `flag` | `pointFlags` | Replay only (D-M4-1) |
| `champion` | the user's final pick | Yes |
| `forward` | the user's picks at or after this round naming either entrant | Yes |
| `future` | the user's pick for the sibling match (the parent's other feeder) | Yes |
| `alone` | league pick aggregate, passed in by the server | When the caller supplies it |
| `consensus` / `contrarian` | MatchRead-wide pick share, passed in by the server | When the caller supplies it |
| `swing` | projected standings | Deferred (Handoff Phase 3) |
| `daily` | Daily Picks | N/A in this repo (mobile only) |

A missing input means that kind is never emitted. `reasonsFor` never guesses one.

## D-M4-5 `MATTERS_FLOOR = 5` filters the list, not the Stage

`matters()` keeps a match whose top reason has `prio <= 5`. A plain scheduled pick (`forward`, prio 6) therefore does not appear in the My Tennis list. The `morning` and `next` Stage countdowns still use every candidate match the user has a pick on, so "the next thing of yours" is never hidden by the floor.

## D-M4-6 D6, the settlement latch

There is no `apply_bracket_state`. `mergeSettledFact` plus `claim_settlement` keep the first official winner, and a later differing winner is logged as `ops_events.name = 'winner_conflict'`. `ceilingMaths` reads only `matches.winner_player_id` (the latched value). `/founder/integrity` will show the conflict count; users see nothing.

## D-M4-7 `ImportanceConfig` storage

Defaults live in `packages/core/src/live/importance.ts` (`criticalAtOrBelow: 0`, `importantAtOrBelow: 2`). The server overrides them from a single-row `app_config` table (key `importance`, `jsonb`, 60 s cache), added in migration `0044`. Writes are service role only: the web holds the anon key and founder access is an app-level gate, so a founder retunes it from the SQL editor or a script. A missing or malformed row falls back to the defaults.

## D-M4-8 D5, the Realtime connection ceiling

**Open.** Read the concurrent-connection limit for the Supabase plan from the dashboard and record it here before any load test. `/me` opens one channel per tournament in which the user holds a bracket.

## D-M4-9 Forward exposure is an index, not a table

The plan's `bracket_forward_exposure (match_id, bracket_id, forward_node_id, pts)` is keyed by the live match. Later-round entrants are unknown at lock, so that table cannot be filled correctly at lock time. Picks are already per match and fixed after lock, so "which forward picks are lost if player X loses" is the picks naming X. Migration `0044` adds `picks (player_id, bracket_id)` for that read, and `ceilingDeltaIfLost` computes points from the user's own picks. Cross-user fan-out ("everyone exposed to this match", needed for Pulse and `urgent`) reads the same index.

## D-M4-10 `stage_events` and founder tiles

Migration `0045` adds `stage_events` (own-row insert and read) and `stage_event_rates(since)`, which returns aggregates only. `/founder/integrity` shows Stage changes in the last 24 h, the busiest user-hour (event mark above 2), and `winner_conflict` rows in the last 7 days (error mark at 1 or more). Both tiles read apart from the page's main load, so a database without `0045` shows "none" instead of failing.

## D-M4-11 Live re-ranking on `/me` is a throttled server refresh

M4.5 asks for live patches to re-sort My Tennis with the same core function in the browser. Ranking reads the user's picks, the draw's seats and the importance config; shipping those to the client would put every bracket the user holds into the page payload. Instead, the live layer announces each paint (`mr:live-paint`), and `LiveRerank` refreshes the page only when a patch changes what ranking reads from a live match: whether it is live, and who leads (`leader`, sets then games, the same core function). The server then runs `assembleMyTennis` on the new live row, so the list, the Stage and Projected follow it; score ticks that keep the leader patch in place. Refreshes are at least 5 s apart. The 45 s background refresh stays as the floor. `MyMatchList` still keeps rows below the top three from moving under the reader.
