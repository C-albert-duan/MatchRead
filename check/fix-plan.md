# Fix plan — unsuccessful checklist items

**Source:** [`worksheet.md`](./worksheet.md) guest pass, 19 Sep 2026, production.  
**Do not implement from this file until the next turn asks.** No application code was changed for this plan.

Failed ids: **D1**, **E3**, **E4**, **H2**.  
D1 + E3 + E4 are **one defect** in parse → overlay → R0 auto-advance.  
H2 is a **second defect** in result bind → parent heal.  
Blocked rows are verification debt (no auth / no clay event / no ops env), not implementation work.

Fix the **shared pipeline** (provider draw parse, seat overlay, integrity, settle/advance). Do not add a slug, tour, title, or field-size special case. Live sheets that already show the bug are **retest evidence**, not the scope of the patch.

---

## 1. What “unsuccessful” means

| Id | Symptom (shape) | Product rule broken |
|----|-----------------|---------------------|
| D1 STOP | Official Qualifier / TBD seats rendered as **BYE · ADVANCES**; named player already in the parent round | Official `draw` / slot occupants, not a local guess |
| E3 | Bye count > official published byes (Q seats counted as byes) | Byes only if the official draw published them |
| E4 | No **Qualifier / Lucky Loser** TBD; TBD converted to bye | Fail **open** on official TBD; do not invent a bye |
| H2 STOP | Completed event: later-round side still **Not played** after the tour finished that line | Winners must sit in the parent node on a finished match |

These shapes were observed on the worksheet slugs (`t-wta-16748`, `t-wta-16747` for TBD-as-bye; `t-atp-21347` for the parent hole). Other completed 128-slot sheets on the same calendar already fill the final — so `parentMatchKey` arithmetic is not globally broken. Do not redesign ingest, settlement, or the web app around Matchstat.

---

## 2. Track A — Qualifier TBD parsed as bye (D1, E3, E4)

### 2.1 Root cause

Parser already knows the string `"Qualifier"` is TBD. Unit test in `packages/provider-rapidapi/src/map.test.js` (“reads ordered first-round matches including bye and TBD”) expects:

- `{ name: "Bye" }` → `seat_kind: "bye"`
- `{ name: "Qualifier" }` → `seat_kind: "tbd"`

Live Tennis API **does not send that string** for unnamed Q/LL seats. It uses the **same placeholder as an official seed bye**:

```57:60:packages/provider-rapidapi/src/official/parse-draw.js
/** Tennis API placeholder opposite a seed bye (often id 3700). */
function isUnknownPlaceholder(name) {
  return /^unknown(\s+player)?$/i.test(String(name || "").trim());
}
```

`personFromUnknown` maps `Unknown Player` / empty / `isBye` to **`kind: "bye"` before** any TBD check. The 96-in-128 fixture in tests is `{ id: 3700, name: "Unknown Player", result: "bye" }` for a **real** seed bye.

Then `apply-draw` auto-settles R0 player-vs-bye and writes the winner into the parent (`refreshRoundZeroSidesFromSeats` + `advanceWinnerIntoParentMatch`). That is why the public sheet showed **BYE · ADVANCES** and the named opponent already in the next round.

`evaluateDrawIntegrity` does **not** block “too many byes for this field size,” so a 32-draw with four invented byes still publishes.

`overlayExistingSeats` (already-published path) can fill `tbd → player` but **cannot** rewrite `bye → tbd`. A parser-only deploy will **leave already-published sheets wrong**.

```1323:1332:supabase/functions/_shared/apply-draw.ts
    if (s.kind === "bye" && opts.allowReplacement) {
      patch.kind = "bye";
      // ...
    }
    if (s.kind === "tbd" && opts.allowReplacement && existing.kind === "player") {
      // Rare: named → TBD; keep as tbd only if product allows — skip by default.
    }
```

`diffDrawSeats` has `tbd_filled`, `bye_to_player`, `player_to_bye` — **no `bye_to_tbd`**.

### 2.2 Intended rule (pure-fact)

| API / official signal | Persist |
|-----------------------|---------|
| Name is Bye / `result: "bye"` on a true seed-bye slot | `seats.kind = bye`, auto-advance |
| Name is Qualifier / LL / TBD, or `seed1`/`seed2` is `Q`/`LL` | `seats.kind = tbd`, `tbd_label` set, **no** auto-advance |
| `Unknown Player` / id `3700` / null opposite a **named** player | **TBD unless** the row is an official bye (see 2.3) |
| Named qualifier later appears in fixtures | existing `fillTbdSeats` + `tbd_filled` overlay |

UI already renders TBD via `PlayerChip` (`draw.tbd` = “Qualifier / Lucky Loser”). No new product surface.

### 2.3 Discriminator (do not use seed-convention placement)

Implement in `personFromUnknown` / `matchSides` using **row-level** facts, in this order, for **every** draw:

1. Explicit Bye name → bye.  
2. Explicit Qualifier / Lucky Loser / TBD / `Q` / `LL` name **or** `seed1`/`seed2`/`entry*` tag `Q`/`LL` on **that side** → tbd.  
3. `raw.isBye` / `result === "bye"` **and** the opposite side is a named player → **bye** (including 96-in-128 seed byes). Keep the existing unit test.  
4. `Unknown Player` / id 3700 / null / empty **and** `result` is not `"bye"` → **tbd**, not bye.  
5. Never map Unknown → bye on name or id alone.

If a live payload shows `result: "bye"` on Qualifier rows (confirm in 2.4), fall back to: Unknown opposite a player whose `seed1`/`seed2` is `Q`/`LL` → tbd; only then treat leftover Unknown+`result:bye` as bye.

Do **not** invent bye slots from “textbook” seed corners. That is the §2.2 defect.

### 2.4 Work items

**A0 — Capture live payloads (read-only, before coding)**  
Dump Tennis API first-round rows for any published sheet that still shows Q-as-bye (worksheet examples: `t-wta-16748`, `t-wta-16747`). Freeze 2–4 Unknown-without-`result:bye` rows and 2 official `result:bye` seed-bye rows as golden JSON next to `map.test.js`. Confirm id 3700 / Unknown / `result` / `seed1`. The fixture is a **shape**, not an event title.

**A1 — Parser**  
`packages/provider-rapidapi/src/official/parse-draw.js`  
- Split Unknown vs Bye vs TBD as in 2.3.  
- Carry `entry_status: q` onto TBD seats when the tag is Q.  
- Tests (synthetic ids, no event titles):  
  - existing `Unknown` + `result: "bye"` still bye  
  - existing `"Qualifier"` still tbd  
  - **new:** Unknown / 3700 **without** `result: "bye"` → tbd  
  - **new:** 16-match R32 with four Unknowns, zero `result:bye` → 4 tbd, 0 bye  
  - **new:** 4× `result:bye` + 4× Unknown-without-bye → 4 bye + 4 tbd

**A2 — Integrity warning**  
`evaluateDrawIntegrity` (`assert.js`): warn (or block unpublished) when bye count is impossible for the **official field** (e.g. 32-draw with byes and no `result:bye` rows; bye count > 28-in-32 = 4). Do not block a 128-slot Masters-size sheet with 32 official seed byes.

**A3 — Diff + overlay so every already-published sheet can heal**  
- `draw-diff.js`: `bye_to_tbd` (and `tbd_to_bye` only if official).  
- Migration `0012` `change_kind` check: add `bye_to_tbd`.  
- `overlayExistingSeats`: if incoming is `tbd` and existing is `bye`, write `kind=tbd`, `tbd_label`, clear `player_id`.  
- After that rewrite, **unwind** the invented bye settle on **that match**: clear `matches.winner_player_id` / `settled_at` on the R0 row if the winner was a bye-advance; clear that player from the **parent** side if the parent is not yet a played/settled match.

**A4 — Republish through the shared path**  
After Edge deploy of `sync-facts` (push does **not** deploy Edge): `npm run publish:draws` (or `sync-facts` without a slug filter) so **every** published sheet can take `bye_to_tbd`. Do not add a per-slug publish branch. Worksheet slugs above are the first eye-diff targets.

**A5 — Recheck**  
MANUAL-CHECKLIST D1, E3, E4, F3 (TBD not pickable), B3 on any currently open official sheet — including the worksheet 32-draw / 28-in-32 examples. Slot order vs the official tour draw; TBD label; no auto-advance on Q seats.

### 2.5 What not to do

- Do not hide Q matches so the draw looks “fully named.”  
- Do not keep auto-advance for TBD.  
- Do not call `getTournamentSeeds` just to fix this (tags come from the draw row).  
- Do not treat this as a Matchstat `/draws` project.  
- Do not add a slug-, tour-, or title-specific branch.  
- Do not invent a 32/64/128 size from named-pair count.

---

## 3. Track B — Completed-tree parent hole (H2)

### 3.1 What we know

- Heal path already exists: `healSettledAdvances` walks every non-void settled match and `writeWinnerIntoParent`.  
- At least one completed 32-draw and one completed 128-draw on the same calendar have filled finals, so `parentMatchKey` is not globally broken.  
- At least one completed 128-slot sheet still has **Not played** on a QF side, an SF side, and one final side.

So either, **for any event of that shape**:

1. The missing child **never got `winner_player_id`** (unbound archive row, void without winner, or `skipped` in `bindResultsByPlayerPair`), so heal has nothing to copy; or  
2. The child **is** settled but `writeWinnerIntoParent` refused (parent side already occupied / parent already has a winner); or  
3. The child was **voided** (`healSettledAdvances` excludes `voided = true`), so a walkover never advanced.

### 3.2 Work items

**B0 — Diagnose on a completed sheet that still has a hole (read-only)**  
Use the worksheet example `t-atp-21347` only as the live probe, not as a code path. For each QF/SF/final node that shows **Not played**:

- `matches.round`, `index_in_round`, both sides, `winner_player_id`, `voided`, `settled_at`, `provider_match_id`  
- Matching Tennis API result row (pair + `match_winner` + `result_type`)  
- `ops_events` / `sync_repairs` for unbound / `winner_conflict`  
- Whether heal no-ops because the child is void or unbound

Use `npm run reconcile:results` dry-run and `scripts/backfill-settle-advance.mjs` in dry mode if that script supports it. Do not write until the hole is classified.

**B1 — Bind the missing result (if unbound)**  
Likely in `bindResultsByPlayerPair` / Shape B: later-round pair where one parent side is still null. Extend **partial** bind (already present for R0) so a unique finished archive pair can attach to a later-round match with one empty side, then settle + advance. Fail closed if two candidates. Same rule for 32/64/128.

**B2 — Void / walkover advance (if voided)**  
If the official child has a winner via w/o but we stored `voided` with no winner, map `outcomeDisposition` so a walkover with `match_winner` **settles a winner**, not a void. Heal should then fill the parent. Add a unit case: void-without-winner stays void; w/o-with-winner advances.

**B3 — Heal must fill empty parent sides**  
`writeWinnerIntoParent` already writes when the parent slot is empty. If B0 shows a settled child and an empty parent, find the skip (void filter, missing parent row, round/index mismatch on 128-draw). Fix that branch in the shared heal; add a 128-draw SF→F heal test (synthetic ids).

**B4 — Shared settle/heal after deploy**  
After Edge deploy: run the existing `sync-facts` / `backfill-settle-advance` path over **completed** events, not a one-slug script. Recheck H2 on any completed sheet that still showed **Not played** on a line the tour finished (worksheet example first). Final has two official names (or a documented void).

### 3.3 What not to do

- Do not invent a champion.  
- Do not overwrite a `settlement_claims` conflict.  
- Do not add a parallel settle path for “the one broken slug.”  
- Do not skip heal on other draw sizes because one 128-slot sheet was the first failure.

---

## 4. Sequence

```text
A0 payload dump (Unknown-without-bye + official result:bye shapes)
B0 completed-tree hole dump (read-only)
        │
        ├─ A1 parser + synthetic tests
        ├─ A2 integrity warning (bye count vs official field)
        ├─ A3 bye_to_tbd overlay + unwind
        │
        ├─ B1/B2/B3 only after B0 names the hole class
        │
        ├─ deploy sync-facts (manual)
        ├─ A4 shared publish/overlay (all published sheets)
        ├─ B4 shared settle/heal (completed sheets)
        └─ A5 + H2 retest on prod (worksheet slugs first)
```

Ship Track A even if B0 is still in progress. Open sheets with invented bye-advances corrupt trees users will submit.

Edge: any ingest change needs a **manual** `sync-facts` deploy. Git push is not enough.

Architecture docs: update `architecture/data-flows.md` / `modules/provider-rapidapi.md` in the **same** implement turn as A1/A3 (discriminator + overlay), per `.cursor/rules/architecture-docs.mdc`.

---

## 5. Retest map (after code)

| After | Re-run |
|-------|--------|
| A4 | D1, D2, D3, E1–E4, F3 if signed in, B3 — any open official sheet of the TBD-as-bye shape |
| B4 | H1, H2 on any completed sheet that had a parent hole; spot-check other completed sheets still filled |
| Optional later | Blocked auth items F3–F4, G3, H5, I* — not part of this fix |

---

## 6. Out of scope

- Matchstat clients, Socket.IO, `chosen_slot`, BullMQ (worksheet N1–N8).  
- Clay surface (B7) — no clay event on the calendar.  
- Lock ISO proof (G1) — needs DB read, not a parser change.  
- Locale leftover English round titles (B8 note) — not a Fail.

---

## 7. Acceptance

Track A is done when **every** official first round of this shape matches slot-for-slot: Qualifier/LL TBD seats show **Qualifier / Lucky Loser**, official seed byes remain **Bye**, and Q matches are **not** auto-advanced. A 32-draw with zero official byes has zero byes; a 28-in-32 sheet keeps only the official seed byes.

Track B is done when **every** completed tree has an official occupant (or documented void) on every node the tour finished, including the final, for 32/64/128, without a per-event branch.
