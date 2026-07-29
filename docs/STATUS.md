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
| **5 — Daily Check** | **Code done — E2E** |
| **6 — CEO Tier 1** | **Code done — apply `0006` + E2E** |
| **7 — Ops · i18n · Polish** | **Code done — E2E** |
| **8 — Public window** | **Code done — poll + math; Vercel/auth open** |

All engineering phases through 8 have **code shipped**. Remaining work is owner E2E, apply migrations `0005`/`0006`, and production (Vercel + real-domain auth).

---

## Apply migrations (SQL Editor)

1. `0005_daily_check.sql` — Daily Check log cache  
2. `0006_engagement.sql` — pick confidence column + RPC  

(0001–0004 assumed applied.)

---

## Phase summaries

| Phase | Highlights |
|---|---|
| 5 | League home Daily Check; result artifact |
| 6 | Confidence 1–5; health; highlights; miss; perfect remaining |
| 7 | `/founder` + disruption; en/es/ja; offline banner; `FOUNDER_EMAILS` |
| 8 | `LiveRefresh` REST poll; 128→512 math script; LIVE-LISTENER runbook |

---

## Still open (honest)

- [ ] Owner E2E checklists 05–08  
- [ ] Vercel deploy + magic link on real domain  
- [ ] Custom SMTP / email quota for invite wave  
- [ ] Railway live socket (REST poll is the interim)  
- [ ] Arm production settlement cron after dry run  

Checklists: `docs/plans/*-checklist.md` · [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md)

---

## First-week checkpoint

- [x] Repo on GitHub  
- [x] Local auth + growth loop + bracket + settlement  
- [ ] Daily Check / Tier 1 / founder E2E signed off  
- [ ] Vercel preview auth  
