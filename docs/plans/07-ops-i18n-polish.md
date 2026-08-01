# Plan 07 — Ops · i18n · Polish

## Status: **CODE DONE** — owner E2E = [completion Phase 10](./09-completion-to-launch.md#phase-10--owner-e2e-sign-off); production auth = Phase 11+

## Goal

Private-beta ready: operator tools, locales, error states, monitoring basics.

## Done when

- [x] `/founder` minimum health view
- [x] Disruption / void path usable for withdrawals
- [x] en complete for critical strings; es/ja underway (landing / nav / daily frames / founder / offline)
- [x] Loading / empty / error / offline states on critical routes (`OfflineBanner`, `ErrorNote`, leagues empty)
- [x] Optional: PostHog + Sentry — **deferred** (see ENVIRONMENT-VARIABLES.md); no SDKs added

## Work

1. Founder routes gated by `FOUNDER_EMAILS` (server). If unset → any signed-in user + beta banner. Never service-role in browser / Next public env.
2. i18n catalogue in `packages/i18n` + `apps/web/lib/i18n.ts` (`mr_locale` cookie)
3. Accessibility pass (contrast already in tokens; screen reader on bracket) — ongoing
4. Run LAUNCH-CHECKLIST.md end to end — owner

## Notes

- Void writes still need commissioner RLS on a league tied to the tournament (`pick_voids` / `match_results` policies from 0004). No new migration.
- After void, re-run settlement on affected leagues.
