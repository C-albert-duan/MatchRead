# Phase 13 — Public US Open window checklist

**Goal:** Live tournament window ready — ingest, settle, poll, domain, 128 smoke.  
**Plan:** [13-public-window.md](./13-public-window.md)  
**Runbooks:** [INGEST](../runbooks/INGEST.md) · [SETTLEMENT-SCHEDULING](../runbooks/SETTLEMENT-SCHEDULING.md) · [LIVE-LISTENER](../runbooks/LIVE-LISTENER.md)

---

## 0. Prerequisites

- [ ] Phases 10–12 signed off (or consciously waived for a dry public rehearsal)
- [ ] Docker or Preview app running with real anon key
- [ ] Migrations `0001`–`0006` applied

---

## A. Ingest (13.2)

| # | Check | How |
|---|---|---|
| A.1 | UI save | Commissioner: tournament → Official results → Save `r0-m0` + winner |
| A.2 | Settle league | **Run settlement** → standings update |
| A.3 | Founder all | Founder: **Settle all leagues** after results exist |
| A.4 | Edge (optional) | Deploy `ingest-events`; POST one result with `INGEST_SECRET` |
| A.5 | Docs | Skim [INGEST.md](../runbooks/INGEST.md) |

- [ ] Section A pass

---

## B. Settlement schedule (13.1)

| # | Check | How |
|---|---|---|
| B.1 | Dry run | Fixture settle + `docker compose … --profile verify run --rm verify-math` |
| B.2 | Policy chosen | Manual OK for beta; for public pick pg_cron / Railway / scheduled Edge (**not** service-role on Vercel) |
| B.3 | Armed | Cron or runbook owner on-call documented in SETTLEMENT-SCHEDULING |
| B.4 | Re-settle Δ | Second settle updates Move chips |

- [ ] Section B pass

---

## C. Live path (13.3)

| # | Check | How |
|---|---|---|
| C.1 | Poll | Tournament with draw: soft refresh ~45s |
| C.2 | Season poll | Season page with rows refreshes |
| C.3 | Socket decision | Either Railway worker planned/shipped **or** accept REST poll + ingest for launch (record decision in STATUS) |

- [ ] Section C pass

---

## D. 128 device smoke (13.4)

| # | Check | How |
|---|---|---|
| D.1 | Showcase | `/showcase` 128 smoke loads on phone + desktop |
| D.2 | H-scroll | Reach Final column |
| D.3 | Early pick | Pick + confidence on R1 (local showcase OK) |
| D.4 | Fixture | Real `uso-2026` pick/save still works |

- [ ] Section D pass

---

## E. Real domain (13.5)

| # | Check | How |
|---|---|---|
| E.1 | DNS / Vercel | `matchreadtennis.com` (or chosen) → Vercel |
| E.2 | SITE_URL | Production `NEXT_PUBLIC_SITE_URL=https://…` |
| E.3 | Auth URLs | Supabase allow-list + Site URL = canonical HTTPS |
| E.4 | Magic link | Sign-in on real domain → `/leagues` |

- [ ] Section E pass

---

## Pass criteria

| Result | Action |
|---|---|
| **A–E checked** | Phase 13 **Done**; LAUNCH public-window items ticked |
| Socket deferred | Explicit STATUS note: “REST poll accepted for launch” |

---

## What Phase 13 shipped in-repo

| Artifact | Purpose |
|---|---|
| `OfficialResultsPanel` | Manual ingest UI |
| `recordOfficialResult` / `settleAllLeaguesForTournament` | Write results + multi-league settle |
| `supabase/functions/ingest-events` | Machine ingest |
| [INGEST.md](../runbooks/INGEST.md) | Operator guide |
| This checklist | Owner verification |
