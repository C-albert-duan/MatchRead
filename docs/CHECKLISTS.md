# All checklists — MatchRead

**Single index.** Work top-down for launch.

**Live status:** [STATUS.md](./STATUS.md) · **Finish plan:** [plans/09-completion-to-launch.md](./plans/09-completion-to-launch.md)

---

## How to use

1. Local app: `docker compose --env-file .env.docker up --build` → http://localhost:3001  
2. For **Docker-only step-by-step E2E scenarios** (no Vercel): [DOCKER-LOCAL-E2E.md](./DOCKER-LOCAL-E2E.md)  
3. Open the **active** phase checklist from STATUS.  
4. Check boxes only when **you** verified.  
5. When a phase passes, update STATUS.

---

## Completion phases (finish line)

| Phase | Checklist | Goal |
|---|---|---|
| **9–14 rollup** | [09-completion-checklist.md](./plans/09-completion-checklist.md) | Overall completion tracker |
| **10 Owner E2E** | [10-owner-e2e-checklist.md](./plans/10-owner-e2e-checklist.md) · narrative steps: [DOCKER-LOCAL-E2E.md](./DOCKER-LOCAL-E2E.md) | Sign off Daily Check + Tier 1 + ops + poll (local Docker) |
| **11 Production auth** | [11-production-auth-checklist.md](./plans/11-production-auth-checklist.md) | Vercel + SMTP + Preview magic link |
| **12 Private beta** | [12-private-beta-checklist.md](./plans/12-private-beta-checklist.md) | Invite wave + CI + failure modes |
| **13 Public window** | [13-public-window-checklist.md](./plans/13-public-window-checklist.md) | Ingest, settle schedule, live, domain, 128 |
| **14 Tier 2–3** | [14-ceo-tier2-tier3-checklist.md](./plans/14-ceo-tier2-tier3-checklist.md) | Optional CEO features (**deferred**) |

---

## Launch rollup

| Doc | Purpose |
|---|---|
| [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md) | Private beta + public readiness master list |
| [FEATURE-PRIORITIES.md](./FEATURE-PRIORITIES.md) | CEO Tier 1–3 status |

---

## Archived (build phases 01–08)

Historical detail lists: [plans/archive/](./plans/archive/) — superseded by Phase **10** for day-to-day E2E.

---

## Suggested order

```text
10 (E2E) → 11 (Preview auth) → 12 (invite friends) → 13 (public window)
                                                      ↘ 14 (optional polish)
```
