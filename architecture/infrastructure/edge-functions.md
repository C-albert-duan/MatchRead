# Infrastructure: Edge functions

**Path:** `supabase/functions/`  
**Role:** Privileged ingest and batch settlement. Not called with service role from the web app.

Auth pattern: `Authorization: Bearer <INGEST_SECRET>` (functions typically deployed with JWT verify disabled for this custom secret).

## Functions

### `sync-facts`

**File:** `sync-facts/index.ts`

Pipeline:

1. Upsert calendar from RapidAPI (via `@matchread/provider-rapidapi`).
   - Writes provider week into `starts_on` only.
   - Preserves existing `main_draw_starts_on` (and known product overrides); never copies week banner into it on every run.
2. Resolve official seats / overlay schedule.
3. Evaluate integrity (incl. `classifyDraw` / draw-type) → `draw_integrity_reports` **before** any seat wipe.
4. On pass: `apply-draw` → players, seats, matches, schedule, `published_at`.
   On fail unpublished: write report only — no seats left for public render.
   On fail when already published: keep the live sheet; ops `refresh_blocked_keep_published`; never clear `published_at`.
5. Reconcile results + live finished events → `apply-results`.
6. Durable `matches` update first, then `claim_settlement`, then parent advance; audit repair/ops.
7. `refresh_lock_at` when timed R0 exists.

Triggered by pg_cron (~5m), optional GitHub workflow, and ops scripts.

Cron/full runs (no `slug`) process at most ~10 events per invoke so the Edge call finishes before gateway idle timeout. Bracket-eligible in-play events are capped under that budget with a **5-minute sticky rotation** and a split between unpublished (draw) and published (results) so one Slam cannot starve the other. Remaining slots go to near-window events (unpublished preferred). Calendar upsert still covers the dual-tour window every run.

Bye auto-settle on R0 write must advance the winner into the parent side; `apply-results` also heals missing parent advances before binding new results.

Draw poll: adaptive interval via `shouldPollDraw`, with a **force poll** for unpublished events within ~5 days before / 2 days after main-draw day.

Publish: migration `0019` fixes `assert_publish_requires_integrity` to call `is_bracket_product(tour, tier, product_override)` — `NEW.bracket_eligible` is null in the `BEFORE UPDATE OF published_at` trigger context even when the stored column reads true.

Results reconcile:

1. Pair-first bind archive rows → existing topology (`bindResultsByPlayerPair`: player pair before `provider_match_id`; rewrite stale/synthetic ids).
2. **Shape B:** unbound finished results whose players occupy an adjacent official seat pair → create or fill the R0 match, then settle (`proposeShapeBRepairs`). Never invent slots without seats. Never overwrite a settled conflicting winner.
3. Audit remaining unbound/orphans to `ops_events` / `sync_repairs`.

### `settle-leagues`

**File:** `settle-leagues/index.ts`

1. Load submitted brackets for events with settled matches.
2. Grade with Edge `core.js` (mirror of `@matchread/core` grade).
3. Write `brackets.points` / `rank`.

Triggered by cron (~15m). Commissioner/founder can also settle in-process via web `actions/settlement.ts`.

## Shared modules

| File | Role |
|------|------|
| `_shared/apply-draw.ts` | Persist official field |
| `_shared/apply-results.ts` | Winners, voids, claims, advances |
| `_shared/rapidapi.js` | Provider package facade |
| `_shared/core.js` | Edge-safe grade / matchKey |

`import_map.json` maps workspace packages for Deno.

## Boundaries

- Only path that should **write tennis facts** in normal operation.
- Must not invent seats or lock times; integrity gate blocks weak publishes (0017).
- Web remains anon/RPC-only.

## Related

- Provider module: [../modules/provider-rapidapi.md](../modules/provider-rapidapi.md)  
- Flow A/D: [../data-flows.md](../data-flows.md)  
- Cron/schema: [supabase.md](./supabase.md)
