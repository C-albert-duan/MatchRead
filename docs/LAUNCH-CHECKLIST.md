# Launch Checklist — private beta

## Before inviting anyone

- [x] `pnpm install` / workspace install works locally (dev on :3001)
- [ ] Lint, typecheck, tests green on CI / clean clone (run locally before invite)
- [ ] Supabase production project created; migrations applied
- [ ] Magic link works on production (or stable preview) domain
- [ ] Custom SMTP or acceptable email quota for invite wave
- [x] Create league → copy invite → join → appear in members *(local E2E)*
- [x] Fixture bracket: fill, submit, lock (manual lock OK for beta) *(local)*
- [x] Settlement runs on a schedule **or** documented manual trigger *(commissioner button + [SETTLEMENT-SCHEDULING](./runbooks/SETTLEMENT-SCHEDULING.md); math dry-run `node scripts/verify-settlement-math.mjs`)*
- [ ] Daily Check shows movement after a settlement pass *(code shipped — owner E2E)*
- [~] Founder can see basic health (`/founder` minimum) — code ready (Phase 7); owner E2E pending
- [ ] No service-role key on Vercel (verified) — *Vercel not connected yet*

## Invite wave

- [ ] Commissioner accounts smoke-tested
- [ ] Invite links work signed-out → sign-in → join
- [ ] Known failure modes documented (rate limit, revoked token)

## Explicitly deferred OK for invited beta

- [x] Live socket listener (REST sweep / poll lag acceptable) — *`LiveRefresh` ~45s + [LIVE-LISTENER](./runbooks/LIVE-LISTENER.md); Railway socket later*
- [ ] Full es/ja
- [ ] Analytics / Sentry
- [ ] CEO Tier 2–3

## Public window readiness (local/dev)

- [x] REST poll fallback on tournament / season standings
- [x] Settlement proven path documented + math dry-run script
- [x] Core 128-draw invariants (max 512, 7 rounds); bracket H-scroll MVP
- [ ] Owner E2E of [08-public-window-checklist](./plans/08-public-window-checklist.md)
- [ ] Auth proven on real domain / Vercel preview

## Not OK for public US Open launch

- Settlement unscheduled *(manual OK for invited beta; cron still needed for public)*
- No ingest path for results
- Auth never proven on real domain
- Bracket never load-tested on 128 draw *(math + H-scroll ready; device smoke still open)*
