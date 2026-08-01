# Launch Checklist — private beta

**Current stage (2026-07-31):** Build 0–8 code shipped. Work the [completion plan](./plans/09-completion-to-launch.md) (Phases 9→12 for beta, 13 for public).

## Before inviting anyone

- [x] Docker Compose starts the web app (`docker compose --env-file .env.docker up --build`)
- [ ] Lint, typecheck, tests green on CI / clean clone — *[CI workflow](../.github/workflows/ci.yml); Phase 12*
- [ ] Supabase production project created; migrations `0001`–`0006` applied
- [ ] Magic link works on production (or stable preview) domain — *[Phase 11 checklist](./plans/11-production-auth-checklist.md)*
- [ ] Custom SMTP or acceptable email quota for invite wave — *[SMTP runbook](./runbooks/SMTP.md)*
- [x] Create league → copy invite → join → appear in members *(local E2E)*
- [x] Fixture bracket: fill, submit, lock (manual lock OK for beta) *(local)*
- [x] Settlement runs on a schedule **or** documented manual trigger *(commissioner button + [SETTLEMENT-SCHEDULING](./runbooks/SETTLEMENT-SCHEDULING.md); math dry-run `node scripts/verify-settlement-math.mjs`)*
- [ ] Daily Check shows movement after a settlement pass *(code shipped — owner E2E / Phase 10)*
- [~] Founder can see basic health (`/founder` minimum) — code ready (Phase 7); owner E2E pending
- [ ] No service-role key on Vercel (verified) — *Vercel not connected yet*

## Invite wave

- [ ] Commissioner accounts smoke-tested — *[Phase 12](./plans/12-private-beta-checklist.md)*
- [ ] Invite links work signed-out → sign-in → join — *[Phase 12](./plans/12-private-beta-checklist.md)*
- [ ] Known failure modes documented (rate limit, revoked token) — *[BETA-FAILURE-MODES](./runbooks/BETA-FAILURE-MODES.md)*

## Explicitly deferred OK for invited beta

- [x] Live socket listener (REST sweep / poll lag acceptable) — *`LiveRefresh` ~45s + [LIVE-LISTENER](./runbooks/LIVE-LISTENER.md); Railway socket later*
- [ ] Full es/ja
- [ ] Analytics / Sentry
- [ ] CEO Tier 2–3

## Public window readiness (local/dev)

- [x] REST poll fallback on tournament / season standings
- [x] Settlement proven path documented + math dry-run script
- [x] Core 128-draw invariants (max 512, 7 rounds); bracket H-scroll MVP
- [ ] Owner E2E of [10-owner-e2e-checklist](./plans/10-owner-e2e-checklist.md) / [13-public-window-checklist](./plans/13-public-window-checklist.md)
- [ ] Auth proven on real domain / Vercel preview

## Not OK for public US Open launch

- Settlement unscheduled *(manual OK for invited beta; cron still needed for public)*
- No ingest path for results
- Auth never proven on real domain
- Bracket never load-tested on 128 draw *(math + H-scroll ready; device smoke still open)*
