# MatchRead — slam event P0: Draw Type, Discovery Cadence & Result Reconciliation

**Scope:** stop MatchRead publishing the wrong draw, make discovery poll continuously instead of daily, and make result reconciliation repair itself. Small corrections to the existing implementation only. No new consumer features, no new platform.

> **Access statement, stated once.** I do not have `main`. I have the docs corpus, `0001_init.sql`, `0004_security_hardening.sql`, `packages/core/src/rating/engine.ts`, `supabase/functions/settle-slate/index.ts`, `MatchCard.tsx` and `tokens.ts` — and I have the live production site, which I inspected on **26 Aug 2026**. Paths are marked **held** (read directly), **`VERIFY`** (named in the corpus, source unseen) or **new**. The provider-response field names in §2 are deliberately left as placeholders: §2A gives the three commands that resolve them in ten minutes. Do not let a guessed field name gate a published draw.

---

## 1. Executive diagnosis

**Confirmed live.** `/tournaments/t-wta-16743` (WTA slam event) simultaneously renders the header **"Draw pending"** and a section headed **"Official draw — Round of 128"** containing 64 first-round matches. `/tournaments/t-atp-21349` (ATP slam event) is clean. The defect is WTA-only today.

**The rendered draw is the qualifying draw.** Four independent proofs, none requiring repo access:

1. **Zero seeds in all 64 matches.** MatchRead demonstrably renders seeds — Masters event shows `1 Zverev`, `26 Martin Etcheverry`. A slam event main draw seeds 32 players; this draw seeds none.
2. **Zero WTA top-30 players.** No Sabalenka, Swiatek, Gauff, Pegula, Rybakina, Keys, Paolini — who would *be* the 32 seeds.
3. **The roster is qualifying-tier**: Lepchenko, Brengle, Mladenovic, Sasnovich, Zidansek, Marino, Ferro, Rus, Watson, Dart, Barthel, Osuigwe, Hercog — plus juniors and wildcards (Ngounoue, Broadus, Caterina Grant, Andrea Knutson).
4. **Round count is fabricated.** Women's qualifying is **three rounds** (128 → 64 → 32 → 16 qualifiers). The page renders **seven** — R128 through F. MatchRead invented four rounds that do not exist in the source event.

**Why size validation could never have caught this.** slam event women's **qualifying is a 128-player draw — exactly the same size as the main draw**. `drawSize === 128` is a *correct* Grand Slam main-draw size. Any classifier that leads with size passes qualifying through unchanged. This is the concrete case for the rule that **draw size must be a safeguard, never the classifier.**

**Two related defects in the same family.**

- **`t-atp-21347` (ATP Masters event) is `Complete` with an impossible bracket.** `Norrie` plays `Norrie` in R64; `Cobolli` occupies two R32 matches and two R16 matches; `Nakashima` two R32 matches; the final reads `Fils` vs `Not played`; **no match displays a winner**; R128 lists all 32 matches first and all 32 byes after, with match timestamps bleeding onto bye rows. Segregated byes, index-shifted timestamps and one player in simultaneous matches are the signature of a bracket **assembled by pairing a flat result list**, not read from an ordered draw.
- **64-draw event and 32-draw event read `On court` on the calendar and `Draw pending` on their own detail pages** — matches are being ingested for tournaments with no draw, so the importer will not write into an empty tournament.

**Root cause.** The failing predicate is not `drawExists`. It is that **nothing validates draw *type* before publication, and nothing re-checks a tournament once draw-shaped rows exist.** Those two gaps compose into the slam event failure exactly: qualifying arrives first, satisfies the "we have a draw" test, and permanently blocks the main draw behind it.

**One correction to my prior handbook.** I recommended GitHub Actions because Edge Functions could not resolve `workspace:*`. `settle-slate/index.ts` (held) imports `npm:@matchread/core@^0.1.0` — the **published-package** form, so §STOP option A has been taken and the Edge Function path *is* the existing architecture. Everything below extends it. Confirm that version actually resolves on the registry first; if it 404s, that is P0 zero.

---

## 2. Draw discovery and the slam event draw-type fix

### 2A. Identify the source — ten minutes, do this first

```bash
psql "$DB" -c "select d.id, d.status, d.structure_provenance, count(s.*)
               from draws d join draw_seats s on s.draw_id=d.id
               join tournaments t on t.id=d.tournament_id
               where t.external_ref='t-wta-16743' group by 1,2,3;"

node capture.mjs --tour wta --tournament 16743 --out fixtures/uso-wta-2026/

jq 'keys, (.. | objects | select(has("type") or has("category") or has("eventType")))' \
   fixtures/uso-wta-2026/*.json | head -40
```

The third command is the one that matters: it names the field the classifier must read, from real bytes rather than documentation — the discipline that exists because the last parser written from docs scored **0 of 27**. Archive before parsing.

### 2B. The selection rule

Classification is **ordered**, and size is last. **(1) Provider's explicit draw/event type field** — authoritative; accept only an explicit main-singles value. **(2) Round structure** — a main draw terminates in a final (1 match), qualifying in N qualifiers (16 at a Slam); *this alone separates the two slam event 128s.* **(3) Seed presence** — zero seeds in a 128 draw is disqualifying. **(4) Draw size** — safeguard only: assert `size ∈ {32,48,56,64,96,128}` and `size === tournaments.draw_size`.

```ts
// packages/core/src/canon/tennis.ts   VERIFY — extend, do not replace
export type DrawClass =
  | { kind: 'main_singles'; size: number }
  | { kind: 'rejected'; reason: 'qualifying' | 'doubles' | 'mixed' | 'unknown_type'
                               | 'no_seeds' | 'size_mismatch' | 'terminal_round_not_final' };

export function classifyDraw(ev: DrawTypeEvidence, t: TournamentRow): DrawClass;
```

`DrawTypeEvidence` carries the provider's own type/category value, the terminal-round entrant count, the seed count and the slot count. **Never infer main-singles from "the array has players in it."** Reject explicitly rather than falling through — `unknown_type` must reject, not default.

For a Slam, additionally require `seedCount === 32`, `size === 128`, and `terminalRoundMatches === 1` before publication.

### 2C. Remove the blocking early return

Grep for `drawExists`, `hasDraw`, `existingDraw`, or `.maybeSingle()` on `draws`, and replace the predicate:

```sql
-- was, in effect: "any draw row exists for this tournament"
-- becomes:
select not exists (
  select 1 from draws d
   where d.tournament_id = $1
     and d.draw_type = 'main_singles'          -- new column, §2D
     and d.status in ('published','locked','complete')   -- VERIFY labels vs 0006
) as needs_discovery;
```

The test is `validatedMainSinglesDrawPublished === false`, not `drawExists === false`. Qualifying rows must never satisfy it.

### 2D. Migration `0032_draw_type.sql`

```sql
create type draw_type as enum ('main_singles','qualifying_singles','doubles','mixed_doubles','other');
alter table draws add column draw_type draw_type not null default 'main_singles';

-- one main singles draw per tournament: idempotency becomes structural
create unique index draws_one_main_singles
  on draws (tournament_id) where draw_type = 'main_singles';

update draws set draw_type = 'qualifying_singles', status = 'superseded'  -- VERIFY label
 where tournament_id = (select id from tournaments where external_ref = 't-wta-16743');
```

Reclassify, do not delete. Nobody has picked this draw (the tournament is `Draw pending`, so entry never opened), and keeping the row preserves the evidence. When the real main draw arrives it inserts cleanly against the partial unique index.

### 2E. Cadence

Extend the existing `pg_cron` → Edge Function pattern. **Do not add a scheduler.** One job, one cadence, tiering done in the eligibility query — this is cheaper and easier to reason about than four cron entries.

`select cron.schedule('discover-draws','*/5 * * * *', $$ select net.http_post(url := '.../functions/v1/discover-draws', …) $$);`

```sql
-- eligibility: tiering lives here, not in four cron entries
select t.id, t.external_ref, t.tour, t.tier, t.draw_size, t.starts_on
from tournaments t
where t.tour in ('ATP','WTA')
  and t.tier not in ('tour_finals','other')    -- round-robin: canon isKnockout:false
  and t.starts_on >= current_date - 14
  and not exists (select 1 from draws d
                   where d.tournament_id = t.id and d.draw_type = 'main_singles'
                     and d.status in ('published','locked','complete'))
  and case when t.starts_on - current_date > 7
           then (extract(hour from now())::int % 6) = 0 else true end;
```

Beyond seven days this fires roughly every six hours; inside seven days, every five minutes. **Draw reconciliation (§3) is a separate selection** and continues after publication — the query above deliberately stops selecting a tournament once its main draw is published.

---

## 3. Draw replacement reconciliation

Finding the draw once is not enough: withdrawals, lucky losers, qualifier placement and seed corrections all land between publication and first ball.

Run every 15 minutes for tournaments with a published main draw that has not yet locked, and once an hour after lock. Diff on **(draw position, provider player id)** — never on names, per the 39 shared surnames and four sets of brothers in 900 ranked players.

| Provider vs stored | Pre-lock | Post-lock |
|---|---|---|
| Same position, same player | no-op | no-op |
| Same position, different player | **apply**, log `replacement` | **never mutate the seat**; log `post_lock_replacement`, S1 alert |
| In provider, absent locally | insert | insert only if the seat is empty |
| Local, absent in provider | **do not delete**; log `orphan_position` | do not delete |

**User-pick protection is the load-bearing rule.** Once picks exist, a seat swap silently regrades somebody's bracket. Pre-lock, a replacement is legitimate, and picks against the departed player should be voided rather than marked wrong — a founder decision for `PRODUCT_DECISIONS.md`, not a code default. Post-lock the draw is frozen: a lucky loser replacing a withdrawal is handled as a **match-level walkover** (§4), not a draw edit, keeping `replace_draw_entry` (`VERIFY`) the only writer that touches a locked seat. Never delete-and-recreate a draw that has picks against it.

---

## 4. Result reconciliation and advancement repair

### 4A. Reuse the existing worker architecture

`settle-slate/index.ts` (held) reveals the pattern to extend and one asset worth using: it ends by inserting `{ kind: 'evaluate_badges', payload: { matchId } }` and `{ kind: 'notify_results', … }` rows. **`job_queue` already exists** with a `kind`/`payload` shape. Add `kind: 'reconcile_tournament'` rather than inventing a second dispatch mechanism, reuse `requireServiceAuth`/`serviceClient`/`json` from `supabase/functions/_shared/supabase.ts` (held), and follow `settle-slate`'s stated pattern: *event-triggered, plus a five-minute sweep as a safety net.*

### 4B. The repair pass

Every five minutes for active tournaments, against the completed-results archive `GET /tennis/v2/{tour}/tournament/results/{seasonId}` — **not** the fixtures endpoint, which M3.6 confirmed returns `{"data": []}` for a completed event. A played match leaves fixtures permanently, so a fixtures-based comparison sees nothing on both sides and concludes nothing is missing.

```ts
// packages/settlement/src/reconcile.ts   new
for (const r of results.filter(isSingles).map(normalizeResult)) {
  const local = await repo.findMatchByProviderIdentity({ tour, providerMatchId: r.providerMatchId });
  const d = outcomeDisposition(r.resultType);            // canon
  if (d.kind === 'unknown') { await run.quarantine(r); continue; }
  if (!local)               { await createMissingMatch(r, d, run); continue; }
  const side = await resolveWinnerSide(local, r);         // provider id → 'a' | 'b'
  if (side === 'conflict')                     await run.conflict(local, r, 'roster_mismatch');
  else if (!local.winnerSide && side)          await repair(local, r, d, side, run);
  else if (local.winnerSide && side !== local.winnerSide) await run.conflict(local, r, 'winner_changed');
  // agrees → no-op.  Fill a hole: automatic. Change an answer: never.
}
await settleAll({ drawIds: [t.drawId] });   // EXISTING resolver. Seats fill here, not above.
```

This is `provider = complete, MatchRead = not played` → repaired, and it is idempotent by construction: only a null `winnerSide` is filled, and a disagreement records instead of overwriting.

### 4C. Advancement repair

**Do not write a second propagation engine.** Advancement is already a derivation over seats from match results, so a repaired winner plus one `settleAll` call refills the entire downstream chain — R16 → QF → SF → F — in one pass. That is the whole fix.

Two blockers to clear first. **`apply_grades` (`0004` L494) latches** — `if v_settled is not null then return 0` is a latch, not a comparison, deliberately, because the rating ledger is append-only. **Read `0012`'s `apply_bracket_state` before writing anything:** if it shares that shape, a repaired winner on an already-`settled_at` match is a silent no-op and the pass reports success while changing nothing. If it latches, add a third branch — *settled + outcome differs → raise, record conflict.* Second, **`0001` L112** requires a winner only for `final`, so `status='retired', winner_side=null` is legal and re-selected forever by `matches_settling`. Widen to `status not in ('final','retired','default','walkover') or winner_side is not null`, and add the missing `default`/`suspended` values to `match_status` (L18) in their own migration step.

---

## 5. State-integrity invariants

Four hard rules. Each one is violated in production today.

| Invariant | Enforcement | Violated by |
|---|---|---|
| No `Draw pending` while a draw renders | Render the bracket **only** from a `main_singles` draw in `published`/`locked`/`complete`; derive the header label from that row | WTA slam event |
| `On court` needs an authoritative draw | Derive status from the draw, not the match table | 64-draw event, 32-draw event |
| `Complete` needs a resolved championship path | Assert the final has two participants and a winner | ATP Masters event |
| One seat per player per round | `unique (draw_id, round, player_id)` | ATP Masters event |

That last one is a single index and it would have caught `Norrie vs Norrie`, both duplicate Cobolli matches and both duplicate Nakashima matches at insert time.

---

## 6. Observability

One structured line per tournament per run, on the existing log stream. No new platform.

```
ts=…08:20:11Z job=discover-draws tour=WTA tournament=t-wta-16743 provider_status=200
  draw_types_seen=qualifying_singles main_singles_found=false action=noop reason=qualifying_rejected
```

The results equivalent carries `matches_checked`, `updates`, `missing_provider_results`, `propagation_repairs` and `conflicts`. `draw_types_seen` is the field that would have made this incident visible on day one rather than four days before the Slam. For verification, using what already exists: `select jobname, schedule, active from cron.job` (next execution), `select * from cron.job_run_details order by start_time desc limit 20` (last execution, provider errors), `select kind, count(*) from job_queue group by 1` (backlog). If cron fires but no run rows appear the function is 500ing — check the `npm:@matchread/core` resolution from §1 first.

---

## 7. P0 implementation checklist

**Order matters.** Step 1 ships today — a two-statement migration removing a publicly wrong bracket four days out. Steps 2–6 are the fix and must land before the main draw publishes around 27–28 August; step 7 can follow during week one. Test 1 is proved by `cron.job_run_details`, not a code reading. Test 3 is proved by pointing discovery at a tournament whose qualifying is already stored and watching the main draw publish unattended — **the WTA slam event is that fixture, live, right now.** Test 7 is `max(matches.updated_at)` unchanged across three runs. No manual SQL update counts as proof.

| # | Step (file) | Proves |
|---|---|---|
| 0 | Confirm `npm:@matchread/core@^0.1.0` resolves on the registry | nothing below runs if it 404s |
| 1 | **Reclassify the WTA slam event qualifying row; stop rendering it today** — `0032_draw_type.sql` | Tests 2, 8 |
| 2 | Capture the real WTA 16743 payload; name the provider's type field — `fixtures/uso-wta-2026/` | Test 2 |
| 3 | `classifyDraw()` — ordered signals, size last, `unknown_type` rejects — `packages/core/src/canon/tennis.ts` | Test 2 |
| 4 | Replace the `drawExists` guard with the main-singles predicate — discovery worker | Test 3 |
| 5 | `discover-draws` at `*/5`, tiered eligibility, structured log line — `pg_cron` + Edge Function | Tests 1, 3 |
| 6 | Seat-uniqueness index, championship-path assertion, widened L112, `default`/`suspended` enums — `0032` (`ADD VALUE` in its own step) | Tests 5, 8 |
| 7 | Draw-replacement diff (pre/post-lock split), then result reconciliation via `job_queue` kind `reconcile_tournament` — `packages/settlement/src/reconcile.ts`. Read `0012` first; add the settled-differs branch if it latches | Tests 4–7 |
