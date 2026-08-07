# Phase 15 — RapidAPI tennis provider checklist

**Plan:** [15-rapidapi-tennis-provider.md](./15-rapidapi-tennis-provider.md)  
**Runbooks:** [TENNIS-PROVIDER.md](../runbooks/TENNIS-PROVIDER.md) · [INGEST.md](../runbooks/INGEST.md)

Owner + engineer. Check boxes when verified. **Never paste the API key into chat, issues, or commits.**

---

## A. Secrets & confirmation

| # | Check | How |
|---|---|---|
| A.1 | Rotate key if leaked | RapidAPI → app → regenerate after any screenshot/chat exposure |
| A.2 | Product recorded | Tennis API - ATP WTA ITF; host `tennis-api-atp-wta-itf.p.rapidapi.com` |
| A.3 | Tier / quota / rate limit | Written in TENNIS-PROVIDER day-one section |
| A.4 | Commercial terms OK | Founder confirms public/commercial use allowed |
| A.5 | Secrets location | Key only in local `.env.provider` (gitignored) and/or Railway — **not** Vercel |
| A.6 | Env names | `RAPIDAPI_KEY`, `RAPIDAPI_HOST` documented in ENVIRONMENT-VARIABLES |

- [ ] Section A pass

---

## B. Package scaffold

| # | Check | How |
|---|---|---|
| B.1 | `packages/provider-rapidapi` exists | Workspace package; not imported by client bundles |
| B.2 | REST client | Key/host headers; backoff; typed errors |
| B.3 | CI tests | `npm run test:provider` (map unit tests; no live key) |

- [x] Section B pass

---

## C. Probe

| # | Check | How |
|---|---|---|
| C.1 | Probe script | `npm run probe:rapidapi` → 200 |
| C.2 | Fixtures call | `node scripts/probe-rapidapi.mjs fixtures` |
| C.3 | Failure modes | Bad key / wrong host → clear non-zero exit |

- [x] Section C pass (Basic)

---

## D. Mapping

| # | Check | How |
|---|---|---|
| D.1 | Tournament map | Provider id ↔ MatchRead tournament row |
| D.2 | Match map | Provider match → `match_key` |
| D.3 | Player map | Provider player → `player_ref` / seats |
| D.4 | Fail closed | Unverifiable draw does not write topology |

- [ ] Section D pass

---

## E. Ingest path

| # | Check | How |
|---|---|---|
| E.1 | `ingest-events` deployed | Secret set in Supabase |
| E.2 | Reconcile job | Provider results → POST ingest payload |
| E.3 | Settlement separate | After ingest, settle → standings / Daily Check move |
| E.4 | Fallback | Commissioner Official results UI still works |

- [ ] Section E pass

---

## F. Product (optional for first ship)

| # | Check | How |
|---|---|---|
| F.1 | No browser RapidAPI | Network tab on `/players` / calendar shows only Supabase/app |
| F.2 | Cache / offline | Provider outage does not crash web |

- [ ] Section F pass (or explicitly deferred)

---

## G. Live socket (later)

| # | Check | How |
|---|---|---|
| G.1 | REST proven first | E pass on a live tournament week |
| G.2 | Railway worker | Socket → ingest only; no DB credentials beyond ingest auth |

- [ ] Section G pass (or accept poll-only for launch)

---

## Sign-off

| Role | Name | Date |
|---|---|---|
| Owner (quota / terms / key) | | |
| Engineer (package / ingest) | | |
