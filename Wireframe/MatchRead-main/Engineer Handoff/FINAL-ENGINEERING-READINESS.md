# Final engineering readiness

Area by area, with the evidence for each rating. Written at migration head `0030`.

**The rule this document is held to: nothing is rated on intent.** A rating reflects what has
been *executed*, not what has been written. Several areas are well-built and poorly verified,
and those get the verification's rating rather than the construction's — because on launch day
what you have is what has run.

## Rating scale

| | Meaning |
|---|---|
| **Solid** | Built and verified by something that would fail if it were wrong |
| **Built, unverified** | Code exists and is tested in isolation; the integration has never run |
| **Partial** | Works for the beta path; known gaps outside it |
| **Absent** | Does not exist |

## Summary

| Area | Rating | Beta blocker |
|---|---|---|
| Repository & CI | Solid | No |
| Architecture | Solid | No |
| Database schema & migrations | Built, unverified | No |
| Security model | Built, unverified | No |
| Authentication | Built, unverified | **Yes** — never run against a deployed project |
| Web application | Solid | No |
| Data provider integration | Built, unverified | No |
| **Ingestion (deployable listener)** | **Absent** | **Yes** (deferrable — see below) |
| **Settlement scheduling** | **Absent** | **Yes** |
| **Edge function deployability** | **Absent** | **Yes** |
| Monitoring | Partial | No |
| Analytics | Absent | No |
| Accessibility | Partial | No |
| Internationalization | Partial | No |
| Privacy | Absent | No (beta) / **Yes** (public) |
| Operations & recovery | Built, unverified | **Yes** — restore never rehearsed |
| **Private beta readiness** | **Not ready** | 4 blockers |
| **Public launch readiness** | **Not ready** | Above, plus 5 more |

---

## Repository & CI — Solid

**Evidence.** Clean-clone install, lint, typecheck and the full unit suite pass. Four CI jobs
exist and are meaningful: lint/types/tests, web build, the RLS suite built from migration zero
in a service container, and a generated-types drift check covering both copies.

**Remaining risk.** `pnpm-workspace.yaml` is load-bearing in a way that is easy to break — pnpm
ignores the npm-style `workspaces` array, and without the file `pnpm -r test` silently recurses
over one package. CI once passed for a whole milestone without ever compiling `packages/core`.

**Owner.** Launch Engineer, day 1.

---

## Architecture — Solid

**Evidence.** 20 ADRs, each recording a decision with its rejected alternatives. The engine
boundary is real: `packages/core` has zero dependencies and runs unchanged in Next.js Server
Components, Deno edge functions and React Native. Domain logic is genuinely centralised —
`gradePrediction` is the same function in the app's preview and in the settlement pass, so a
user cannot be shown a number that disagrees with the number they are given.

**Remaining risk.** `database.types.ts` is duplicated byte-for-byte between two apps. CI now
diffs both; before Phase 7 it diffed only mobile's, and a migration shipped alongside a web app
that could not see a new column.

**Owner.** No action needed for beta.

---

## Database schema & migrations — Built, unverified

**Evidence.** 31 migrations, `0001` → `0030`. 31 pgTAP suites with reconciling plans. Integrity
lives in Postgres rather than the interface: lock triggers, the split-counter, RLS everywhere,
append-only event tables so a K-factor change can be replayed over history.

**Why not Solid.** **Three suites have never been executed** — 0028 (withdrawal), 0029
(operator vocabulary), 0030 (replacement search). Plans reconcile and types check; neither is
evidence the SQL is correct. **0030 and its 18 assertions were written without a database
available at all** and are the least-verified code in the repository.

Treat a failure on first run as the expected outcome. Phase 7's own conclusion was that test
infrastructure CI cannot execute accumulates defects silently, and these three are exactly
that case.

**Remaining risk.** No foreign key in this schema has ever been asserted by the suite —
`information_schema` reports zero FKs to `authenticator`, which is how `db-run.sh` connects on
purpose. A `pg_catalog`-based sweep would be cheap and worthwhile.

**Blocker.** No, but it is the first thing to do on day 1.

---

## Security model — Built, unverified

**Evidence.** ADR-0005 and ADR-0007. RLS on every table, asserted. `app_is_service_role()` and
`app_is_founder()` gate privileged paths. Mutation tested: replacing a policy clause with
`using (true)` fails suite 22. Internal ids never reach the wire — migrations 0029 and 0030
exist as ref-addressed wrappers precisely so the most destructive operation in the product
cannot take a UUID from a form.

Service-role credentials are permitted in exactly three places, stated unambiguously in
`ENVIRONMENT-VARIABLES.md`: Edge Functions (platform-injected), the Railway listener, and a
launch engineer's local shell. **Never Vercel.**

**Why not Solid.** Every assertion is against a local database. No policy has ever faced a real
authenticated user.

**Remaining risk.** No rate limiting beyond Supabase defaults; the magic-link endpoint is the
exposed surface. `citext` usernames carry an ASCII-only constraint that will need revisiting.

**Blocker.** No.

---

## Authentication — Built, unverified. **BLOCKER**

**Evidence.** Magic link via `@supabase/ssr`. Middleware rotates tokens on every matched
request — the subtlety that breaks it if you get it wrong is that the response object handed to
`setAll` must be the one returned, and it is. `?next=` is preserved through the round trip.
Locale survives the redirect because it is a cookie plus a profile column rather than a URL
segment, which was chosen for exactly this reason.

**Why it is a blocker.** **It has never been exercised against a deployed Supabase project.**
Not once, across every phase. The redirect allow-list, the callback URL, custom SMTP, cookie
rotation on a real domain — all designed, none run.

**Remaining risk.** Supabase's built-in email sender is rate-limited to a handful of messages an
hour and is not a beta-grade channel. An invite wave will hit it, and magic link is the only
authentication method the web app implements — so email is on the critical path.

**Verification.** The nine-step walk in `runbooks/10-first-production-deployment.md`
§Verification. Step 6 is the one that matters.

---

## Web application — Solid

**Evidence.** 19 routes, 211 tests, clean build. Server Components by default; the only client
islands are the four that genuinely need one. Route-shaped loading skeletons, real empty states,
error and not-found boundaries. The landing page's argument renders without touching the
database — only the calendar suspends.

**Remaining risk.** The bracket renders all 127 slots of a 128-draw at once. Correct, slow, and
never measured on a mid-range phone.

---

## Data provider integration — Built, unverified

**Evidence.** `packages/provider-rapidapi` has REST and socket transports with token expiry
treated as routine rather than as an error, and reconnection deliberately *not* deduplicating
because the event log's content-derived key is the stronger implementation. `ingest-events` is
an idempotent front door. One real tournament captured and replayed: **Geneva 2025**.

**Why not Solid.** Geneva had **no retirements, walkovers, withdrawals or suspensions**, so the
entire disruption pipeline has never met real data. The captured fixture has dates but no start
times, so every match began at the same instant — which means the three-check design
(morning / live / evening) is the least proven thing in the product and its test count should
not be read as evidence otherwise.

No RapidAPI key has ever been used from a deployed process.

---

## Ingestion — Absent. **BLOCKER (deferrable)**

ADR-0018 decided the socket lives in one always-on container. **That container does not
exist** — no `Dockerfile`, no `apps/listener`, no host config anywhere. This is the gap the ADR
names in its own Context: *"What does not exist is a place for the socket to live."*

You are writing a small new application, not deploying an existing one.

**Deferrable, at a stated cost.** With `reconcile-results` armed, results arrive by REST sweep
and lag by the sweep interval instead of arriving live. Acceptable for an invited beta. Not
acceptable for public launch — live scores during a match are most of why anyone opens the
product.

**→ `runbooks/RAILWAY-WORKER.md`.**

---

## Settlement scheduling — Absent. **BLOCKER**

The highest-value unfinished item for several phases, unfinished because it is infrastructure
rather than code. Engine built, extracted, integration-tested against real Postgres including a
lucky-loser replacement. **Nothing invokes it.** Every `pg_cron` call in the repository is a
comment.

Until it runs: no result is frozen into a league, `previous_score` is null forever, the Daily
Check is permanently quiet, season standings never move.

**→ `runbooks/SETTLEMENT-SCHEDULING.md`.** Cron expressions and a seven-step verification.

---

## Edge function deployability — Absent. **BLOCKER**

**Found while writing this handoff, and the most insidious of the four** because it fails
*after* a successful deploy.

`settle-slate` imports `npm:@matchread/core@^0.1.0`; `settle-tournament` imports
`npm:@matchread/settlement@^0.1.0`. Neither is published. `settlement` and `i18n` are
`"private": true`, and `core` depends on `i18n` through `workspace:*`, which npm cannot resolve.
No import map, no vendored bundle, no publish step in CI.

`supabase functions deploy` succeeds; the function 500s on first invocation with a stack trace
about a module rather than about settlement.

Three costed options in `runbooks/SETTLEMENT-SCHEDULING.md` §STOP. If you are building the
Railway container anyway, invoking `settleAll` from it is the cheapest total answer — the
monorepo resolves `workspace:*` natively and the problem disappears.

---

## Monitoring — Partial

**Evidence.** The Founder Dashboard is a real monitor: one sentence at the top, then evidence,
with every threshold asserted in one file so the page has no opinions of its own. Health views
exist — `settlement_runs`, `draw_settlement_health`, `provider_freshness`,
`disruption_health`, `daily_check_measurement`.

**Gaps.** No error tracking anywhere; a client-side exception is invisible. No uptime check —
nothing tells you the site is down, a member does. No alerting; the dashboard is pull-only, so
someone has to open it.

**→ `docs/MONITORING.md`.** Specification, not documentation.

---

## Analytics — Absent

`apps/web` sends no events. PostHog exists only in `apps/mobile`. There is no activation
funnel, no retention measurement, no way to tell whether the Daily Check is working — which is
notable because *"does this make the user care more about tomorrow's matches?"* is the
product's own test question.

**→ `docs/ANALYTICS-PLAN.md`.** Specification for greenfield work.

**Not a blocker,** and it is the first thing to build in week two: a beta you cannot measure
teaches you less than it costs.

---

## Accessibility — Partial

**Evidence.** Six markup defects found and fixed in the bracket. Colour contrast measured
mechanically across every pair the app renders — 48 token assertions, up from 17. Two real
WCAG 1.4.11 failures found and fixed: interactive boundaries at 1.25:1 and the bracket's void
indicator at 1.56:1. The WTA accent (2.10:1 on white) is quarantined behind three assertions.

**Gap.** **No screen reader has ever been used.** Zero minutes of VoiceOver, NVDA or TalkBack.
Three of the fourteen required surfaces audited even at markup level. Unchecked: 200% scaling,
400% reflow, Windows High Contrast Mode.

The specific unknown that matters: a bracket option's accessible name is now eight
comma-separated clauses and a member fills 127 of them on a Slam draw. Whether that is usable
or merely correct cannot be established by reading the DOM.

**→ `docs/SCREEN-READER-PROTOCOL.md`.** A script written to be executed; never executed.

---

## Internationalization — Partial

**Evidence.** 427 keys, en/es/ja complete, gated in CI. Compile-time-checked interpolation —
ICU was rejected because its parameters live inside nested braces where TypeScript cannot
reach them, so a forgotten parameter would compile and ship `{gap}` into a headline. CLDR
plurals. A seven-timezone, three-locale league test.

**Gap.** **15 files still render English literals** — named in `AWAITING_SWEEP` in
`apps/web/tests/consistency.test.ts`, with an assertion that the list cannot grow. The league
home is among them, which is the screen a member opens daily. `apps/mobile` is entirely
untranslated.

**One thing to flag.** The Spanish and Japanese for roughly 100 keys were authored by the
Founding Engineer role, not by a native speaker. The English is reviewable by anyone on the
team; those two are not. **Have someone who reads them go through `es.ts` and `ja.ts` before
a Spanish or Japanese user sees the product.**

---

## Privacy — Absent

`profiles.deleted_at` exists for a GDPR soft delete and **nothing implements erasure.** No
privacy policy. `profiles.time_zone` is stored and is coarse location data that should be
named as such. No data export.

**Beta:** acceptable as a documented acceptance for invited members. **Public:** a legal
requirement, and the technical facts a lawyer needs are: email via auth, profile, league
membership, bracket picks, timezone, locale, operational events. No analytics events today
because there are none.

---

## Operations & recovery — Built, unverified. **BLOCKER**

**Evidence.** Ten runbooks with a consistent shape and a severity model where *stale* is S2 and
*false* is S1. Two rules that survive every incident: recompute freely, confirm before you
emit; and a push cannot be un-sent, so no runbook replays notifications. `draw_entry_changes`
is a complete audit trail.

**Why it is a blocker.** **No restore has been rehearsed.** A backup nobody has restored is a
hypothesis, and this is the most-skipped item on any list like this. Confirm the plan includes
PITR — daily snapshots alone mean a bad settlement run is recoverable only to the previous
midnight, and settlement writes to member-visible scores.

**Remaining risk.** No runbook has been used in anger. Their own README says so: *"A runbook
that survives its first incident unchanged was probably not read."* Edit every one you use.

There is also **no staging environment.** The first time a migration meets a database with real
users is production. Mitigated by a from-zero local run plus a manual backup; not solved.

---

## Private beta readiness — Not ready

**Four blockers**, none of which is a design question:

1. **Edge function module resolution.** Do this first; it is a precondition for 2.
2. **Settlement scheduling.**
3. **Auth round trip verified on a deployed project.**
4. **A rehearsed restore.**

Plus **one decision**: build the listener now, or open on the REST sweep and accept lagging
scores. Write down which, and who accepted it.

Everything else is configuration or verification. `docs/LAUNCH-CHECKLIST.md` is the sequence;
`ENGINEERING-HANDOFF.md` §8 is the week.

**Realistic estimate:** one week for a competent engineer with founder access on day one, and
the week is mostly waiting on verification rather than writing code.

---

## Public launch readiness — Not ready

Everything above, plus:

1. **The listener actually built.** Lagging scores are survivable for invited friends and not
   for strangers.
2. **A privacy policy and an erasure path.**
3. **Error tracking and analytics.** Operating a public product on member reports is not
   operating it.
4. **A screen reader session.**
5. **The i18n sweep finished**, and Spanish and Japanese reviewed by people who read them.

And two that are unmeasured rather than absent: device performance on a mid-range phone, and
load behaviour above beta scale. Settlement is ~10 minutes of CPU per million brackets,
single-threaded and measured, which is fine now and is the number that decides when
`settle-tournament` has to move to the container per ADR-0018.
