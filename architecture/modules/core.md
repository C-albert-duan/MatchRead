# Module: Core (`packages/core`)

**Package:** `@matchread/core`  
**Role:** Zero-dependency domain rules shared by the web app and (via Edge copy) settlement. Pure functions — no I/O, no Supabase.

## Public surface

Export barrel: `packages/core/src/index.ts`.

| Area | Files | Responsibility |
|------|-------|----------------|
| Bracket topology | `bracket.ts` | Round structure, seat kinds, match keys, fiction guards, bye advances |
| Grading | `grade.ts`, `scoring.ts` | Grade picks vs official; round weights; champion bonus; rank |
| Live brand | `live-trust.ts` | `LiveOnly<T>` is not assignable to an authoritative official result |
| Live state | `live/state.ts`, `live/normalize.ts`, `live/point-flag.ts` | Canonical phase, sets, game points, serving side, and the phase flag. `derivePointFlags` reads side-oriented sets, the current game, serving, and sets-to-win. It returns a break point and a match point, or null. An unoriented score, a malformed game, a format other than sets-to-win 2 or 3, a 6-6 set, or a missing server on a break point is null. It does not read a provider label |
| Daily Check | `pulse.ts` | Narrative pulse from standings/results |
| Engagement | `engagement.ts` | Bracket health / highlights |
| Eligibility | `eligibility.ts` | `PUBLIC_TIERS` + `isBracketProduct` (mirrors SQL) |
| Lock soundness | `tournament/lock.ts` | Assert lock is from real timed fixtures — no invented midnight |
| Perf notes | `perf-notes.ts` | Slam score constants (128-draw max 512) |

## Scoring model (summary)

- Round weight doubles from 1 each round.
- Naming the champion pays the final weight again.
- A 128-draw tops out at **512** points (`verify-settlement-math` CI script).

## Consumers

| Consumer | How |
|----------|-----|
| `apps/web` | Direct workspace import for grading UI, Daily Check, eligibility helpers |
| `settle-leagues` Edge | Deno cannot import the TS package from the npm registry (`npm:@matchread/core@^0.1.0` is unpublished). Uses `supabase/functions/_shared/core.js`, kept in sync by `edge-grade.test.ts` |

## Boundaries

- Does **not** know about RapidAPI, env, or DB. `live/normalize.ts` takes a `LiveStateDraft` of plain strings. It does not read provider field names or call a client. `receivedAt` and `occurredAt` are the only timestamps, and both are supplied by the caller. The function does not call `Date.now`. The provider adapter reads the captured frame and resolves sides, then `projectLiveFrame` and `normalizeCapturedFrame` call `normalizeLiveMatchState` for the canonical sets, game, flag, and phase.
- `gradeBracket`, `detailBracketGrade`, and `computeAlive` take `Authoritative<OfficialResults>`. A `LiveOnly` value is not accepted. The live pipeline does not cast to `OfficialResult`.
- Fiction detection (`isFictionalSeatName`, etc.) backs pure-fact UI/ingest checks.
- Eligibility policy must stay aligned with `is_bracket_product` in SQL (`0016`).

## Related

- Web usage: [web-app.md](./web-app.md)  
- Settle path: [../infrastructure/edge-functions.md](../infrastructure/edge-functions.md)  
- Data model: [../data-model.md](../data-model.md)
