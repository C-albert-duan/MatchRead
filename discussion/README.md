# Discussion archive

**Not runtime documentation.** For how the system works today, use [`architecture/`](../architecture/README.md).

This folder holds design notes, sprint directives, and HTML/PDF exports from product conversations (mostly Aug 2026). Treat as **historical context** — some paths referenced here (`ingest-events`, `rebuild-draw`, `apps/worker`, `settle-slate`) are **obsolete**; production uses **`sync-facts`** only.

## Git policy

- **Authoritative:** `architecture/` (update with code changes)
- **Archive:** `discussion/` — markdown may be committed for searchability; PDF/ZIP/HTML duplicates are optional (prefer not to bloat the repo)
- Do **not** implement from `discussion/` without confirming against `architecture/` and the codebase

## Index

| Artifact | Topic | Superseded by / status |
|----------|-------|------------------------|
| `8.20 MatchRead Updates/MatchRead-Data-Integrity-Playbook-v2.*` | Pure-fact integrity gates | [data-flows.md](../architecture/data-flows.md), [edge-functions.md](../architecture/infrastructure/edge-functions.md), migrations `0013`, `0017` |
| `8.24 MATCHREAD UPDATES/MatchRead-Draw-Automation-and-Reconciliation.md` | Draw automation + reconcile | Implemented: `sync-facts`, `provider-rapidapi`, Shape A/B in [edge-functions.md](../architecture/infrastructure/edge-functions.md). Worker/Railway sections **obsolete** |
| `8.27 MATCHREAD UPDATES/MatchRead-US-Open-P0-Reconciliation-Repair.md` | US Open reconciliation P0 | Partially in `sync-facts`, `0012` event_map, `0020` WTA draw cleanup |
| `0821 Updates/MatchRead-Sprint-Directive-v2.1.*` | Sprint 2.1 directive | [overview.md](../architecture/overview.md), migrations `0016`–`0018` |
| `0821 Updates/probe-event-dates-diagnosis.md` | Event date probe notes | `scripts/probe-event-dates.mjs`, [ops-scripts.md](../architecture/infrastructure/ops-scripts.md) |
| `MatchRead-Matchstat-Integration-Manual-US-Open.md` | MatchStat / socket integration | **Future / not implemented** — do not treat as current architecture |
| `MatchRead_MatchStat_API_Architecture_Corrections_v1.pdf` | MatchStat API corrections | Same — future |
| `MatchRead-Cincinnati-Cleanup-Checklist.md*.pdf` | Cincinnati ops checklist | Historical one-off |
| `MatchRead design example.zip` | UI design reference | Not wired to code |
| `mds.pdf` | Misc design | Historical |

When adding new notes, prefer `discussion/YYYY-MM-topic/topic.md` and link the matching `architecture/` section.
