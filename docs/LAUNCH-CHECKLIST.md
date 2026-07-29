# Launch Checklist — private beta

## Before inviting anyone

- [ ] `pnpm install`, lint, typecheck, tests green
- [ ] Supabase production project created; migrations applied
- [ ] Magic link works on production (or stable preview) domain
- [ ] Custom SMTP or acceptable email quota for invite wave
- [ ] Create league → copy invite → join → appear in members
- [ ] Fixture bracket: fill, submit, lock (manual lock OK for beta)
- [ ] Settlement runs on a schedule (or documented manual trigger)
- [ ] Daily Check shows movement after a settlement pass
- [ ] Founder can see basic health (`/founder` minimum)
- [ ] No service-role key on Vercel (verified)

## Invite wave

- [ ] Commissioner accounts smoke-tested
- [ ] Invite links work signed-out → sign-in → join
- [ ] Known failure modes documented (rate limit, revoked token)

## Explicitly deferred OK for invited beta

- [ ] Live socket listener (REST sweep lag acceptable)
- [ ] Full es/ja
- [ ] Analytics / Sentry
- [ ] CEO Tier 2–3

## Not OK for public US Open launch

- Settlement unscheduled
- No ingest path for results
- Auth never proven on real domain
- Bracket never load-tested on 128 draw
