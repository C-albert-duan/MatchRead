# Phase 12 — Private beta invite wave checklist

**Goal:** Real commissioners and friends can play without founder babysitting every click.  
**Plan:** [09-completion-to-launch § Phase 12](./09-completion-to-launch.md#phase-12--private-beta-invite-wave)  
**Support:** [BETA-FAILURE-MODES.md](../runbooks/BETA-FAILURE-MODES.md)

Prefer Preview (Phase 11) for invite tests; Docker localhost works for flow smoke.

---

## 0. Prerequisites

- [ ] Phase 11 Preview auth + SMTP working **or** local Docker auth working
- [ ] Migrations `0001`–`0006` applied
- [ ] Latest code includes invite `next` preserve + CI (this phase)

---

## A. Commissioner smoke (12.1)

| # | Check | How |
|---|---|---|
| A.1 | Create league | `/leagues/new` → create |
| A.2 | Copy invite | League home → copy invite URL |
| A.3 | Second person joins | Other browser/incognito + other email |
| A.4 | Both on members | League home shows both |
| A.5 | Brackets | Both open `uso-2026` bracket, pick, submit |

- [ ] Section A pass

---

## B. Signed-out invite path (12.2)

| # | Check | How |
|---|---|---|
| B.1 | Signed out | Open invite URL in a logged-out browser |
| B.2 | Preview | Sees league name + **Sign in and join** |
| B.3 | Sign-in | Lands on `/sign-in?next=/join/...` |
| B.4 | Magic link | Completes auth → returns to `/join/...` → auto-join → league home |
| B.5 | Failed link keeps next | Break a link once (or use expired): `/sign-in?error=auth&next=/join/...` shows message; new OTP still returns to invite |

- [ ] Section B pass

---

## C. Founder gate (12.3)

| # | Check | How |
|---|---|---|
| C.1 | Set env | `FOUNDER_EMAILS=you@example.com` on Vercel Production/Preview and/or `.env.docker` |
| C.2 | Allowed | Your email opens `/founder` with counts |
| C.3 | Denied | Other signed-in email → denied + ErrorNote |
| C.4 | Disruption | `/founder/disruption` reachable when allowed |

- [ ] Section C pass

---

## D. Failure modes (12.4)

| # | Check | How |
|---|---|---|
| D.1 | Runbook exists | Skim [BETA-FAILURE-MODES.md](../runbooks/BETA-FAILURE-MODES.md) |
| D.2 | Revoked invite | Commissioner revoke/rotate → old link shows “no longer valid” |
| D.3 | Rate limit copy | Sign-in shows clear message when provider throttles (or confirm SMTP avoids it) |
| D.4 | Offline | DevTools Offline → banner appears |
| D.5 | LAUNCH tick | Mark “Known failure modes documented” on [LAUNCH-CHECKLIST](../LAUNCH-CHECKLIST.md) |

- [ ] Section D pass

---

## E. CI (12.5)

| # | Check | How |
|---|---|---|
| E.1 | Workflow present | `.github/workflows/ci.yml` on `main` |
| E.2 | Green on PR or push | GitHub Actions: lint · typecheck · test · math · build |
| E.3 | LAUNCH tick | “Lint, typecheck, tests green on CI” on LAUNCH-CHECKLIST |

- [ ] Section E pass (required before wide invite wave)

---

## Pass criteria

| Result | Action |
|---|---|
| **A–E checked** | Phase 12 **Done** in STATUS; invite-wave LAUNCH items ticked |
| Auth still localhost-only | Finish Phase 11 first for real friends; A/B can still smoke on Docker |

**Out of scope:** settlement cron / Railway socket (Phase 13).

---

## What Phase 12 shipped in-repo

| Artifact | Purpose |
|---|---|
| Auth callback preserves `next` on failure | Invite not lost after bad magic link |
| Sign-in shows `?error=` | Clear message + retry |
| `app/error.tsx` · `app/not-found.tsx` | Beta-friendly recovery |
| `.github/workflows/ci.yml` | PR/main CI |
| `docs/runbooks/BETA-FAILURE-MODES.md` | Support cheat-sheet |
| This checklist | Owner verification |
