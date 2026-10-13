# Launch-window sequence

Time-ordered checks for a **draw ceremony → first ball** window (Grand Slam or Masters).  
Rewritten from source manual §17.5 / §18 onto **this** stack. Do not use the manual’s `t-atp-21349` ids or Matchstat worker names.

**Stop and escalate on any STOP fail. Do not continue down the list.**

Fill `{ATP}` and `{WTA}` slugs from `public_calendar` the morning you start (live `tournaments.slug` values — **verify live**).

Operator commands (credentials stay in gitignored env files):

```text
npm run probe:rapidapi
npm run tennis:verify -- --slug {ATP}
npm run tennis:verify -- --slug {WTA}
npm run publish:draws          # preview first; live write only when intended
```

Ingest is `POST …/functions/v1/sync-facts`. Scoring cron is `settle-leagues`. There is no `drawRefreshWorker`.

---

## T−72h (or start of ceremony week)

| # | Check | Pass |
|---|--------|------|
| L72-1 | Both slugs on `/` or `/tournaments` | Names, tour, dates, surface correct |
| L72-2 | If draw **not** out: pages are draw pending | Copy: **Picking opens when the official draw is published.** No invented sheet |
| L72-3 | If draw **is** out: treat as T−0 and jump to L0 | Do not keep calling it pending |
| L72-4 | `npm run probe:rapidapi` | Provider reachable |
| L72-5 | Founder `/founder` + `/founder/integrity` | Signed-in founder only; ops/integrity readable |
| L72-6 | Adaptive poll awareness | Unpublished events near `main_draw_starts_on` are in the sync-facts force-poll window (~5 days before / 2 days after). You cannot see 60s Matchstat cadence — confirm cron `sync-facts` is actually firing (new `ops_events` / fresh `updated` rows), not that a worker named in the manual exists |
| L72-7 | On-call | A human is named for the ceremony window |

**STOP if** either slam is missing from the public calendar or a fictional bracket is already showing.

---

## T−0 (draw publishes)

Run in this order. Official comparator tab open (the event’s official draw page or PDF).

| # | Check | Pass |
|---|--------|------|
| L0-1 | Detect | Within **one or two `sync-facts` cycles** (typically ≤10 min, not the manual’s 120s socket SLA) the public page leaves **Draw pending** |
| L0-2 | Integrity | Founder: `draw_integrity_reports.safe_to_publish` for both tours. No qualifying misclassify |
| L0-3 | Size | Official seat count each (128 for a slam main draw). Contiguous positions. No duplicate person |
| L0-4 | Order | **Manual slot-by-slot** vs official draw — all 64 R128 pairs, **both** tours. Blocking gate (manual §17.4) |
| L0-5 | Tags | Q / WC / PR / LL render; unnamed Q/LL stay **Qualifier / Lucky Loser** |
| L0-6 | Byes | None expected on a 128 slam main draw. If any appear, they must be on the official sheet |
| L0-7 | Gate | Status flips to open (if lock still ahead). **Fill a bracket** appears. Picking did not need a human publish click if cron already imported — if cron lagged, ops may `publish:draws` |
| L0-8 | Lock caption | `lock_at` still **unset** or equal to first **timed** R0 ball — never a guessed ceremony midnight |

**STOP if** L0-2, L0-3, L0-4, or K3-equivalent (qual sheet as main) fails.

---

## T+2h (same day, after import)

| # | Check | Pass |
|---|--------|------|
| L2-1 | Guest vs signed-in | Guest sees the sheet; Fill routes to sign-in |
| L2-2 | Solo enter | `/enter/{slug}` creates/opens a solo league and the editor |
| L2-3 | Partial Q | Unnamed qualifier slots visible; not pickable as people |
| L2-4 | Locales | `es` / `ja` on titles, CTAs, TBD, tags |
| L2-5 | Event map | **N/A** for browser sockets. Optional: ingest `event_map` populating is not a user-facing gate |
| L2-6 | Homepage | Event sits in **Open now** (not On court, not Upcoming) |

---

## Day 1 (first timed balls)

| # | Check | Pass |
|---|--------|------|
| L1-1 | Lock | When the first timed main-draw ball is in Postgres, public lock caption matches that instant. After it, **Fill** is gone; copy **Entry is locked** / **On court** as appropriate |
| L1-2 | First finished match | Winner on the public sheet within a sync-facts cycle |
| L1-3 | Advance | Winner in the parent node; submitted league picks grade after `settle-leagues` or founder settle |
| L1-4 | LL / WD | If the official sheet swapped a name: public sheet updates; `draw_replacements` row; pre-lock picks rewritten; post-lock editor stays closed |
| L1-5 | No wipe | A noisy sync does **not** unpublish the sheet |
| L1-6 | Live overlay | Do not block launch on missing point-by-point. **Do** block if the UI claims live scores it does not have |
| L1-7 | Privacy | Second browser, logged out, cannot see member picks |

**STOP if** first-ball lock is fictional, winners do not advance, or the official sheet disappears.

---

## After the window (same day wrap)

- Copy findings into [`worksheet.md`](./worksheet.md).
- File product bugs against **current** paths (`apply-draw.ts`, `seats`, `sync-facts`), not against `services/drawImport`.
- Edge deploy is **manual** if ingest logic changed — a git push does not deploy `sync-facts`. This pack did not change ingest.

---

## Mapping from source §18 “critical before launch”

| Source §18 item | Current check |
|-----------------|---------------|
| Draw API integration | L0-1…L0-4 (Tennis API `/draws` via provider, not Matchstat) |
| `draw_slots` / `bracket_nodes` schema | Already `seats` / `matches` — verify D2/D1, not a migration |
| Local generation removed | L0-4 + D1 (synthetic pattern = fail) |
| Settlement R1→champion | L1-2, L1-3, checklist H* |
| Slot-based picks | **Not shipped** — I2/I3 only |
| Draw refresh worker | L72-6 cron, not a worker process |
| Event mapping + socket fallback | J* N/A in UI |
| Reconnect-before-join | N/A |
| Entry tags + byes | L0-5, L0-6 |
| E2E-1 staging | Optional: `apps/web/e2e/live-checklist.spec.ts` |
| Rate-limit priority queue | Ops awareness only — no user check |
| Alerting + on-call | L72-5, L72-7 |
