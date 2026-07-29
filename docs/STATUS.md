# Project status

**Updated:** 2026-07-29  
**Repo:** https://github.com/C-albert-duan/MatchRead  
**Supabase project:** `rdfcklsshutampxsgltj` (`https://rdfcklsshutampxsgltj.supabase.co`)  
**Local app:** http://localhost:3001

---

## Current phase

| Phase | Status |
|---|---|
| **0 — Bootstrap** | **Done** |
| **1 — Auth + Landing** | **Done** |
| **2 — Leagues + Invites** | **Done** |
| **3 — Brackets** | **Done** |
| **4 — Settlement + Standings** | **Code done — apply `0004_settlement.sql` + E2E** |
| 5–8 | Not started |

---

## Phase 3 — Brackets (done)

Fixture 16-draw, `BracketGrid` alignment, save/submit/lock, draw-pending. Checklist complete.

---

## Phase 4 — Settlement + Standings (code shipped)

| Item | Status | Notes |
|---|---|---|
| Migration `0004_settlement.sql` | **Apply in SQL Editor** | results, snapshots, season, void stub |
| `gradeBracket` (128 → 512) | Done | `@matchread/core` |
| Commissioner **Run settlement** | Done | Tournament page |
| Event + season standings | Done | `/season` + event table |
| Owner E2E | Pending | [04-settlement-standings-checklist.md](./plans/04-settlement-standings-checklist.md) |

---

## Infrastructure

| Piece | Status |
|---|---|
| Schema 0003 brackets | Applied |
| Schema 0004 settlement | **Required for Phase 4 UI** |
| Vercel | Not connected |

---

## Next up — Phase 5

Plan: [plans/05-daily-check.md](./plans/05-daily-check.md) — after Phase 4 E2E.

---

## First-week checkpoint

- [x] Repo on GitHub
- [x] Supabase auth round-trip locally
- [x] Create league + invite + join E2E
- [x] Fixture bracket filled and submitted
- [ ] Settlement moves standings
- [ ] Vercel preview auth
