# Module: Provider RapidAPI (`packages/provider-rapidapi`)

**Package:** `@matchread/provider-rapidapi`  
**Role:** Tennis API client and fact pipeline helpers — normalize, official draw parse/overlay, reconcile results, live session helpers.

**Not used by the web app.** Consumed by Edge `sync-facts` and ops scripts.

## Architecture

```text
HTTP client (index.js)
  calendar / fixtures / results / draw / seeds / live
        │
        ├─ normalize.js + assert.js     tour/tier/surface/name; fail closed
        ├─ official/classify-draw.js    main_singles vs qualifying/doubles
        ├─ official/*                   parse, hash, diff, overlay fixtures
        ├─ reconcile-provider.js        results → match keys / advances
        ├─ live.js + live-session.js    live events → ingest shape
        └─ event-mapper.js              fixture pair → socket event id
```

## Key responsibilities

| Concern | Behavior |
|---------|----------|
| Calendar | Dual-tour ATP/WTA events → canonical tournament rows |
| Draw type | `classifyDraw`: provider/path type → terminal (slam qual=16) → seeds → size last. Size alone never selects. |
| Official draw | Parse provider draw into seats (player / bye / TBD). `Unknown Player` (id 3700) is **not** a bye on name/id: match `result === "bye"` → bye; empty `result` → TBD. JSON `null` / omitted side (consumed placeholder) opposite a named player → bye, never TBD. Explicit `"Bye"` / `"Qualifier"` strings still map. Slot order from the draw; skip `qualifying`/`doubles` keys. No size/slug branch. |
| Draw poll | Adaptive interval + force poll near `main_draw_starts_on` when unpublished |
| Overlay | Attach schedule/fixture ids onto official seats; preserve `display_name` / given names (never invent people). Published overlay rewrites `bye → tbd` (`bye_to_tbd`) and unwinds the invented R0 bye-advance when the parent is not a played match |
| Draw name lookup | `drawNameCandidates` derives Mega-draw search strings from `api_name` / `name` / slug (dash-split, strip Open, US/U.S. spelling). No hard-coded event list. |
| Integrity | Duplicate last names allowed when provider ids or given names differ. Bye count vs official slot field: at most `N/8` on 16/32-slot sheets (28-in-32 = 4) and `N/4` on 64/128-slot sheets (96-in-128 = 32). TBD seats are occupants, not byes. Bye-versus-bye in a first-round pair is impossible. |
| Reconcile | Pair-first bind results (rewrite stale `provider_match_id`). Exactly one occupant-compatible later-round one-sided hole binds; R0 is not a partial target; a different canonical `provider_match_id` excludes that hole; zero candidates stay unbound; two valid later-round holes fail closed. `planArchiveResults` optionally keeps only `providerMatchIds` before bind, id-map, provider-id updates, and Shape B; a missing list plans every archive row. Advance winners via `applyMatchResults` → `writeWinnerIntoParent` / `healSettledAdvances` |
| Live | Subscribe / poll finished events into the same apply-results path |

## Edge wiring

- `supabase/functions/_shared/rapidapi.js` re-exports this package.
- `supabase/functions/import_map.json` maps `@matchread/provider-rapidapi` → package source for Deno.

## Boundaries

- Fail **closed** on unknown tiers/surfaces/fiction — never invent seats or names.
- Qualifying *draws* are rejected (same size as Slam main is not enough). Qualifier *seats in the main draw* (Q/LL TBD) are shown.
- Official TBD (Q/LL) and published byes are valid seats; qualifying *matches* are ignored.
- Ops entrypoints: `scripts/publish-draws.mjs`, `reconcile-results.mjs`, `probe-*.mjs`, `tennis-verify.mjs`.

## Related

- Ingest flow: [../data-flows.md](../data-flows.md) A  
- Edge: [../infrastructure/edge-functions.md](../infrastructure/edge-functions.md)  
- Ops: [../infrastructure/ops-scripts.md](../infrastructure/ops-scripts.md)
