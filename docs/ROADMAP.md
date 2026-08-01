# Roadmap

Phased build for this repository. Wireframe stays read-only reference.

**Live status:** [STATUS.md](./STATUS.md)  
**Finish line plan:** [plans/09-completion-to-launch.md](./plans/09-completion-to-launch.md)

## Build phases (0–8) — code shipped

| Phase | Plan | Outcome | Status |
|---|---|---|---|
| **0** | [00-bootstrap](./plans/00-bootstrap.md) | Monorepo, docs, GitHub | **Done** |
| **1** | [01-auth-landing](./plans/01-auth-landing.md) | Magic link + landing + Supabase Auth | **Done** |
| **2** | [02-leagues-invites](./plans/02-leagues-invites.md) | Create → invite → join E2E | **Done** |
| **3** | [03-brackets](./plans/03-brackets.md) | Fill + submit fixture bracket | **Done** |
| **4** | [04-settlement-standings](./plans/04-settlement-standings.md) | Grades freeze; tables move | **Done** |
| **5** | [05-daily-check](./plans/05-daily-check.md) | League home leads with pulse | **Code done — E2E** |
| **6** | [06-ceo-tier1-engagement](./plans/06-ceo-tier1-engagement.md) | Confidence, health, highlights | **Code done — E2E** |
| **7** | [07-ops-i18n-polish](./plans/07-ops-i18n-polish.md) | Founder ops, en→es/ja, beta | **Code done — E2E** |
| **8** | [08-public-window](./plans/08-public-window.md) | Live poll, settlement math, 128-ready | **Code done — prod open** |

## Completion phases (09–14) — remaining work

| Phase | Plan | Outcome | Status |
|---|---|---|---|
| **9** | [09-completion-to-launch](./plans/09-completion-to-launch.md#phase-9--baseline-harden) | Migrations + Docker + Auth URLs proven | **Next** |
| **10** | [10-owner-e2e-checklist](./plans/10-owner-e2e-checklist.md) | Checklists 05–08 signed off | Owner |
| **11** | [11-production-auth-checklist](./plans/11-production-auth-checklist.md) | Vercel + SMTP + domain magic link | Owner |
| **12** | [12-private-beta-checklist](./plans/12-private-beta-checklist.md) | Invite wave / LAUNCH-CHECKLIST | **Active — owner** |
| **13** | [13-public-window-checklist](./plans/13-public-window-checklist.md) | Cron, ingest, live path, 128 smoke | **Assist shipped — owner** |
| **14** | [14-ceo-tier2-tier3-checklist](./plans/14-ceo-tier2-tier3-checklist.md) | Tier 2–3 engagement | **Deferred** |

## Checkpoint

- [x] Repo on GitHub with `Wireframe/` + `docs/` + app
- [x] Docker-only local run documented
- [x] Supabase auth round-trip works locally (when SMTP/quota allows)
- [ ] Supabase auth round-trip on a Vercel preview / real domain
- [x] Create league + invite + join works end-to-end (local)
- [x] Fixture bracket fill + submit + settlement (local)
- [ ] Daily Check + Tier 1 + founder E2E signed off
- [ ] Private beta invite wave
- [ ] Public window (cron + ingest)

## Calendar note

Bracket builder must be **already proven** when the US Open draw drops (~27 Aug). League creation must ship weeks earlier. Code path through Phase 8 is in-repo; **Phases 9–13** are the path to launch. Tier 2–3 (Phase 14) stays optional unless a Tier 1 gap forces a pull-forward.
