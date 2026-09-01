# Project cleanup plan

**Goal:** Clear ownership, one source of truth for how the system works, and less drift between docs, scripts, CI, and code — without changing product behavior.

**Status:** Plan only (not executed).  
**Last reviewed:** 2026-09-01

---

## How to use this doc

| If you want to… | Do this |
|-----------------|---------|
| Understand who owns what today | [Ownership map](#ownership-map-today) |
| See what is wrong or stale | [Gaps and inconsistencies](#gaps-and-inconsistencies) |
| Know the end state | [Target structure](#target-structure) |
| Execute work | [Phased plan](#phased-plan) (P0 → P2) |

When a phase completes, update the matching `architecture/` files in the same PR (per `.cursor/rules/architecture-docs.mdc`).

---

## Executive summary

The **physical monorepo is sound**: one app (`apps/web`), four packages, hosted Supabase, two Edge functions, ops scripts, and an `architecture/` folder that mostly matches reality.

The debt is **organizational**, not architectural:

1. **Docs vs CI** — architecture claims checks that CI does not run.
2. **Legacy names** — historical `ingest-events`, `rebuild-draw`, `sync-tennis` references were scrubbed from env examples, CI, Cursor rules, and log strings (2026-09-01); runtime is **`sync-facts`** only.
3. **Two doc worlds** — `architecture/` (runtime truth) vs untracked `discussion/` (design history, some obsolete).
4. **Missing indexes** — no ownership for Edge `_shared/core.js`, E2E live scripts, founder ops, or `discussion/`.
5. **Test gaps** — strong provider tests; weak core grading tests; no Edge tests; pgTAP not in CI.

Fix P0 first (trust boundaries + env/onboarding). P1 is discoverability. P2 is hygiene.

---

## Ownership map (today)

### Product surface

| Area | Path | Owns | Documented in |
|------|------|------|---------------|
| Web UI + server actions | `apps/web` | Routes, bracket editor, leagues, auth session, anon Supabase client | [modules/web-app.md](./modules/web-app.md) |
| Domain rules (pure) | `packages/core` | Bracket topology, grading, lock/eligibility, Daily Check | [modules/core.md](./modules/core.md) |
| Tennis API + reconcile | `packages/provider-rapidapi` | Client, draw parse, pair-bind, Shape B | [modules/provider-rapidapi.md](./modules/provider-rapidapi.md) |
| Copy | `packages/i18n` | `en` / `es` / `ja` strings | [modules/i18n.md](./modules/i18n.md) |
| Visual tokens | `packages/tokens` | CSS/token exports | [modules/tokens.md](./modules/tokens.md) |

**Rule (enforced in code, weakly in CI):** web never imports `provider-rapidapi`. Provider never ships to the browser.

### Platform / facts

| Area | Path | Owns | Documented in |
|------|------|------|---------------|
| Schema + RLS + RPCs | `supabase/migrations/0001`–`0020` | Postgres truth | [data-model.md](./data-model.md), [infrastructure/supabase.md](./infrastructure/supabase.md) |
| Ingest + reconcile | `supabase/functions/sync-facts` | Calendar, draw apply, results, cron path | [data-flows.md](./data-flows.md), [infrastructure/edge-functions.md](./infrastructure/edge-functions.md) |
| Settlement batch | `supabase/functions/settle-leagues` | Grade submitted brackets | [edge-functions.md](./infrastructure/edge-functions.md) |
| Shared apply logic | `supabase/functions/_shared/` | `apply-draw`, `apply-results`, `core.js` (Edge copy) | Partial — **gap** |
| Ops / probes | `scripts/` | Publish, reconcile, trust preflight, E2E live | [infrastructure/ops-scripts.md](./infrastructure/ops-scripts.md) |

### Not runtime (needs a policy)

| Area | Path | Role today | Problem |
|------|------|------------|---------|
| Design archive | `discussion/` | Sprint PDFs, HTML exports, pre-implementation specs | Untracked, overlaps `architecture/`, references removed modules (`ingest-events`, workers) |
| Archive migrations | `supabase/migrations/archive/` | Historical chain | No README; easy to confuse with live `0001`–`0020` |

---

## Gaps and inconsistencies

### A. Documentation drift (architecture says X, repo does Y)

| Issue | Where claimed | Actual state | Fix |
|-------|---------------|--------------|-----|
| Consumer boundary in CI | [ci-and-deploy.md](./infrastructure/ci-and-deploy.md) L22 | `.github/workflows/ci.yml` does **not** run `ci:consumer-boundary` | Add step or fix doc |
| Live migrations `0001`–`0017` | [ci-and-deploy.md](./infrastructure/ci-and-deploy.md) L33 | Live chain is **`0001`–`0020`** (incl. `0018`, `0019`, `0020`) | Update doc |
| Missing `docs/` tree | `.env.example`, `.env.docker.example` | Paths like `docs/DOCKER.md` **do not exist** | Point to `architecture/infrastructure/*.md` |
| Auth redirect port | `supabase/config.toml` (`localhost:3000`) | App/Docker default **3001** | Align config or document exception |

### B. Legacy naming (rename mentally to `sync-facts`)

| Stale term | Still appears in | Canonical |
|------------|------------------|-----------|
| `rebuild-draw` | `.cursor/rules/publish-complete-draw.mdc` | `sync-facts` via `scripts/publish-draws.mjs` |
| `ingest-events` | `.env.provider.example`, reconcile banner, sync-facts logs | `sync-facts` |
| `sync-tennis` | `.github/workflows/sync-tennis.yml` filename | Workflow body is correct; filename is legacy |
| `apps/worker` | `.env.provider.example` | **No worker app** in repo |

Scripts already rewrite legacy URLs (`publish-draws.mjs`, `reconcile-results.mjs`). User-facing docs and examples have not caught up.

### C. `discussion/` vs `architecture/`

- **20 untracked files** under `discussion/` (PDF, HTML, ZIP, MD).
- Topics (draw automation, reconciliation, US Open repair) are **largely implemented** in `sync-facts`, provider package, and migrations `0013`–`0020`.
- Remaining references to **MatchStat**, **BullMQ workers**, **`settle-slate`**, **`ingest-events`** are design history, not runtime.
- Risk: future readers treat `discussion/` as spec and re-implement obsolete paths.

**Policy needed:** `architecture/` = truth; `discussion/` = archive with index and “superseded by …” links.

### D. Undocumented ownership

| Topic | Why it matters |
|-------|----------------|
| `supabase/functions/_shared/core.js` | Duplicate of `packages/core` for Deno; no checklist when changing bracket/grade logic |
| `scripts/e2e-live-*` + Playwright live specs | Production checklist; env vars not in [environment.md](./infrastructure/environment.md) |
| `apps/web/app/founder/*` | Ops/disruption surfaces; only mentioned in passing |
| `apply-draw` published-sheet guard (prune extra R0, schedule-only announced upserts) | Recently shipped; partially in data-flows — needs a short **invariants** subsection in edge-functions |
| pgTAP `supabase/tests/` | 7+ SQL tests; `test:db` exists but not CI |

### E. Test coverage gaps (maintenance risk)

| Layer | Covered | Thin / missing |
|-------|---------|----------------|
| `provider-rapidapi` | normalize, classify, reconcile, map, architecture | `live.js`, full `parse-draw` edge cases |
| `core` | bracket, pulse, lock | **`grade.ts`, `scoring.ts`, `eligibility.ts`** |
| `web` | calendar, leagues, href helpers | server actions, components, middleware |
| Edge | — | **`apply-draw`, `apply-results`, sync-facts orchestration** |
| E2E | live-checklist (manual, secrets) | not in CI (acceptable if documented as manual gate) |

### F. npm scripts vs scripts folder

All 16 scripts are listed in [ops-scripts.md](./infrastructure/ops-scripts.md). Root `package.json` wires 11; not wired at root (by design or oversight):

- `e2e-live-pipeline.mjs`, `e2e-live-run-auth.mjs`, `e2e-live-setup.sql`, `e2e-live-cleanup.sql`
- `backfill-settle-advance.mjs`, `docker-migrate.mjs`, `apply-sql-migration.mjs`

Either add thin npm aliases or document “Compose / manual only” explicitly.

---

## Target structure

```text
mh-2/
├── README.md                         → onboarding; links architecture/README.md
├── architecture/                     ← SINGLE source of runtime truth
│   ├── README.md                     (+ link to cleanup-plan.md)
│   ├── overview.md, data-flows.md, data-model.md
│   ├── cleanup-plan.md               ← this file (living checklist)
│   ├── modules/                      (one doc per package/app)
│   └── infrastructure/               (DB, Edge, CI, env, ops)
├── discussion/                       ← design archive ONLY
│   ├── README.md                     index + superseded-by links
│   └── YYYY-MM-topic/*.md            (prefer MD; binaries optional/external)
├── apps/web/
├── packages/{core,provider-rapidapi,i18n,tokens}/
├── supabase/
│   ├── migrations/0001–00NN          live chain only
│   ├── migrations/archive/README.md  “never apply”
│   ├── functions/
│   └── tests/
├── scripts/                          (+ optional scripts/README.md one-pager)
└── .github/workflows/
    ├── ci.yml                        includes consumer-boundary
    └── sync-facts.yml                (rename from sync-tennis.yml)
```

**Principles**

1. **One ingest name:** `sync-facts` everywhere user-facing.
2. **Architecture follows code** in the same PR as behavioral changes.
3. **Discussion does not drive implementation** without an architecture update first.
4. **CI enforces** documented trust boundaries (`public_calendar`, no provider in web).

---

## Phased plan

### P0 — Trust and onboarding (1–2 days)

Fix things that mislead operators or weaken the pure-fact boundary.

| # | Task | Owner | Files | Done when |
|---|------|-------|-------|-----------|
| P0-1 | Run `ci:consumer-boundary` in CI | Platform | `.github/workflows/ci.yml` | Fails PR if web imports provider or reads raw `tournaments` for calendar |
| P0-2 | Fix migration range in deploy doc | Platform | `architecture/infrastructure/ci-and-deploy.md` | Says `0001`–`0020` |
| P0-3 | Update `.env.provider.example` | Platform | `.env.provider.example` | Default URL is `/sync-facts`; worker vars removed or marked deprecated |
| P0-4 | Fix env example doc links | Platform | `.env.example`, `.env.docker.example` | All links point to `architecture/infrastructure/` |
| P0-5 | Fix publish Cursor rule | Product/platform | `.cursor/rules/publish-complete-draw.mdc` | References `publish:draws` → `sync-facts`, not `rebuild-draw` |
| P0-6 | Align local auth URL port | Platform | `supabase/config.toml` or architecture note | 3001 documented or config fixed |

### P1 — Ownership clarity (2–4 days)

Make it obvious where to change what.

| # | Task | Owner | Files | Done when |
|---|------|-------|-------|-----------|
| P1-1 | Root README points to architecture | Web/platform | `README.md` | Single “start here” path |
| P1-2 | `discussion/README.md` index | Product | `discussion/README.md` | Each artifact maps to architecture section or marked obsolete |
| P1-3 | Decide `discussion/` git policy | Team | `.gitignore` or commit MD-only | Policy written in discussion README |
| P1-4 | Edge `core.js` sync checklist | Platform | `architecture/infrastructure/edge-functions.md` | Doc: when changing `packages/core`, update `_shared/core.js` |
| P1-5 | Document apply-draw invariants | Platform | `edge-functions.md` | Published-sheet guard (no R0 side rewrite, prune extras) summarized |
| P1-6 | Extend environment.md | Platform | `environment.md` | E2E vars, `DATABASE_URL`, `WEB_PORT`, provider map file |
| P1-7 | Rename workflow file | Platform | `sync-tennis.yml` → `sync-facts.yml` | ci-and-deploy.md updated |
| P1-8 | Scrub log/banner strings | Platform | `sync-facts/index.ts`, `reconcile-results.mjs` | No user-facing `ingest-events` |
| P1-9 | Archive migrations README | Platform | `supabase/migrations/archive/README.md` | States “superseded; never apply on prod” |
| P1-10 | Optional: `scripts/README.md` | Platform | `scripts/README.md` | Table: script → npm alias → when to run |

### P2 — Hygiene and hardening (ongoing)

| # | Task | Owner | Notes |
|---|------|-------|-------|
| P2-1 | `discussion/` binary cleanup | Product | Keep one MD per topic; move PDF/ZIP out of repo or to releases |
| P2-2 | pgTAP in CI | Platform | Nightly or Supabase local service job running `npm run test:db` |
| P2-3 | Core unit tests | Core | `grade.ts`, `scoring.ts`, `eligibility.ts` |
| P2-4 | Edge helper tests | Platform | Extract testable pure helpers from `apply-draw` / `apply-results` |
| P2-5 | Lint story | Web | ESLint or document intentional no-op `lint` scripts |
| P2-6 | Normalize pgTAP filenames | Platform | Consistent numbering vs migration ids |
| P2-7 | Live E2E runbook | QA/ops | When to run live-checklist; required secrets; link from ops-scripts |

---

## Suggested execution order

```text
Week 1:  P0 (all) + P1-1, P1-2, P1-4, P1-5
Week 2:  P1 remainder
Backlog: P2 items as capacity allows
```

Do **not** mix P0 doc fixes with large refactors. Each PR should be reviewable in &lt; 30 minutes.

---

## Definition of done (whole cleanup)

- [x] New contributor can onboard from `README.md` → `architecture/README.md` without hitting dead links
- [x] CI matches what `ci-and-deploy.md` claims
- [x] No user-facing reference to `rebuild-draw` / `ingest-events` as live paths
- [x] `discussion/README.md` explains what is historical vs authoritative
- [x] Every path in [modules/README.md](./modules/README.md) has a clear “owns / does not own” boundary
- [x] Env examples match [environment.md](./infrastructure/environment.md)
- [x] Ops scripts discoverable from root README or `scripts/README.md`

### P0 — completed 2026-09-01

- [x] P0-1 Consumer boundary in CI
- [x] P0-2 Migration range `0001`–`0020` in ci-and-deploy
- [x] P0-3 `.env.provider.example` → sync-facts
- [x] P0-4 Env example doc links → architecture
- [x] P0-5 publish-complete-draw Cursor rule
- [x] P0-6 Auth redirect port 3001 in config.toml

### P1 — completed 2026-09-01

- [x] P1-1 Root README
- [x] P1-2 discussion/README.md
- [x] P1-3 Git policy in discussion README
- [x] P1-4 Edge core.js sync checklist
- [x] P1-5 apply-draw invariants in edge-functions
- [x] P1-6 environment.md extended
- [x] P1-7 sync-facts.yml workflow
- [x] P1-8 Log/banner strings
- [x] P1-9 Archive migrations README
- [x] P1-10 scripts/README.md

---

## Out of scope (explicit)

- Rewriting MatchStat / socket integration from `discussion/` (separate product decision)
- Adding an `apps/worker` service
- Merging archive migrations into live chain
- UI redesign or bracket feature work
- Deleting production data or force-republishing draws

---

## Appendix: live migration chain (reference)

Apply in order on production:

`0001_profiles` → `0002_tournaments_players_seats` → `0003_matches` → `0004_leagues` → `0005_brackets_picks` → `0006_rls_and_rpcs` → `0007_cron` → `0008_member_invite_rpcs` → `0009_sync_facts_cron` → `0010_tournaments_name_not_unique` → `0011_solo_league_display_name` → `0012_draw_revisions_event_map` → `0013_trust_boundary` → `0014_event_dates` → `0015_settlement_claims` → `0016_eligibility_and_public_calendar` → `0017_lock_write_proof` → `0018_restore_main_draw_dates` → `0019_publish_trigger_eligibility` → `0020_clear_misclassified_uso_wta_draw`

Archive under `supabase/migrations/archive/` is **not** part of this chain.

---

## Appendix: recent code not yet fully reflected in docs

When executing P1-5, ensure these are captured in `edge-functions.md` / `data-flows.md`:

- After `published_at` + full seat count: announced fixtures **schedule-only** on seat-aligned R0 (no side rewrite, no `index >= draw_size/2` appends)
- Prune extra R0 rows; refresh sides from seats each apply
- Shape B may **fill** when existing sides disagree with official seat pairs

(Partially documented in data-flows as of 2026-09-01; consolidate into edge-functions invariants.)
