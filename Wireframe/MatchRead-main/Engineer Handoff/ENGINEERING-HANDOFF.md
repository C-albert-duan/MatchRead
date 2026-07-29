# MatchRead — Engineering Handoff

**For:** the incoming Launch Engineer.
**From:** the Founding Engineer role, ending with this document.
**Written:** at migration head `0030_replacement_search.sql`.

You have never seen this repository. This document assumes that and nothing else. It is
the entry point: read it once end to end before touching anything, then work from the
runbooks it routes you to.

**The standard this document is held to:** no operational step required to run MatchRead
exists only in a chat log, a milestone report, or somebody's memory. Where a step does not
exist at all, this document says so rather than describing it as if it did.

---

## 0. Start here — your first hour

```bash
git clone https://github.com/MatchRead/MatchRead.git && cd MatchRead
node -v                       # must be >= 20.11
corepack enable && corepack prepare pnpm@9.6.0 --activate
pnpm install --frozen-lockfile
pnpm lint                     # expect: silence
pnpm typecheck                # expect: silence
pnpm -r test                  # expect: ~674 passing, ~28 skipped (see §5)
```

- [ ] The above six commands succeed on a clean clone.
- [ ] Read `docs/KNOWN_WEAKNESSES.md` end to end. It is ordered by what hurts most on
      launch day and it is current. It is the most useful document in the repository.
- [ ] Read `docs/adr/0018-provider-ingestion-topology.md`. It is the deployment decision
      and it names its own open items.
- [ ] Read §3 of this document — *what is not built* — before planning anything.
- [ ] Read `docs/LAUNCH-CHECKLIST.md`. That is the private-beta sequence; this document is
      the context you need to execute it.

**Do not** apply migrations to production, arm any scheduler, or connect the domain until
you have finished §§1–4 below. Two of the things you will need do not exist yet, and
finding that out on deploy day is avoidable.

---

## 1. What MatchRead is

A tennis prediction platform where a group of people fill in tournament brackets together
and keep the group across a whole season. **Not gambling and not fantasy** — no entry fees,
no wagering, no odds. The point is getting better at reading tennis.

Three product decisions, all enforced in Postgres rather than in the interface, because
they are the product's integrity rather than its styling:

1. **Picks are secret until the draw locks.** The community split on a match is hidden from
   you until you have picked it. Enforced by RLS.
2. **Rating scores difficulty, not volume.** Expected value at the model's own price is
   exactly zero, so no strategy farms rating.
3. **Comments open only after a match finishes, and only inside that match.** No global
   feed, no DMs.

The sentence the product is built around is *"I wonder what happened in my league today"* —
the Daily Check, which is a computed object rather than a slogan.

### Current product scope

**In scope for the private beta:** the web app. Landing, sign-in, leagues (single-tournament
and season), tournaments, brackets, standings, Daily Checks, between-tournament state, the
winner artifact, the Founder Dashboard, and the operator disruption console. English,
Spanish and Japanese.

**Out of scope:** the mobile app (`apps/mobile` exists and is entirely untranslated),
notifications (built since migration 0013, connected to nothing, deliberately — the Daily
Check is a pull habit by choice), and the AI layer (`ask-matchread` exists; no boundary
document, no caching, no deterministic fallback).

---

## 2. Current engineering status

Honest, and the distribution matters more than the summary: **this product was built
engine-first.** The domain layer, the schema and the security model are unusually mature
for a pre-launch product. Operations are thin. That is the correct shape for the work that
was done and it is also exactly why the last mile is short but not skippable.

| Layer | State |
|---|---|
| Domain logic (`packages/core`) | Mature. 351 tests, zero dependencies, every number in the product comes from here |
| Schema + RLS | Mature. 31 migrations, 31 pgTAP suites |
| Settlement engine (`packages/settlement`) | Built and integration-tested against real Postgres. **Not scheduled** |
| Provider integration (`packages/provider-rapidapi`) | REST and socket transports written and tested. **No deployable process** |
| Web app (`apps/web`) | Beta-grade. 19 routes, 211 tests, trilingual |
| Internationalization | 427 keys, en/es/ja complete, build-gated. 15 files still carry English literals — see `AWAITING_SWEEP` in `apps/web/tests/consistency.test.ts` |
| Accessibility | Contrast measured mechanically. **No screen reader has ever been used** |
| Analytics | **None in `apps/web`.** PostHog exists only in `apps/mobile` |
| Error tracking | **None anywhere** |
| Monitoring | The Founder Dashboard, and nothing external |
| Deployment | **Nothing is deployed. There is no production.** |

### What has been verified locally

- Clean install, lint, typecheck, full unit suite, and `pnpm --filter @matchread/web build`.
- The pgTAP suite from migration zero against PostgreSQL 16 + pgTAP — **last executed at
  Phase 7 (789 assertions, 27 files). Three suites have been added since (0028, 0029, 0030)
  and have never been run.** Plans reconcile, which proves the assertion counts are
  consistent and nothing about whether the SQL is correct.
- The settlement engine against real Postgres, including a lucky-loser replacement
  end to end.

### What has been verified against real tennis data

One tournament: **Geneva 2025**, captured and replayed (`docs/M3.5.3-GENEVA.md`,
`fixtures/geneva-2025/`). It produced real findings. It also had **no retirements,
walkovers, withdrawals or suspensions**, so the entire disruption pipeline has never met
real data — which is why the operator console exists and why §3 lists it as a risk rather
than a feature.

The Reality Milestone fixture has dates but no start times, so every match in it began at
the same instant. **The three-check design (morning / live / evening) is therefore the
least proven thing in the product**, and its test count should not be read as evidence
otherwise.

### What has never been verified in production

Everything. There has never been a production environment. Specifically and importantly:

- **The magic-link auth round trip against a deployed Supabase project.** Never once.
- **The live provider feed.** No RapidAPI key has been used from a deployed process.
- **Any scheduled job.** Every `pg_cron` call in this repository is a comment.
- **A backup restore.**

---

## 3. What is not built — read this before planning

Three things the beta needs that do not exist. Two are blockers. None of them is a design
question; all three are work.

### 3.1 BLOCKER — settlement is not scheduled

The engine exists, is extracted to `packages/settlement`, and has integration tests. Nothing
invokes it. Until a schedule exists: no result is ever frozen into a league,
`previous_score` stays null forever, the Daily Check is honest and permanently quiet, and
season standings never move.

This has been the highest-value unfinished item for several phases and it has stayed
unfinished because it is infrastructure rather than code.

**→ `docs/runbooks/SETTLEMENT-SCHEDULING.md`** — written for this handoff, with the exact
cron expressions and a seven-step verification.

### 3.2 BLOCKER — there is no deployable ingestion listener

`packages/provider-rapidapi` contains a tested socket transport. ADR-0018 decided it should
live in one always-on container. **That container does not exist.** There is no
`Dockerfile`, no `apps/listener`, no `railway.json`, no `fly.toml` anywhere in the
repository — I checked, and this is the gap ADR-0018 names in its own Context section:
*"What does not exist is a place for the socket to live."*

What this means practically: **you are writing a small new application, not deploying an
existing one.** It is genuinely small — ADR-0018 §Tier 1 specifies a process that holds the
socket and `POST`s to `ingest-events`, parsing nothing and writing to no table — but it is
not a configuration task and should not be scheduled as one.

**→ `docs/runbooks/RAILWAY-WORKER.md`** for what it must do and what it must not.

**A beta can open without it**, at a cost stated in that runbook: results arrive only via
the REST reconciliation sweep, so scores lag by the sweep interval instead of arriving
live. For an invited beta that is an acceptable trade. It is not acceptable for a public
launch, because live scores during a match are most of why anyone opens the product.

### 3.3 Not a blocker — no analytics and no error tracking in the web app

`apps/web` sends no events and reports no exceptions. A client-side error is invisible.
You will be operating a beta on the Founder Dashboard and member reports.

**→ `docs/ANALYTICS-PLAN.md`** and **`docs/MONITORING.md`**. Both are plans for greenfield
work, not documentation of existing wiring. Do not read them as descriptions of the current
state.

---

## 4. How it works — the shape of the system

```text
RapidAPI tennis provider
      │  socket (live) + REST (sweep)
      ▼
Listener container  ─── DOES NOT EXIST YET (§3.2) ───┐
      │  POST, forwards only, parses nothing         │
      ▼                                              │
supabase/functions/ingest-events  ◄──────────────────┘
      │  idempotent, content-derived dedupe
      ▼
Supabase Postgres — platform_events, then projections
      │
      ▼
Settlement engine (packages/settlement)  ─── NOT SCHEDULED (§3.1)
      │  grades picks, writes snapshots, freezes leagues
      ▼
Leagues · brackets · bracket_snapshots · daily_check_log
      │
      ▼
apps/web (Next.js on Vercel, Server Components)
      │
      ▼
Members  ·  Founder operations (/founder, /founder/disruption)
```

### Trust boundaries — the four that matter

1. **The client is never trusted and never the source of truth.** Locks, pick secrecy and
   comment timing are enforced by Postgres triggers and RLS. If you find yourself adding a
   rule to a component, it belongs in the database or in `packages/core`.
2. **`apps/web` holds only the anon key.** It has no service-role credential and must never
   be given one. RLS is what protects the data behind the anon key.
3. **The listener holds provider credentials and no database credential** beyond the token
   it needs to call `ingest-events`. Provider keys are therefore unreachable from the web
   app by construction.
4. **Internal ids never reach the wire.** Every page, form and Server Action carries a slug
   and an external ref; resolution to a UUID happens server-side. This is why migrations
   0029 and 0030 exist as ref-addressed wrappers over 0028.

### Applications and packages

| Path | What | Beta-critical |
|---|---|---|
| `apps/web` | The product. Next.js 14 App Router, Server Components by default | **Yes** |
| `apps/mobile` | Expo/React Native. Untranslated | No |
| `apps/mission-control` + `packages/mission-control` | Operator tooling from M3.5.1 | No |
| `packages/core` | Domain logic. Rating, grading, brackets, the Daily Check, time. **Zero dependencies** — runs in the app, in Deno edge functions and in React Native | **Yes** |
| `packages/settlement` | The settlement engine, extracted so it can be executed and tested outside Supabase | **Yes** |
| `packages/provider-rapidapi` | REST + socket transports, parsing, payload types | **Yes** |
| `packages/i18n` | 427 keys × en/es/ja, compile-time-checked interpolation, CLDR plurals | **Yes** |
| `packages/tokens` | Colour, type, spacing. The only place colours live | **Yes** |
| `supabase/migrations` | 31 files, `0001` → `0030`. Ordered, not idempotent as a set | **Yes** |
| `supabase/tests` | 31 pgTAP suites | **Yes** (CI) |
| `supabase/functions` | 6 edge functions — see §6 | 4 of 6 |

### Infrastructure, and who owns what

| Responsibility | Host | Status |
|---|---|---|
| Web app | Vercel | Not deployed |
| Database, auth, RLS, edge functions, cron | Supabase (`opugihofwvunwkpcmboq`) | Not migrated |
| Always-on listener | **Railway** — chosen, see below | Does not exist |
| Periodic jobs | `pg_cron` inside Supabase | Not armed |
| CI | GitHub Actions | Working |
| Provider | RapidAPI | Key never used |
| Analytics | PostHog (recommended) | Not connected |
| Error tracking | Sentry (recommended) | Not connected |
| Uptime | Any external checker | Not connected |
| Domain | `matchreadtennis.com` | Not connected |

**Railway versus Render — decided.** ADR-0018 said "Fly.io or Railway" and left it open.
**This handoff closes it: Railway, one instance.** The reasons are that the founder already
holds a Railway account, that one container does not justify comparing hosts, and that the
listener's blast radius is a single HTTP call so the choice is reversible in an afternoon.
**Render is not used.** If you find a Render service, it is not part of this system —
one production responsibility, one owner.

---

## 5. Running it locally

```bash
pnpm install --frozen-lockfile
cp .env.example .env                    # fill in per docs/ENVIRONMENT-VARIABLES.md
supabase start
pnpm db:migrate                         # supabase db push — all 31, in order
pnpm db:types                           # regenerates BOTH copies; expect no diff
pnpm test:db                            # ./scripts/db-run.sh — 31 pgTAP suites
pnpm --filter @matchread/web dev
```

### Expected test output

| Command | Expect |
|---|---|
| `pnpm -r test` | core 351, web 211, i18n 43, tokens 48, settlement 21 + 28 skipped |
| `pnpm test:db` | 31 files, all plans reconciling |
| `pnpm i18n:report` | en/es/ja complete at 427 keys; 32 Spanish advisories |
| `python3 scripts/check-test-plans.py` | `31 files, plans reconcile` |

**The 28 skipped settlement tests are not a problem — they are the design.** They skip when
no migrated PostgreSQL is reachable and say so loudly. If you see them skip in CI, CI's
database step is broken.

**The 32 Spanish advisories are not a problem either.** Every pluralising Spanish key omits
the `many` form CLDR 42 added for exact millions. Correct for every number this product can
produce. Advisories never block a build; defects do.

### Getting a database without Docker

`./scripts/db-run.sh` connects as `authenticator` deliberately — that is how PostgREST
connects, and running the suite as superuser would make `tests.as_jwtless()`
indistinguishable from an admin connection. One consequence to know rather than fix:
**`information_schema` reports zero foreign keys to `authenticator` because it filters on
effective privilege**, so `fk_ok`, `col_is_fk`, `has_fk` and `has_pk` cannot be used in this
suite. Structural key assertions must query `pg_catalog`;
`supabase/tests/27_locale.test.sql` carries the worked example.

---

## 6. Repository, CI and release

**GitHub is the source of truth: `https://github.com/MatchRead/MatchRead.git`.** Any ZIP
archive of this repository — including the one accompanying this handoff — is an archival
snapshot for convenience, never a working copy to branch from.

### Versions

`node >= 20.11` (enforced by `package.json` `engines`, **not** enforced by Vercel — set it
in project settings). `pnpm@9.6.0` via `packageManager`. Use `corepack`, not a global pnpm.

> `pnpm-workspace.yaml` must exist. pnpm does not read the npm-style `workspaces` array in
> `package.json`, and without the file `pnpm -r test` silently recurses over a single
> package — CI passed for a whole milestone without ever compiling `packages/core`. If you
> ever see a suspiciously fast green CI, check this file first.

### Branching and protection

- [ ] Protect `main`: no direct pushes, PR required, linear history.
- [ ] Required status checks: **Lint/types/unit tests**, **Web build**, **RLS and integrity
      suite**, **Generated types are current**. All four exist in `.github/workflows/ci.yml`.
      The EAS mobile job should **not** be required — it is unrelated to a web beta and
      skips without `EXPO_TOKEN`.
- [ ] Squash merges. The commit history is the changelog.
- [ ] Release tags `v0.1.0-beta.N` on `main`, cut after a green CI run, never from a branch.
- [ ] Emergency fix: branch from `main`, PR with one reviewer, merge, tag. **Do not push to
      `main` directly even in an incident** — Vercel deploys from `main` and an unreviewed
      deploy during an incident is how a second incident starts. Roll back at Vercel first
      (instant), then fix at leisure. See `docs/runbooks/08-emergency-rollback.md`.

### Generated files — committed, never hand-edited

| File | Generated by | Rule |
|---|---|---|
| `apps/web/lib/database.types.ts` | `pnpm db:types` | Committed. Never edit |
| `apps/mobile/src/lib/database.types.ts` | same | Committed. **Byte-identical to web's** |
| `pnpm-lock.yaml` | pnpm | Committed |

`pnpm db:types` writes mobile's and copies it to web. CI regenerates and diffs **both** —
before Phase 7 it diffed only mobile's, which is how a migration once shipped alongside a
web app that could not see a new column. The duplication itself is a known weakness
(`KNOWN_WEAKNESSES.md`); the fix is a shared package and it was deliberately not attempted
in a change that also touched 215 strings.

### CI secrets

Only `EXPO_TOKEN`, and only if you want mobile preview builds. **The database job needs no
secret** — it builds Postgres from migration zero in a service container, which is the
property that makes it trustworthy.

---

## 7. Document index

Everything below exists. Where a document was written for this handoff it is marked NEW;
where it predates the handoff it has been read and is accurate.

### Start with these

| Document | For |
|---|---|
| **This file** | Orientation, status, first week |
| `docs/KNOWN_WEAKNESSES.md` | Everything wrong, ordered by launch-day pain |
| `docs/LAUNCH-CHECKLIST.md` | The private-beta sequence, box by box |
| `docs/ENVIRONMENT-VARIABLES.md` | NEW — every variable, where it lives, what breaks |
| `docs/FINAL-ENGINEERING-READINESS.md` | NEW — area-by-area rating with evidence |
| `docs/VERIFICATION-MATRIX.md` | NEW — what is proven, where, and by what |

### Operations

| Document | For |
|---|---|
| `docs/runbooks/SETTLEMENT-SCHEDULING.md` | NEW — **blocker 1**. Cron, verification, failure |
| `docs/runbooks/RAILWAY-WORKER.md` | NEW — **blocker 2**. What to build and what not to |
| `docs/runbooks/10-first-production-deployment.md` | Supabase + Vercel first deploy. **Already excellent — do not rewrite** |
| `docs/MONITORING.md` | NEW — signals, thresholds, severity, routing |
| `docs/ANALYTICS-PLAN.md` | NEW — event taxonomy and what must never be sent |
| `docs/runbooks/README.md` | Incident index, severity model, the two rules |
| `docs/runbooks/01`–`09` | Nine incident runbooks. Written from code contracts, never used in anger |

### Architecture and decisions

`docs/ARCHITECTURE.md` · `docs/adr/0001`–`0020` · `docs/DESIGN-LANGUAGE.md` ·
`docs/INTERNATIONALIZATION.md` · `docs/ACCESSIBILITY.md` ·
`docs/SCREEN-READER-PROTOCOL.md` · `docs/PRODUCT_DECISIONS.md`

**Read ADR-0018 before deploying anything.** It is the deployment topology and it names its
own unresolved items honestly.

### History — read for context, never for current state

`docs/ROADMAP.md`, `docs/HANDOFF.md`, and the phase reports (`PHASE-*.md`, `M3.*.md`). They
are append-only milestone records. **`docs/HANDOFF.md` is superseded by this file** and
describes the product as of Milestone 2.5.

---

## 8. Your first week

Each day has a go/no-go. Do not carry a red gate forward — every one of them gates
something that is worse to discover later.

### Day 1 — Repository and comprehension

**Tasks.** The §0 checklist. Protect `main` and set the four required checks. Read
`KNOWN_WEAKNESSES.md`, ADR-0018, `ARCHITECTURE.md`. Get a local Supabase running and
`pnpm test:db` green from migration zero.

**Output.** A green local suite and a written list of anything in §§2–3 you disagree with.

**Founder input.** GitHub admin on `MatchRead/MatchRead`.

**GO if** all six §0 commands pass and `pnpm test:db` is green. **NO-GO if** the pgTAP suite
fails — three of its suites have never been executed, so a failure here is expected rather
than alarming, and it is the single most valuable thing you will find this week. Fix it
before anything else.

### Day 2 — Supabase

**Tasks.** `docs/runbooks/10-first-production-deployment.md` §§1–4. Apply 31 migrations
stopping at the first error. `pnpm db:types` and confirm no diff. Configure magic-link auth,
the redirect allow-list and the site URL. **Seed the founder allowlist row.** Confirm
`pg_cron` is available on the plan — ADR-0018 lists this as an open item and Tier 2 depends
on it entirely.

**Output.** A migrated project, and `node scripts/preflight.mjs` passing against it.

**Founder input.** Supabase project access; the plan decision (PITR needs a paid tier).

**GO if** preflight passes and you can sign in on the *deployed* Supabase from a local web
app. **NO-GO if** `pg_cron` is unavailable — stop and read ADR-0018's fallback, because
Tier 2 then collapses into the container and that changes Day 4.

> **The founder allowlist is the step most likely to cost you an hour.** `app_is_founder()`
> gates `/founder`, `/founder/disruption` and every function in migrations 0028–0030, and
> the failure mode is a **404, not an error** — deliberately, so a stranger cannot discover
> the route, and confusingly if you have forgotten the row.

### Day 3 — Vercel and the domain

**Tasks.** Runbook 10 §5. Root directory `apps/web`. `apps/web/vercel.json` already supplies
framework, build command, install command, output directory and five security headers
including HSTS — **confirm Vercel is honouring it rather than its own defaults.** Deploy
Preview, validate, promote. Connect `matchreadtennis.com` and `www`. Add the production
callback to Supabase's redirect allow-list.

**Output.** A signed-in session on the real domain, surviving a refresh.

**Founder input.** Vercel and DNS access.

**GO if** the nine-step auth walk in runbook 10 §Verification passes on a phone, including
step 6 (landing back on the page you started from). **NO-GO if** step 6 lands on the home
page — `next` was dropped or the redirect was rejected. Check the allow-list first; a
rejected redirect falls back to home by design rather than erroring.

### Day 4 — Provider and ingestion

**Tasks.** `docs/runbooks/TENNIS-PROVIDER.md` for the key, headers and quota. Then the hard
part: **§3.2 — the listener does not exist.** Decide, explicitly and in writing, either to
build it now per ADR-0018 Tier 1, or to open the beta on the REST reconciliation sweep alone
and accept lagging scores. Arm the `pg_cron` Tier 2 jobs either way — the sweep is what
makes a single listener safe and it is what substitutes for the listener if you defer it.

**Output.** A real draw imported, `provider_freshness` reporting recent data, and a written
decision on the listener.

**Founder input.** The RapidAPI key and confirmation of the subscription tier's commercial
terms.

**GO if** one tournament's draw imported and `draws.structure_provenance` is
provider-authoritative rather than reconstructed. **NO-GO if** provenance is `reconstructed`
and you were expecting otherwise — a reconstructed draw must never be presented as
provider-authoritative, and the importer fails closed for exactly this reason.

### Day 5 — Settlement, monitoring, rehearsal

**Tasks.** `docs/runbooks/SETTLEMENT-SCHEDULING.md` end to end — this is blocker 1 and the
day exists for it. Then connect Sentry and PostHog (`MONITORING.md`, `ANALYTICS-PLAN.md`)
and an uptime check. Then rehearse: create a league, invite a second account, fill and
submit brackets, run a disruption **on a replay draw**, settle, and confirm the result
artifact and Daily Check movement.

**Output.** The seven-step settlement verification passing, and a rehearsed restore.

**GO if** a completed match moves a bracket score, writes a snapshot, moves league
standings, and produces Daily Check movement — all seven steps, in order.
**NO-GO on opening the beta if** the restore has not been rehearsed. A backup nobody has
restored is a hypothesis, and this is the most-skipped item on any list like this.

---

## 9. What the founder needs to do

For a non-technical reader. Nothing here requires running SQL or editing code.

| # | Account | What to do | What to send the engineer | Never do this |
|---|---|---|---|---|
| 1 | **GitHub** | Settings → Collaborators → add the engineer as **Admin** on `MatchRead/MatchRead` | Nothing — access is the deliverable | — |
| 2 | **Supabase** | Open the project → Settings → Team → invite the engineer as **Owner**. Then Settings → Add-ons → confirm the plan includes **Point-in-Time Recovery** | Nothing | Never paste the `service_role` key into chat, email or a document. The engineer reads it from the dashboard themselves |
| 3 | **Vercel** | Confirm it is connected to the GitHub account, then invite the engineer to the team | Nothing | — |
| 4 | **Railway** | Invite the engineer to the project | Nothing | — |
| 5 | **RapidAPI** | Open the tennis API subscription page → confirm the tier, the monthly quota, and that the terms permit **commercial and public** use | A screenshot of the plan page, quota included. **Not the key** | Never paste the API key into chat. Add it directly in Railway's variables panel, or let the engineer read it from RapidAPI |
| 6 | **Domain** | Give the engineer access to wherever `matchreadtennis.com` DNS is managed | The registrar name | Never share the registrar password. Add the engineer as a user instead |
| 7 | **Email** | Choose a transactional email provider (Resend or Postmark) and create an account | Nothing | — |
| 8 | **Analytics** | Create a PostHog project, EU region | Nothing | — |
| 9 | **Error tracking** | Create a Sentry project | Nothing | — |
| 10 | **Founder identity** | Tell the engineer **which email address is the founder account** | The email address | — |

**The rule for all ten: secrets travel through the platform that needs them, never through
a person.** If a key has been pasted into a chat window, it is compromised and must be
rotated — every rotation procedure is in `docs/ENVIRONMENT-VARIABLES.md`.

Item 5 is the one with a real decision in it. If the RapidAPI tier forbids commercial use
or its quota is below what the reconciliation cadence needs, that is a founder decision
about money and it blocks Day 4.

Item 7 matters more than it looks: **Supabase's built-in email sender is rate-limited to a
handful of messages an hour.** It is not a beta-grade channel and an invite wave will hit
the limit. Magic-link sign-in is the only authentication method the web app implements, so
email is on the critical path.

---

## 10. The limits of this handoff

Stated plainly, because a handoff that overstates itself is worse than a short one.

**Nothing in this repository has ever run in production.** Every runbook in
`docs/runbooks/` was written from the code's actual contracts rather than from experience,
and its own README says so. The first time each is used it should be edited afterwards; a
runbook that survives its first incident unchanged was probably not read.

**Three pgTAP suites have never been executed** (0028 withdrawal, 0029 operator, 0030
replacement search). Plans reconcile and types check. Neither is evidence the SQL is
correct. **Treat a failure on first run as the expected outcome**, not a surprise — Phase 7's
own conclusion was that test infrastructure CI cannot execute accumulates defects silently,
and these three are exactly that case.

**Migration 0030 and its suite were written without a database available at all.** They are
the least-verified code in the repository.

**No screen reader has ever been used.** `docs/SCREEN-READER-PROTOCOL.md` is a script
somebody must execute; the accessibility fixes it will validate were derived from reading
markup. Colour contrast *is* measured mechanically and asserted.

**The infrastructure identifiers in this handoff are as supplied by the founder and have
not been verified by me** — the GitHub URL, the Supabase project ref
`opugihofwvunwkpcmboq`, the Railway and RapidAPI accounts, `matchreadtennis.com`. I have had
no network access to any of them. Confirm each on Day 1 before building a plan on it.

**`docs/ANALYTICS-PLAN.md` and `docs/MONITORING.md` describe work that does not exist.**
They are specifications, not documentation. `apps/web` currently sends no events and reports
no exceptions.

**The three-check design has never seen real start times.** Its test count is not evidence.

---

## 11. Your responsibilities, and what you own from here

You own production. Concretely:

1. **The two blockers in §3**, in that order. Settlement first — it is smaller and it
   unblocks the product actually doing anything.
2. **Executing the three unexecuted pgTAP suites** and fixing what they find.
3. **The four verifications this handoff could not perform**: the auth round trip, the live
   feed, a scheduled job, a restore. Each becomes possible the moment an environment exists,
   so a deploy converts more open questions per hour than any code change available.
4. **Editing every runbook you use.** They are first drafts by definition.
5. **Deciding what the beta accepts.** §3.2's deferral, the missing privacy policy, the
   absent staging environment — these are all defensible for an invited beta and none of
   them is defensible silently. Write down what you accept and who accepted it;
   `docs/LAUNCH-CHECKLIST.md` has a sign-off block for exactly this.

**What you should not do in your first month:** sweep the remaining 15 English-literal
files, translate the mobile app, or build the AI layer. All three are real work, none is on
the beta path, and all three will look more attractive than writing a cron expression.
