# Completion checklist — Phases 9–14

Track: [09-completion-to-launch.md](./09-completion-to-launch.md)  
App: **http://localhost:3001** (Docker) · Prod: Vercel / real domain when Phase 11+

Mark boxes when **you** verify — not when code was written.

---

## Phase 9 — Baseline harden

- [ ] `docker compose --env-file .env.docker up --build` → app on :3001
- [ ] Migrations `0001`–`0006` confirmed on production Supabase project
- [ ] Auth Site URL + Redirect URLs include `http://localhost:3001` / callback
- [ ] `.env.docker` has real anon key (not placeholder)
- [ ] No service-role key in Compose `web` / `web-prod` env

## Phase 10 — Owner E2E

- [ ] Follow [10-owner-e2e-checklist.md](./10-owner-e2e-checklist.md) end to end
- [ ] STATUS.md phases 5–8 set to **Done**; Phase 10 **Done**

<details>
<summary>Legacy pointers (archived)</summary>

- [archive/05-daily-check-checklist](./archive/05-daily-check-checklist.md)
- [archive/06-ceo-tier1-checklist](./archive/06-ceo-tier1-checklist.md)
- [archive/07-ops-i18n-polish-checklist](./archive/07-ops-i18n-polish-checklist.md)
- [archive/08-public-window-checklist](./archive/08-public-window-checklist.md)

</details>

## Phase 11 — Production auth + SMTP

- [ ] Follow [11-production-auth-checklist.md](./11-production-auth-checklist.md) end to end
- [ ] STATUS.md Phase 11 → **Done**; LAUNCH-CHECKLIST magic-link + SMTP ticked

## Phase 12 — Private beta

- [ ] Follow [12-private-beta-checklist.md](./12-private-beta-checklist.md) end to end
- [ ] STATUS.md Phase 12 → **Done**; LAUNCH invite-wave items ticked

## Phase 13 — Public window

- [ ] Follow [13-public-window-checklist.md](./13-public-window-checklist.md)
- [ ] STATUS Phase 13 → **Done**

## Phase 14 — CEO Tier 2–3 (optional)

- [ ] Gate: Phases 10–12 green
- [ ] Follow [14-ceo-tier2-tier3-checklist.md](./14-ceo-tier2-tier3-checklist.md) for any pulled feature

---

## Pass

Phases **9–12** → private beta ready.  
Phases **9–13** → public window ready.  
Phase **14** never blocks beta.
