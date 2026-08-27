# Module: Core (`packages/core`)

**Package:** `@matchread/core`  
**Role:** Zero-dependency domain rules shared by the web app and (via Edge copy) settlement. Pure functions — no I/O, no Supabase.

## Public surface

Export barrel: `packages/core/src/index.ts`.

| Area | Files | Responsibility |
|------|-------|----------------|
| Bracket topology | `bracket.ts` | Round structure, seat kinds, match keys, fiction guards, bye advances |
| Grading | `grade.ts`, `scoring.ts` | Grade picks vs official; round weights; champion bonus; rank |
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
| `settle-leagues` Edge | Deno cannot import the TS package; uses `supabase/functions/_shared/core.js` (kept in sync with grade/matchKey) |

## Boundaries

- Does **not** know about RapidAPI, env, or DB.
- Fiction detection (`isFictionalSeatName`, etc.) backs pure-fact UI/ingest checks.
- Eligibility policy must stay aligned with `is_bracket_product` in SQL (`0016`).

## Related

- Web usage: [web-app.md](./web-app.md)  
- Settle path: [../infrastructure/edge-functions.md](../infrastructure/edge-functions.md)  
- Data model: [../data-model.md](../data-model.md)
