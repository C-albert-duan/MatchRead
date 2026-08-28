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
| Official draw | Parse provider draw into seats (player / bye / TBD); hash for revisions; skip `qualifying`/`doubles` keys |
| Draw poll | Adaptive interval + force poll near `main_draw_starts_on` when unpublished |
| Overlay | Attach schedule/fixture ids onto official seats without inventing people |
| Reconcile | Pair-first bind results (rewrite stale `provider_match_id`); Shape B create/fill R0 from seats + archive; advance winners |
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
