# MatchRead — Documentation

**US Open 2026 web launch.** Living plans and runbooks for this repository.

Visual truth lives in [`../Wireframe/`](../Wireframe/) — do not edit it for product copy; update these docs when scope changes.

## Reading order

1. [STATUS.md](./STATUS.md) — where we are right now
2. [CHECKLISTS.md](./CHECKLISTS.md) — **all test checklists**
3. [PRODUCT.md](./PRODUCT.md) — what we are building
4. [MVP-SCOPE.md](./MVP-SCOPE.md) — in / out / later
5. [FEATURE-PRIORITIES.md](./FEATURE-PRIORITIES.md) — CEO Tier 1–3
6. [ROADMAP.md](./ROADMAP.md) — build + completion phases
7. [ARCHITECTURE.md](./ARCHITECTURE.md) — system shape
8. [DEPLOYMENT.md](./DEPLOYMENT.md) — GitHub · Vercel · Supabase
9. [DOCKER.md](./DOCKER.md) — Docker-only local run
10. [plans/09-completion-to-launch.md](./plans/09-completion-to-launch.md) — finish line (9→14)

## Index

| Doc | Purpose |
|---|---|
| [STATUS.md](./STATUS.md) | Live phase / infra status |
| [CHECKLISTS.md](./CHECKLISTS.md) | Index of every phase checklist |
| [PRODUCT.md](./PRODUCT.md) | Product definition and integrity rules |
| [MVP-SCOPE.md](./MVP-SCOPE.md) | Launch cut line |
| [FEATURE-PRIORITIES.md](./FEATURE-PRIORITIES.md) | CEO engagement priorities |
| [ROADMAP.md](./ROADMAP.md) | Phased implementation (0–8 build, 9–14 completion) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Trust boundaries and packages |
| [DATA-MODEL.md](./DATA-MODEL.md) | Core entities |
| [ROUTES.md](./ROUTES.md) | Screen → route map |
| [DESIGN-LANGUAGE.md](./DESIGN-LANGUAGE.md) | Tokens and visual rules |
| [AUTH.md](./AUTH.md) | Magic link auth |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Platform checklist |
| [DOCKER.md](./DOCKER.md) | Docker-only local / self-host |
| [SUPABASE-SETUP.md](./SUPABASE-SETUP.md) | This project's Supabase wiring |
| [ENVIRONMENT-VARIABLES.md](./ENVIRONMENT-VARIABLES.md) | Env inventory |
| [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md) | Private beta sequence |
| [KNOWN-RISKS.md](./KNOWN-RISKS.md) | Launch-day risks |

### Plans

| Plan | Phase |
|---|---|
| [CHECKLISTS.md](./CHECKLISTS.md) | **All checklists index** |
| [plans/00-bootstrap.md](./plans/00-bootstrap.md) | Monorepo, CI, envs |
| [plans/01-auth-landing.md](./plans/01-auth-landing.md)–[08](./plans/08-public-window.md) | Build phase plans |
| [plans/archive/](./plans/archive/) | Archived 01–08 test checklists |
| [plans/09-completion-to-launch.md](./plans/09-completion-to-launch.md) | Finish line: E2E → beta → public → Tier 2–3 |
| [plans/09-completion-checklist.md](./plans/09-completion-checklist.md) | Completion checklist 9–14 |
| [plans/10-owner-e2e-checklist.md](./plans/10-owner-e2e-checklist.md) | Phase 10 owner E2E |
| [plans/11-production-auth-checklist.md](./plans/11-production-auth-checklist.md) | Phase 11 Vercel + SMTP |
| [plans/12-private-beta-checklist.md](./plans/12-private-beta-checklist.md) | Phase 12 invite wave |
| [plans/13-public-window-checklist.md](./plans/13-public-window-checklist.md) | Phase 13 public window |
| [plans/14-ceo-tier2-tier3-checklist.md](./plans/14-ceo-tier2-tier3-checklist.md) | Phase 14 Tier 2–3 (optional) |

### Runbooks

| Runbook | When |
|---|---|
| [runbooks/FIRST-PRODUCTION.md](./runbooks/FIRST-PRODUCTION.md) | First deploy |
| [runbooks/SMTP.md](./runbooks/SMTP.md) | Custom Auth SMTP (Resend, etc.) |
| [runbooks/INGEST.md](./runbooks/INGEST.md) | Official results → match_results |
| [runbooks/SYNC-TENNIS.md](./runbooks/SYNC-TENNIS.md) | Auto-fetch Tennis API (Supabase secret + Edge) |
| [runbooks/BETA-FAILURE-MODES.md](./runbooks/BETA-FAILURE-MODES.md) | Private beta support cheat-sheet |
| [runbooks/SETTLEMENT-SCHEDULING.md](./runbooks/SETTLEMENT-SCHEDULING.md) | Arm settlement |
| [runbooks/TENNIS-PROVIDER.md](./runbooks/TENNIS-PROVIDER.md) | RapidAPI |
| [runbooks/RAILWAY-WORKER.md](./runbooks/RAILWAY-WORKER.md) | Optional local worker |

### References

| Doc | Purpose |
|---|---|
| [references/SOURCE-MAP.md](./references/SOURCE-MAP.md) | Wireframe paths → these docs |

Open the interactive spec: [`../Wireframe/MatchRead-main/matchread-spec/index.html`](../Wireframe/MatchRead-main/matchread-spec/index.html)
