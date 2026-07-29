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
| **4 — Settlement + Standings** | **Done** |
| **5 — Daily Check** | **Code done — apply `0005` + E2E** |
| 6–8 | Not started |

---

## Phase 4 — Settlement + Standings (done)

Grading, commissioner settlement, event + season tables. Checklist complete.

---

## Phase 5 — Daily Check (code shipped)

| Item | Status | Notes |
|---|---|---|
| `computeDailyCheck` in `@matchread/core` | Done | Deltas only from snapshots |
| League home leads with pulse | Done | |
| Result artifact `/t/[ref]/result` | Done | |
| `daily_check_log` migration | **Apply `0005_daily_check.sql`** | Optional cache |
| Owner E2E | Pending | [05-daily-check-checklist.md](./plans/05-daily-check-checklist.md) |

---

## Infrastructure

| Piece | Status |
|---|---|
| Schema 0004 settlement | Applied |
| Schema 0005 daily check | **Apply for log cache** |
| Vercel | Not connected |

---

## Next up — Phase 6

Plan: [plans/06-ceo-tier1-engagement.md](./plans/06-ceo-tier1-engagement.md)

---

## First-week checkpoint

- [x] Repo on GitHub
- [x] Supabase auth round-trip locally
- [x] Create league + invite + join E2E
- [x] Fixture bracket filled and submitted
- [x] Settlement moves standings
- [ ] Daily Check leads league home
- [ ] Vercel preview auth
