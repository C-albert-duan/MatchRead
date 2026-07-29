# Runbook — Tennis data provider (RapidAPI)

The one external dependency the product cannot substitute. Everything else can be rebuilt from
this repository; the tennis calendar cannot.

**Provider identity is founder-supplied and unverified by engineering.** The RapidAPI account and
the specific tennis API product are the founder's; no key has ever been used from a deployed
process. **Confirm the product name, tier and quota on day one** before building a schedule on
assumptions — §2 is the first thing to do in this document.

---

## 1. What we take from the provider, and what we never take

The trust boundary, stated once because it is the whole design:

| Provider is trusted for | Provider is **never** trusted for |
|---|---|
| Match status, score, winner | **Tennis rules.** Round naming, draw structure, seeding order and scoring are `@matchread/core`'s |
| Player identity and ranking | **Bracket topology.** A draw is reconstructed and *verified*, never accepted |
| Schedule and start times | **What a retirement means for a pick.** `calendar/disruption.ts` decides |
| Draw entries and seeds | **Anything the product asserts to a member** |

**`import-draw` fails closed.** An unverifiable reconstruction returns defects and **no draw**.
Provenance is recorded in `draws.structure_provenance` with three values, and a reconstructed draw
is never presented as provider-authoritative. Property-tested across 11 draw sizes × 10 generated
tournaments each, plus adversarial cases.

This matters operationally: **if a draw looks wrong, check provenance before blaming the
importer.** The importer refusing is the importer working.

---

## 2. Day-one confirmation

- [ ] Product name and RapidAPI URL recorded here by the engineer once confirmed: `__________`
- [ ] Subscription tier and **monthly quota**: `__________`
- [ ] **Terms permit commercial and public use.** If not, this blocks the beta and is a founder
      decision about money, not an engineering one
- [ ] Rate limit per minute/second: `__________`
- [ ] `X-RapidAPI-Host` value, copied from the endpoint page: `__________`

Fill these in. **A quota is not a detail** — the reconciliation cadence in
`SETTLEMENT-SCHEDULING.md` is currently a five-minute guess that ADR-0018 explicitly asks be
replaced by a number derived from it.

### Headers

```
X-RapidAPI-Key:  <RAPIDAPI_KEY>
X-RapidAPI-Host: <RAPIDAPI_HOST>
```

### Manual verification

```bash
curl -s -H "X-RapidAPI-Key: $RAPIDAPI_KEY" -H "X-RapidAPI-Host: $RAPIDAPI_HOST" \
  "https://$RAPIDAPI_HOST/<a-known-endpoint>" | head -c 400
```

Do this **before** deploying anything that depends on it. A wrong host header fails identically to
a wrong key, and both fail identically to a missing subscription.

---

## 3. How data arrives

```
socket (live)  ─┐
                ├─→ listener ─→ ingest-events ─→ platform_events ─→ projections
REST (sweep)   ─┘     ↑
                      └── DOES NOT EXIST YET — runbooks/RAILWAY-WORKER.md
```

Two paths, deliberately. The socket is low-latency and lossy across a restart; the REST sweep is
higher-latency and complete. **`reconcile-results` every five minutes is what makes a single
listener acceptable**, and it is the *only* path if the listener is deferred.

Reconnection deliberately does **not** deduplicate. `platform_events` dedupes on a
content-derived key, and M3.3 measured 516 delivered against 344 rejected with identical
projection work — **duplicates are provably free.** A listener that deduplicated would be a
weaker second copy of a control that already exists.

`backoffMs(attempt)` in `packages/provider-rapidapi/src/rest.ts` provides jittered backoff.
Reconnection is automatic and needs no operator.

---

## 4. Capture and replay

```bash
PROVIDER_TOURNAMENT_ID=<id> PROVIDER_RECORDS=fixtures/<name> \
  RAPIDAPI_KEY=<key> node scripts/make-recording.mjs
```

`fixtures/geneva-2025/` is the one real capture: **Geneva 2025**, replayed end to end, and it
produced real findings. Two limits you must know:

- **No retirement, walkover, withdrawal or suspension occurred**, so the entire disruption
  pipeline has never met real data. Retirements are common; this will be met in production.
- **The fixture has dates but no start times**, so every match began at the same instant. The
  three-check design (morning / live / evening) is therefore the least proven part of the product
  and its test count is not evidence otherwise.

**Capture the first real tournament you run.** It is the cheapest way to make the next incident
reproducible, and `scripts/canon-verify.mjs` and `scripts/geneva-verify.mjs` show the shape.

---

## 5. Quota, rate limits and outage

| Condition | Symptom | Severity | Action |
|---|---|---|---|
| Rate limited (429) | Intermittent gaps | S2 | Backoff handles it. If sustained, lengthen the sweep cadence |
| **Quota exhausted** | All requests 429 | **S1** | Live **and** sweep both stop. Nothing enters the platform |
| Feed dark | Socket closed, REST timing out | S2 → S1 | `runbooks/02-feed-outage.md` |
| **Schema drift** | **Quarantine rate rising while everything looks fine** | **S1** | `runbooks/09` |

**Quota exhaustion is an outage, not a degradation.** There is no fallback path: both transports
share the key. Monitor consumption against the monthly quota from day one and alert at 80% —
`docs/MONITORING.md` §6.

**A rising quarantine rate is S1 precisely because the product looks healthy.** It means the
provider changed shape and the pipeline is correctly refusing data rather than projecting
nonsense. `runbooks/09` §"Then" gives the recovery: read the top quarantine reason, pull a
quarantined raw payload from the archive, and fix the parser. That trade — quarantine over an
invisible wrong result — is the one this platform makes deliberately.

### Manual fallback

There is no automated fallback and that is a decision, not a gap. If the provider is dark through
a tournament day:

1. Say nothing for the first hour. Reconnection is automatic.
2. Past an hour, the scoreboard is stale and `SettlementDisclosure` says so — sourced from
   `draw_settlement_health`, so the interface reports what the database knows rather than guessing
   from a timestamp.
3. **Do not hand-enter results.** A hand-entered result is a fact with no provenance in an
   append-only event log, and it cannot be replayed or corrected the way an ingested one can.
4. When the feed returns, the sweep backfills. Verify with the seven steps in
   `SETTLEMENT-SCHEDULING.md` §4.

---

## 6. Disruption — what the provider tells us and what it does not

| Event | Arrives as | Handled |
|---|---|---|
| Retirement | Match status | ✓ Automatically |
| Walkover | Match status | ✓ Automatically |
| Cancellation | Match status | ✓ Automatically |
| **Withdrawal + lucky loser** | **Nothing** | **Operator, by hand** |
| Suspension / rain delay | Nothing | **No schema.** `resumes_at` does not exist |

**Nothing in `provider/parse.ts` recognises a withdrawal or a lucky-loser entry and calls
`replace_draw_entry`.** A real tour withdrawal reaches the product as *a human noticing*. That is
why `/founder/disruption` exists, why it has a server-rendered preview, and why the preview is
what makes it a safe thing for a person to do.

**The operator procedure:** `/founder/disruption` → select the draw → select the withdrawing seat
→ search for the replacement by surname (only players outside this draw are offered) → read the
preview → give a reason → confirm. Migration 0030 made the search possible; before it, the
console could vacate a seat and never fill one.

Suspension has **no schema at all**. `suspend()` and `resume()` exist as pure logic and carry the
argument for why `resumesAt` must be a separate field from `startsAt` — moving a start time would
reopen the lock on a match somebody has watched two sets of, *"a cheating vector wide enough to
drive a season through."* There is no `resumes_at` column, so nothing can be suspended.

---

## 7. Rotation

RapidAPI → regenerate the key → update `RAPIDAPI_KEY` in Railway → restart. Stateless; the sweep
covers the gap. Also update any local `.env` used for capture.

**If the key has ever been pasted into a chat window, rotate it.** Assume compromise rather than
arguing about it.

---

## 8. Live-tournament checklist

Run for the first real tournament.

- [ ] Draw imported; `draws.structure_provenance` is provider-authoritative
- [ ] Seeds and entry types match the published draw sheet — **check by eye against the
      tournament's own site.** `docs/VERIFICATION-WORKSHEET-HKG-2026.md` is the worked example
- [ ] `provider_freshness` reporting within 10 minutes during play
- [ ] A completed match appears in `matches` within the sweep interval
- [ ] Settlement follows — seven steps, `SETTLEMENT-SCHEDULING.md` §4
- [ ] Quarantine rate near zero; `fieldUsage()` shows no `MISSING`
- [ ] Quota consumption measured against a full day, and the sweep cadence set from it
- [ ] The tournament captured to `fixtures/` for future replay
