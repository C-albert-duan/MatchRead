# Verification matrix

What is actually proven, where, and by what. One row per critical capability.

**The rule: unavailable verification is never recorded as passed.** A blank cell means nobody
has done it. Several rows are blank across three of four columns, and that is the honest state
of a product that has never been deployed.

## Legend

| | Meaning |
|---|---|
| **✓** | Executed and passing |
| **✗** | Executed and failing |
| **—** | Not applicable at this layer |
| *(blank)* | **Never executed** |

**Staging does not exist.** The column is retained because the absence is itself the finding:
every capability that would be proven there is proven locally or in production, with nothing in
between. Recorded as a risk in `FINAL-ENGINEERING-READINESS.md`.

---

## Platform

| Capability | Local | CI | Staging | Prod | Evidence | Remaining risk |
|---|---|---|---|---|---|---|
| Clean-clone install | ✓ | ✓ | | | `pnpm install --frozen-lockfile` on a fresh clone | `pnpm-workspace.yaml` is load-bearing; without it `pnpm -r` silently recurses over one package |
| Lint | ✓ | ✓ | | | `pnpm lint`, `--max-warnings=0`, includes import boundaries | |
| Typecheck | ✓ | ✓ | | | `pnpm typecheck`, strict, `noUncheckedIndexedAccess` | |
| Unit suite | ✓ | ✓ | | | core 351 · web 211 · i18n 43 · tokens 48 | |
| Web build | ✓ | ✓ | | | `pnpm --filter @matchread/web build`, 19 routes | Build ≠ runtime. No page has served a real request |
| Generated types current | ✓ | ✓ | | | Regenerated from migration zero and diffed, **both copies** | Byte-identical duplication remains a known weakness |

## Database

| Capability | Local | CI | Staging | Prod | Evidence | Remaining risk |
|---|---|---|---|---|---|---|
| Migrations 0001–0027 | ✓ | ✓ | | | pgTAP from migration zero, PostgreSQL 16 | |
| **Migration 0028** (withdrawal) | | | | | Plan reconciles. **Suite never executed** | Unknown |
| **Migration 0029** (operator refs) | | | | | Plan reconciles. **Suite never executed** | Unknown |
| **Migration 0030** (replacement search) | | | | | Plan reconciles. **Suite never executed, written with no database available** | **Least-verified code in the repository** |
| Plan reconciliation | ✓ | ✓ | | | `check-test-plans.py` → 31 files | Proves counts are consistent, not that SQL is correct |
| RLS on every table | ✓ | ✓ | | | Asserted; mutation-tested (`using (true)` fails suite 22) | Never faced a real authenticated user |
| Pick secrecy before lock | ✓ | ✓ | | | Policy assertions, both directions | |
| Foreign keys | — | — | | | **None ever asserted** — `information_schema` reports zero FKs to `authenticator` | A `pg_catalog` sweep would be cheap |
| Backup | | | | | | |
| **Restore** | | | | | **Never rehearsed** | **Beta blocker** |

## Authentication

| Capability | Local | CI | Staging | Prod | Evidence | Remaining risk |
|---|---|---|---|---|---|---|
| Magic-link request | ✓ | — | | | Local Supabase | |
| **Callback on a deployed project** | | | | | | **Beta blocker** |
| `?next=` preserved | ✓ | — | | | Locally | Step 6 of runbook 10's walk is the real test |
| Session survives refresh | ✓ | — | | | Locally | Middleware rotation on a real domain unproven |
| Locale survives the round trip | ✓ | ✓ | | | 43 i18n tests; cookie chosen for this reason | |
| Custom SMTP | | | | | | Built-in sender is rate-limited and not beta-grade |
| Founder allowlist gates | ✓ | ✓ | | | pgTAP; 404 not 403, asserted | Never seeded in production |

## Product

| Capability | Local | CI | Staging | Prod | Evidence | Remaining risk |
|---|---|---|---|---|---|---|
| League creation | ✓ | ✓ | | | Validation + use-case + policy tests | |
| Invite acceptance | ✓ | ✓ | | | Token hashed at rest, shown once | Never travelled through a real group chat |
| Bracket editing | ✓ | ✓ | | | Editor tests + 20 accessibility assertions | 127 slots at once, never measured on a phone |
| Autosave | ✓ | — | | | Component tests | **Never tested on a lossy connection** |
| Locking | ✓ | ✓ | | | Clock-enforced in RLS since 0013 | |
| **Settlement** | ✓ | ✓ | | | 28 integration tests against real Postgres — **skip without a database, and skipped in this environment** | **Not scheduled. Beta blocker** |
| **Settlement scheduled** | | | | | | **Beta blocker** |
| **Edge functions deployable** | | | | | | **Beta blocker — `npm:@matchread/*` cannot resolve** |
| Daily Checks | ✓ | ✓ | | | 43 pulse tests + component tests | **Never seen real start times** — the fixture has none, so the three-check design is the least proven thing here |
| Season points | ✓ | ✓ | | | Core + policy tests | Awarded only by settlement, which does not run |
| Timezone rendering | ✓ | ✓ | | | 18 tests: 7 cities, 3 locales, half-hour offset, opposite-hemisphere DST, a 25-hour day | No real user has a timezone; detection on first visit is unbuilt |
| i18n | ✓ | ✓ | | | 427 keys, 3 locales complete, build-gated | **15 files still English** (`AWAITING_SWEEP`). es/ja authored by a non-native speaker |
| Founder Dashboard | ✓ | ✓ | | | Repository shaping + component render | Reports proxies for Daily Check health, not the thing itself |
| Disruption workflow | ✓ | ✓ | | | 26 component tests; write path pgTAP **unexecuted** | Never run against real data |
| **Lucky loser** | ✓ | | | | Settlement integration case written; **skipped, no database** | Search SQL never executed |

## Data provider

| Capability | Local | CI | Staging | Prod | Evidence | Remaining risk |
|---|---|---|---|---|---|---|
| REST transport | ✓ | ✓ | | | Unit tests against recorded payloads | |
| Socket transport | ✓ | ✓ | | | Unit tests; token expiry treated as routine | **No process holds it. Does not exist deployed** |
| Draw import | ✓ | ✓ | | | Property-tested across 11 draw sizes × 10 tournaments, plus adversarial cases. Fails closed | |
| One real tournament | ✓ | — | | | **Geneva 2025**, captured and replayed | **No retirement, walkover, withdrawal or suspension** — the disruption pipeline has never met real data |
| Live feed from a deployed process | | | | | | No key has ever been used in production |
| Quota behaviour | | | | | | Reconciliation cadence is a guess ADR-0018 asks be replaced by measurement |

## Operations

| Capability | Local | CI | Staging | Prod | Evidence | Remaining risk |
|---|---|---|---|---|---|---|
| Preflight | — | — | | | `scripts/preflight.mjs`, anon-only by design | Never run against a real project |
| Domain + HTTPS | | | | | `vercel.json` sets HSTS and four other headers | Never served |
| Rollback | | | | | `runbooks/08` | Never performed |
| Nine incident runbooks | — | — | — | | Written from code contracts | **None used in anger.** Edit each after first use |
| Monitoring | | | | | Founder Dashboard only | No error tracking, no uptime check, no alerting |
| Analytics | — | — | — | — | **None in `apps/web`** | Cannot measure activation or retention |

## Quality

| Capability | Local | CI | Staging | Prod | Evidence | Remaining risk |
|---|---|---|---|---|---|---|
| Colour contrast | ✓ | ✓ | — | — | 48 token assertions across every rendered pair | |
| Bracket a11y markup | ✓ | ✓ | | | 20 assertions, names in 3 locales | Correct ≠ usable |
| **Screen reader review** | | | | | **Zero minutes of VoiceOver, NVDA or TalkBack** | The bracket's name is 8 clauses × 127 slots. Unknown |
| 200% / 400% reflow | | | | | | Bracket scrolls horizontally by design |
| Windows High Contrast | | | | | | Pick indicator is a border; High Contrast overrides borders |
| Mobile browser | | | | | Components reflow at 390px in the showcase | **Never opened in a real mobile browser** |
| Device performance | | | | | | No measurement on any real hardware |

---

## Reading this matrix

**Three patterns worth naming.**

The **local column is dense and the production column is empty.** That is not a criticism —
it is what a pre-deployment product looks like — but it means the ratio of *things believed* to
*things demonstrated* is about to change sharply, and the first week of production will
generate more findings than the last three phases combined.

**Every blank in the Prod column that is also blank in Staging is a first-time-in-production
event.** There are eleven. `LAUNCH-CHECKLIST.md` orders them so the cheap ones fail first.

**Four rows carry an executed test that could not run here.** Settlement, lucky loser, and the
three unexecuted migrations. They are written, plan-reconciled, type-checked, and unproven. The
project's own conclusion from Phase 7 applies: *test infrastructure CI cannot execute
accumulates defects silently.*

## How to use it

1. **Day 1:** fill the CI column for migrations 0028–0030 by running `pnpm test:db`. Expect
   failures. They are the most valuable thing you will find that week.
2. **Day 2–3:** fill the Prod column for auth. It is the oldest unverified item in the project.
3. **Day 5:** fill it for settlement — all seven steps of
   `runbooks/SETTLEMENT-SCHEDULING.md` §4.
4. **Before opening:** restore, and the mobile-browser row.
5. **Keep it current.** A matrix that stops being edited becomes a description of the team's
   mood rather than of the product — the same rule `KNOWN_WEAKNESSES.md` states about itself.
