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
3. Evaluate integrity → `draw_integrity_reports`.
4. On pass: `apply-draw` → players, seats, matches, schedule, optional `published_at`.
5. Reconcile results + live finished events → `apply-results`.
6. `claim_settlement` + parent advance; audit repair/ops.
7. `refresh_lock_at` when timed R0 exists.

Triggered by pg_cron (~5m), optional GitHub workflow, and ops scripts.

Cron/full runs (no `slug`) process at most ~10 events per invoke (published first) so the Edge call finishes before gateway idle timeout. Calendar upsert still covers the dual-tour window every run.

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
