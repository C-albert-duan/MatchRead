# Phase 17 — Automated provider backend checklist

**Plan:** [17-provider-backend.md](./17-provider-backend.md)  
**Goal:** RapidAPI key lives on a worker; live site updates without manual result upload.

Never put `RAPIDAPI_*` on Vercel.

---

## 17.1 Host

| # | Check | How |
|---|---|---|
| 1.1 | Host chosen | Railway (default) or GitHub Actions-only for beta |
| 1.2 | Account ready | Railway project linked to repo / GH secrets filled |

- [ ] Section 17.1 pass

---

## 17.2 Worker

| # | Check | How |
|---|---|---|
| 2.1 | Entrypoints | `reconcile` + `settle` (+ optional health) |
| 2.2 | DB-backed map | Loads `provider_tournament_id` / seats / `provider_match_map` |
| 2.3 | Idempotent | Re-run safe (upsert) |
| 2.4 | Logs | upserted / skipped / errors visible in host logs |

- [ ] Section 17.2 pass

---

## 17.3 Auto settle

| # | Check | How |
|---|---|---|
| 3.1 | Settle function | Edge `settle-tournament` (or equivalent) with secret |
| 3.2 | Worker calls settle | After ingest or on settle cron |
| 3.3 | Standings move | Without commissioner Settle click |

- [ ] Section 17.3 pass

---

## 17.4 Real mapping

| # | Check | How |
|---|---|---|
| 4.1 | Launch tournament chosen | Provider id recorded |
| 4.2 | Seats real + `provider_player_id` | Not fictional-only |
| 4.3 | `provider_match_map` filled | Enough matches for live rounds |
| 4.4 | E2E | Finished match → site grades/standings automatic |

- [ ] Section 17.4 pass

---

## 17.5 Deploy

| # | Check | How |
|---|---|---|
| 5.1 | Secrets on worker only | RapidAPI + ingest + settle |
| 5.2 | Schedule armed | Cron interval documented |
| 5.3 | Vercel clean | No `RAPIDAPI_*` |
| 5.4 | Pause works | Railway pause / env kill switch |

- [ ] Section 17.5 pass

---

## 17.6 Quota & ops

| # | Check | How |
|---|---|---|
| 6.1 | RapidAPI plan | Pro (or enough for poll interval) |
| 6.2 | Failure visibility | Failed job notifies or is obvious in dashboard |
| 6.3 | Fallback | Official results UI still works |

- [ ] Section 17.6 pass

---

## Sign-off

| Role | Name | Date |
|---|---|---|
| Owner (host / tournament / budget) | | |
| Engineer (worker + settle + map) | | |
