# Monitoring

> **Specification, not documentation.** `apps/web` currently reports no exceptions and there is
> no uptime check, no alerting and no external monitor. The only monitor that exists is the
> Founder Dashboard, which is pull-only — somebody has to open it. Everything below marked
> **BUILD** does not exist.

## 1. The five states, and why they are five

The engineer must be able to tell these apart, because the response differs:

| State | Meaning | Severity |
|---|---|---|
| **Healthy** | Recent successful work, no failures | — |
| **Stale** | Correct and old. A scheduler stopped | **S2** |
| **Degraded** | One dependency is slow or partly failing; the product works | **S2** |
| **Partial** | A run touched some rows and not others. Re-run — it is idempotent | **S2** |
| **Failed** | Something is false, or a run errored | **S1** |

**Stale is an S2 and false is an S1, and the gap between them is the whole operating
philosophy** (`runbooks/README.md`). A blank screen is recoverable. A confidently wrong score is
not — members act on scores and share them.

## 2. Web — BUILD (Sentry)

| Signal | Threshold | Severity | Runbook |
|---|---|---|---|
| Server exception rate | > 1% of requests over 5 min | S1 | `08-emergency-rollback.md` |
| Client exception rate | > 2% of sessions | S2 | Triage in Sentry |
| Auth callback failure | **any** | **S1** | Redirect allow-list first |
| Server Action failure | > 5% of one action | S2 | Per-action |
| Route p95 | > 2s | S3 | |

**Auth callback failure is S1 at a single occurrence.** Every other threshold is a rate; this one
is not, because a member who cannot sign in cannot report that they cannot sign in.

**Sentry setup.** Client, server and edge configs; source maps uploaded at build with
`SENTRY_AUTH_TOKEN` (build-time only, never runtime); releases named from the git SHA so a
regression is attributable to a deploy. **Scrub before send:** `email`, `Authorization`, `cookie`,
any `token`, and — the one people forget — **invite tokens in URLs**, which appear in
`/join/{token}` and are a credential in a path.

## 3. Database

| Signal | Source | Threshold | Severity |
|---|---|---|---|
| Migration failure | deploy output | any | **S1** — `runbooks/07` |
| Connection saturation | Supabase | > 80% | S2 |
| Slow queries | `pg_stat_statements` | p95 > 1s | S3 |
| Storage growth | Supabase | > 80% of plan | S2 |

**Known:** standings got heavier in Phase 4 — a lateral subquery per row plus two window
functions. Irrelevant at league scale, first thing to revisit if a league reaches thousands.

RLS failures are **not observable**. A policy that denies too much returns an empty page; one that
denies too little returns more data and the happy path looks fine. This is why the pgTAP suite is
the control and monitoring is not.

## 4. Listener — BUILD (does not exist; see `runbooks/RAILWAY-WORKER.md`)

| Signal | Source | Threshold | Severity |
|---|---|---|---|
| Heartbeat | `provider_freshness` | silent > 5 min during play | S2 |
| `/healthz` | Railway | non-200 > 2 min | S2 |
| Restart count | Railway | > 3/hour | S2 |
| Quota exhausted | provider 429 | any | **S1** — live *and* sweep both stop |

## 5. Settlement

Thresholds are asserted once, in `apps/web/server/repositories/founder.ts`. **Change them there,
not here** — the dashboard has no opinions of its own so that every judgement about what counts
as unhealthy is reviewable in one place.

| Signal | Healthy | Alert |
|---|---|---|
| Last successful run | < 30 min during play | **S1** at 60 |
| Failed runs | 0 | **S1** at ≥ 1 |
| Stalled (> 1h running) | 0 | **S1** at ≥ 1 |
| **Unfrozen leagues** | **0** | **S1** at ≥ 1 |
| Snapshot freshness | today | S2 if yesterday is newest |
| Partial runs | 0 | S2 |

**`Unfrozen leagues` is the one that matters.** Its absence is what let league settlement stay
disconnected for two entire phases.

## 6. Provider

| Signal | Source | Threshold | Severity |
|---|---|---|---|
| Last successful response | `provider_freshness` | > 10 min during play | S2 |
| Quarantine rate rising | `platform_events` rejects | sustained rise | **S1** — schema drift, `runbooks/09` |
| Endpoint failure rate | listener logs | > 10% | S2 |

A **rising quarantine rate is S1 while everything looks fine**, because it means the provider
changed shape and the pipeline is correctly refusing data. That is the failure that looks like
health.

## 7. Product health — BUILD (needs analytics)

| Signal | Why it matters |
|---|---|
| Daily Checks with `reasonToReturn = false` | `reasonToReturn` exists in core precisely so "this day left nothing to come back for" is detectable in code. Nothing measures it |
| Unsubmitted brackets near lock | An unsubmitted bracket scores zero and the only warning is in-app. With no notifications, the only nag is a page they must choose to open |
| Invite copy failures | Silent until Mission 10; now announced, still uncounted |
| Auth failure rate | Leading indicator for SMTP problems |

**`daily_check_log` records only the leading beat.** Secondary beats, locale and check type are
not persisted, so the Founder Dashboard reports **proxies** for Daily Check health rather than the
thing itself. Do not read those tiles as measurement.

## 8. Uptime — BUILD

Any external checker. Minimum four: `https://matchreadtennis.com` (200, 5 min),
`/api/health` if one is added, the Supabase REST root, and the listener's `/healthz`.

**An external checker is the only monitor that survives the platform being down.** Everything else
in this document is hosted by the thing it watches.

## 9. Routing and false positives

Beta: **all S1 to the engineer's phone, S2 to email, S3 to a weekly review.** One recipient is
correct at this size; a rota is worse than a single owner when the team is one person.

Two known false-positive generators, to tune before they train you to ignore alerts:

- **`previous_score` is null for the first day** of any tournament. Movement alerts must require
  two consecutive snapshot days.
- **Replay draws** move figures on the dashboard. `replayActive` is hoisted onto the payload for
  this reason — suppress settlement alerts while a rehearsal is in play, or the rehearsal teaches
  you to dismiss the alert.

**Every alert needs a runbook before it is enabled.** An alert with no procedure is a notification
that trains the recipient to dismiss it.
