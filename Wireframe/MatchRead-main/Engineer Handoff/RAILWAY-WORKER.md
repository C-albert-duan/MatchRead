# Runbook — Railway ingestion listener

> **This component does not exist.** There is no `Dockerfile`, no `apps/listener`, no
> `railway.json` and no `fly.toml` anywhere in this repository. `packages/provider-rapidapi`
> contains a tested socket transport and nothing hosts it.
>
> **This runbook is a specification for what to build**, not instructions for deploying
> something that already ships. It is written this way rather than as a ticket because the
> constraints on the thing are the interesting part, and they are already decided in ADR-0018.

**Host: Railway.** ADR-0018 said "Fly.io or Railway" and left it open; this handoff closes it.
The founder already holds a Railway account, one container does not justify comparing hosts, and
the listener's blast radius is a single HTTP call, so the choice is reversible in an afternoon.
**Render is not used** — one production responsibility, one owner.

---

## 1. Why it exists at all

Supabase Edge Functions are request-scoped: they wake on an HTTP request, run, and are
reclaimed. A WebSocket that must stay joined to the provider's live-events channel for a
fortnight has no home in that model. Every other piece of the pipeline is request-shaped and
fits Edge Functions well. **The socket is the one component that is not**, and that is the
entire reason a third deployment target exists.

If you are wondering whether you can avoid it: yes, at a cost. See §7.

---

## 2. What it does, and — more importantly — what it must not

**It holds the provider socket and `POST`s what arrives to `ingest-events`. That is all.**

It parses nothing. It projects nothing. It writes to no table. It holds no database credential
beyond the bearer token `ingest-events` expects.

**That narrowness is the whole point.** A listener that also writes is a listener whose crash
loses data and whose bugs are indistinguishable from ingestion bugs. A listener that only
forwards can be restarted at any moment, and the worst case is a gap the reconciliation sweep
closes.

### Forbidden, explicitly

| Do not | Because |
|---|---|
| Parse or normalise payloads | `ingest-events` does it, using the same `@matchread/core` functions the app uses. A second parser is a second source of disagreement about what a match state means |
| Write to any table | Then a crash mid-write is data loss instead of a gap |
| Deduplicate | `platform_events` dedupes on a content-derived key. Reconnection deliberately re-sends; M3.3 measured 516 delivered against 344 rejected with identical projection work. **Duplicates are provably free** |
| Hold a Postgres connection | Provider credentials and database credentials should never be in the same process's blast radius |
| Run more than one instance | §5 |
| Run settlement — *unless* you have chosen option C | §7 |

---

## 3. Shape of the thing

Small enough to read in one sitting. That is a requirement, not an observation.

```
apps/listener/
  Dockerfile
  package.json          # depends on @matchread/provider-rapidapi via workspace:*
  src/index.ts          # connect, forward, heartbeat, exit non-zero on unrecoverable
```

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.6.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/listener ./apps/listener
RUN pnpm install --frozen-lockfile --filter "@matchread/listener..."
CMD ["pnpm", "--filter", "@matchread/listener", "start"]
```

The build context is the **monorepo root**, not `apps/listener`. That is what makes
`workspace:*` resolve — and it is the same property that makes option C in §7 attractive.

### Environment

All six are in `docs/ENVIRONMENT-VARIABLES.md` §3. `RAPIDAPI_KEY`, `RAPIDAPI_HOST`,
`MATCHREAD_INGEST_URL`, `SUPABASE_SERVICE_ROLE_KEY` (as a bearer secret, **not** for database
access), `MATCHREAD_ENV`, `LOG_LEVEL`.

`MATCHREAD_ENV` is not decoration. A staging listener writing into production logs and
heartbeats is indistinguishable from the production one, and you will only notice on the day it
matters.

---

## 4. Health and heartbeat

Railway wants a health check; a socket listener has no HTTP surface. Give it one.

```
GET /healthz  → 200 { ok: true, connectedSince, lastEventAt, eventsForwarded }
```

`200` only while the socket is joined. **A listener that is running but disconnected must fail
its health check**, or Railway keeps a dead process alive and the sweep silently becomes the
only source of results.

**Heartbeat.** Every 60s, `POST` a heartbeat to `ingest-events` so staleness is visible in
`provider_freshness` — the view the Founder Dashboard already reads. ADR-0018 §"What must be
true" asks for exactly this: *a decision on where the listener's failure surfaces*, with
`draw_settlement_health` as the model, because the interface should be told what to say rather
than showing a silent stale scoreboard.

**Do not build a separate monitoring surface for the listener.** It reports through the view the
dashboard already reads.

---

## 5. One instance. Deliberately.

`replicas = 1`. `restartPolicyType = ALWAYS`.

A second listener doubles delivery, and duplicates are free — so a hot spare would be *safe*.
It is rejected because it **doubles provider quota consumption for redundancy the reconciliation
sweep already provides more cheaply, and quota is the scarcer resource.** Restart time is
seconds; the sweep covers the gap.

**The trade, stated so it can be re-examined:** the listener is a single point of failure for
*latency*, not for *correctness*. **If `reconcile-results` is ever disabled, it silently becomes
a single point of failure for correctness too.** That coupling must be enforced by an alert on
sweep staleness, not by a comment. ADR-0018 asks for the alert by name.

---

## 6. Which job belongs where

The boundary is **lifetime**, not subject matter. Getting this wrong is how a platform acquires
four schedulers.

| Work | Home | Why |
|---|---|---|
| Provider socket | **Listener** | Needs to outlive a request |
| `lock-draws`, `reconcile-results`, `refresh-projections`, `rating-rollup` | **`pg_cron`** | Database work. The schedule then lives in the same migration history as the schema it depends on, and there is one fewer credential in the world |
| `ingest-events`, `import-draw`, `dispatch-notifications`, `ask-matchread` | **Edge Functions** | Request-shaped. Already fit |
| `settle-tournament` | **Edge Function today**, listener container above ~100k brackets | ADR-0018 R2. Settlement is ~10 min CPU per million brackets, single-threaded and measured, which exceeds an Edge Function's wall clock at Slam scale |
| Anything long-running | **Never a Vercel request handler** | No long-lived process model, and the web app must not share a failure domain with the feed |

---

## 7. Deferring it — the honest option

**You can open an invited beta without the listener.** Arm `reconcile-results` and results
arrive by REST sweep.

**The cost:** scores lag by the sweep interval — five minutes at the ADR's guessed cadence —
instead of arriving live. For invited friends filling brackets, acceptable. **For a public
launch it is not**, because live scores during a match are most of why anyone opens the product.

**If you defer, do three things:**

1. Arm `reconcile-results` and verify it. It is not a safety net any more; it is the *only*
   path.
2. Set its cadence from **measured provider quota**, not from the ADR's five-minute guess. The
   M3.5 Geneva capture has the data.
3. Write down that you deferred, and what would make you build it.

### Option C — the case for building it anyway, sooner

If you build the container, put settlement in it too. `settle-tournament` currently imports
`npm:@matchread/settlement@^0.1.0`, which **cannot resolve** because the package is unpublished
and private — a blocker described in `SETTLEMENT-SCHEDULING.md` §STOP. A monorepo container
resolves `workspace:*` natively, so building the listener **makes that blocker disappear
instead of requiring a separate fix.**

Two blockers, one container. That is the cheapest total path through this handoff's remaining
work, and it is worth costing before choosing to defer.

---

## 8. Operating it

**Deploy.** Push to `main`; Railway builds from the Dockerfile. Confirm `/healthz` returns
`connectedSince` within a minute.

**Safe restart.** Any time. The socket reconnects, re-sends, and the event log rejects the
duplicates. Watch `provider_freshness` recover.

**Rollback.** Railway → Deployments → redeploy the previous image. Stateless, so rollback is
instantaneous and carries no migration concern.

**Logs.** Railway retains a rolling window. Anything you need beyond that must reach Sentry —
see `docs/MONITORING.md`.

**Scaling.** Do not. One instance is the decision. If throughput ever exceeds one process, the
answer is sharding by tournament in `ingest-events`, not a second socket.

**Cost.** ~$5–20/month per ADR-0018, below the escalation threshold, noted for completeness.

---

## 9. Failure modes

| Symptom | Detect | Impact | Do |
|---|---|---|---|
| Socket disconnected, process alive | `/healthz` non-200; `provider_freshness` stale | Live scores stop; sweep still covers | Restart. If it recurs, the provider is rejecting the token — `runbooks/09` |
| Crash loop | Railway restart count | Same | Read logs. **Do not disable the health check to stop the restarts** |
| Quota exhausted | Provider 429s | Live *and* sweep both stop | `runbooks/TENNIS-PROVIDER.md`. This is an outage, not a degradation |
| Forwarding but nothing lands | `platform_events` not growing | Silent staleness | Bearer token wrong, or `MATCHREAD_INGEST_URL` points at the wrong project |
| Duplicate events | `platform_events` rejection count high | **None** | Expected. Duplicates are free by design |
| Two instances running | Quota burning at 2× | None to correctness | Scale to 1 |

---

## 10. Build checklist

- [ ] `apps/listener` created; forwards only, per §2
- [ ] Dockerfile builds from the **monorepo root**
- [ ] Six variables set; `MATCHREAD_ENV=production`
- [ ] `/healthz` returns non-200 when the socket is down — verified by killing the socket
- [ ] Heartbeat visible in `provider_freshness`
- [ ] `replicas = 1`, restart always
- [ ] `reconcile-results` armed **and alerted on staleness** (§5)
- [ ] A restart during a live match observed to lose nothing
- [ ] Decision recorded: settlement in this container, or in an Edge Function
