# Plan 09 — Completion to launch

**Status: ACTIVE (2026-07-31)**  
**Current stage:** Build 0–8 code shipped → start **Phase 9**, then 10→13 for launch. Phase 14 optional.

This plan turns “code done” into **signed-off private beta** and **public US Open window**, then optional CEO Tier 2–3.

**Checklist:** [09-completion-checklist.md](./09-completion-checklist.md)  
**Also use:** [10-owner-e2e-checklist.md](./10-owner-e2e-checklist.md) · [LAUNCH-CHECKLIST.md](../LAUNCH-CHECKLIST.md) · [archive/](./archive/) for historical 01–08 lists.

---

## Phase 9 — Baseline harden

**Goal:** One reliable environment; no ambiguity about how to run or which DB.

| # | Task | Done when |
|---|---|---|
| 9.1 | Confirm Docker-only path | `docker compose --env-file .env.docker up --build` serves :3001 |
| 9.2 | Verify migrations `0001`–`0006` on `opugihofwvunwkpcmboq` | Tables/RPCs present; or Compose `migrate` profile succeeds |
| 9.3 | Auth URL config (local) | Site URL + redirect allow-list for `localhost:3001` |
| 9.4 | `.env.docker` has real anon key | Magic link request does not fail on bad key |
| 9.5 | Document any password/key rotations | No secrets in git or chat history going forward |

**Exit:** Fresh machine / Docker Desktop + `.env.docker` → app up; schema complete.

---

## Phase 10 — Owner E2E sign-off

**Goal:** Mark engineering phases 5–8 and CEO Tier 1 as **done**, not only “code shipped”.

**Walkthrough:** [10-owner-e2e-checklist.md](./10-owner-e2e-checklist.md) (single owner doc; use it for sign-off).

| # | Task | Done when |
|---|---|---|
| 10.1 | Daily Check (§B) | Phase 10 checklist §B complete |
| 10.2 | CEO Tier 1 (§C) | §C complete |
| 10.3 | Ops · i18n (§D) | §D complete |
| 10.4 | Public window local (§E) | §E complete |
| 10.5 | Update STATUS / ROADMAP | Phases 5–8 → **Done**; Phase 10 → **Done** |

**Engineering assist:** `/showcase` 128 smoke, Compose profile `verify` (`verify-math`), `scripts/` mounted on `web`.

**Exit:** Owner sign-off recorded in STATUS. Fixture league shows Daily Check + Tier 1 after settlement.

---

## Phase 11 — Production auth + SMTP

**Goal:** Magic link works outside localhost so invites are real.

**Walkthrough:** [11-production-auth-checklist.md](./11-production-auth-checklist.md)

| # | Task | Done when |
|---|---|---|
| 11.1 | Vercel project (`apps/web` + `vercel.json`) | Preview deploy healthy |
| 11.2 | Env on Vercel | `NEXT_PUBLIC_SUPABASE_*`; prod-only `NEXT_PUBLIC_SITE_URL`; **no** service-role |
| 11.3 | Supabase Auth URLs | Preview + local (+ prod when ready) allow-listed |
| 11.4 | Custom SMTP | [SMTP.md](../runbooks/SMTP.md) — invite volume without built-in cap |
| 11.5 | Magic link E2E on Preview | Sign-in → `/leagues` on Preview host |

**In-repo assist:** `apps/web/vercel.json`, `.vercelignore`, browser-origin magic-link redirects, SMTP + FIRST-PRODUCTION runbooks.

**Exit:** [LAUNCH-CHECKLIST](../LAUNCH-CHECKLIST.md) “magic link on production/preview” + SMTP checked.

---

## Phase 12 — Private beta invite wave

**Goal:** Real commissioners and friends can play without founder babysitting every click.

**Walkthrough:** [12-private-beta-checklist.md](./12-private-beta-checklist.md)

| # | Task | Done when |
|---|---|---|
| 12.1 | Commissioner smoke | Create → invite → join → bracket submit |
| 12.2 | Signed-out invite path | Link → sign-in → join (`next` preserved on auth errors) |
| 12.3 | Founder gate | `FOUNDER_EMAILS` set; `/founder` usable |
| 12.4 | Failure modes noted | [BETA-FAILURE-MODES.md](../runbooks/BETA-FAILURE-MODES.md) |
| 12.5 | CI | `.github/workflows/ci.yml` green on PR/main |

**In-repo assist:** auth `next` + `?error=` UX, not-found/error pages, CI workflow, failure-modes runbook.

**Exit:** LAUNCH-CHECKLIST “Before inviting” + “Invite wave” green. Analytics/Sentry still optional.

---

## Phase 13 — Public US Open window

**Walkthrough:** [13-public-window-checklist.md](./13-public-window-checklist.md) · [13-public-window.md](./13-public-window.md)

| # | Task | Done when |
|---|---|---|
| 13.1 | Settlement schedule | Dry-run then arm Edge/Railway cron (not Vercel service-role) |
| 13.2 | Ingest path | UI + `ingest-events` Edge ([INGEST.md](../runbooks/INGEST.md)) |
| 13.3 | Live path | REST poll OK; socket optional with STATUS note |
| 13.4 | 128 smoke | `/showcase` + fixture on devices |
| 13.5 | Real domain | Auth + `NEXT_PUBLIC_SITE_URL` |

**In-repo:** Official results panel, settle-all, ingest-events function.

**Exit:** LAUNCH public-window items checked.

---

## Phase 14 — CEO Tier 2–3 (optional)

**Walkthrough:** [14-ceo-tier2-tier3-checklist.md](./14-ceo-tier2-tier3-checklist.md) · [14-ceo-tier2-tier3.md](./14-ceo-tier2-tier3.md)

**Not built.** Pull one Tier 2 item at a time after beta is stable. Does not block launch.

---

## Suggested order (don’t skip)

```text
9 Baseline → 10 E2E → 11 Auth/SMTP → 12 Private beta → 13 Public window
                                                      ↘ 14 Tier 2–3 when capacity
```

Calendar pressure: finish **9–12** well before draw week (~27 Aug). Phase **13** must be ready when live matches matter.

---

## Out of scope for this plan

- Rewriting Wireframe / mobile-only screens (Daily picks, Match Detail as product)
- Push notifications as primary habit (Daily Check remains pull)
- Host `npm install` workflow (Docker-only — [DOCKER.md](../DOCKER.md))
