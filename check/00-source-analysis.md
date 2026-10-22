# Source analysis — Matchstat Integration Manual vs this repo

**Source:** [`discussion/MatchRead-Matchstat-Integration-Manual.md`](../discussion/MatchRead-Matchstat-Integration-Manual.md)  
**Status in archive:** future / not implemented as written (`discussion/README.md`)  
**Runtime docs:** [`architecture/`](../architecture/README.md)  
**Analyzed against the repo on:** 19 Sep 2026  
**Code was not changed for this analysis.**

---

## 1. What the file actually is

An engineering implementation manual for a **Matchstat** Draw + Extend + Socket.IO integration, aimed at a slam-week launch (main draw **31 Aug 2026**). It is a three-source document that only received **one** source: a Matchstat PDF plus a black-box look at `matchreadtennis.com` on **17 Aug 2026**.

The author states explicitly:

- No repository, schema, or architecture was attached.
- Every file path is a **hypothesis** marked `⟨inferred⟩`.
- Production claims are HTTP-behaviour only.

So this check pack does **not** execute the manual’s inferred `grep` commands against `src/`. Those paths (`services/drawGenerator`, `workers/drawRefreshWorker`, `lib/matchstat/client`) are not in this monorepo.

---

## 2. The manual’s diagnosis (keep the questions)

Six behaviours the manual treated as facts of the **then** live site:

1. Brackets were assembled from fixtures and **vanished in play** (in-play copy: “The full bracket is not published yet”).
2. The one finished small-field bracket sampled looked **synthetically seeded** (duplicate names, textbook seed placement).
3. A completed 64-draw showed **one** result; later rounds read **“Not played.”**
4. Lifecycle copy and calendar ingestion looked **sound**.
5. Surfaces all rendered **Hard**; homepage open-draw count disagreed with in-play count.
6. No public live scores; socket layer unverified.

The one-sentence prescription:

> Stop deriving brackets from fixtures; persist `/draws` + `/seeds`; add event mapping, draw-diff replacement detection, and REST reconciliation.

Those **questions** are still the right QA questions. The **implementation names** in the manual are not.

---

## 3. What this repo actually is

```text
Tennis API (RapidAPI)
        │
packages/provider-rapidapi
        │
Edge sync-facts  →  apply-draw / apply-results
        │
Postgres facts (tournaments, players, seats, matches, …)
        │
apps/web  (anon + RPCs: save_picks, submit_bracket, …)
```

| Manual assumed | This repo |
|----------------|-----------|
| Matchstat Core / Draw / Extend | **Tennis API** on RapidAPI (`packages/provider-rapidapi`) |
| `draw_slots` | **`seats`** — PK `(tournament_id, position)` |
| `bracket_nodes` | **`matches`** — unique `(tournament_id, round, index_in_round)` |
| `picks.chosen_slot` | **`picks (bracket_id, match_id) → player_id`** |
| BullMQ `workers/` | **pg_cron → `sync-facts` (~5m) and `settle-leagues` (~15m)** |
| In-app Socket.IO | **REST live list in ingest only**; web **`LiveRefresh` ~45s RSC** |
| Local draw generator in prod | **Rejected** — `first-round` / fixture-built draws cannot publish |
| `lib/matchstat/*` | **Does not exist** |

Authoritative flow: [`architecture/data-flows.md`](../architecture/data-flows.md).  
Entity names: [`architecture/data-model.md`](../architecture/data-model.md).

---

## 4. Section-by-section map

| Manual | Keep as a check? | Current owner |
|--------|------------------|---------------|
| §2.1 Bracket lost in play | **Yes — STOP if still true on a published event** | `published_at` + `seats`; public page `showDraw` |
| §2.2 Synthetic slot order | **Yes — eye-diff vs official sheet** | `parse-draw.js` → `seats.position` |
| §2.3 Winners do not advance | **Yes — results + parent side** | `apply-results.ts`, `settle-advance.js` |
| §2.4 Lifecycle copy | **Yes — but copy is state-specific now** | `status.ts`, i18n keys below |
| §2.5 Calendar ingest | **Yes** | `sync-facts` calendar upsert, `public_calendar` |
| §2.6 D1 surface Hard | **Yes** | `surfaceClass` — unknown ≠ Hard |
| §2.6 D2 homepage counter | **Yes** | `partitionLandingCalendar` (open vs on court vs awaiting) |
| §2.6 D3 live scores | **N/A for in-app socket**; check finished **WON** via ingest | `apply-results`, public draw grades |
| §2.6 D4 Fill CTA on complete | **Yes** | `entryOpen && status !== "complete"` |
| §3 inferred greps | **Do not run as written** | Use real paths in the checklist |
| §7 Draw API | **Yes as official `/draws` parse** | `getTournamentDraw`, `classify-draw.js` |
| §7.3 seeds + Q/WC/PR/LL | **Yes** | `seats.seed`, `seats.entry`, `PlayerChip` |
| §7.4 byes | **Yes** | `seats.kind = bye`; R0 auto-settle |
| §7.5 Q placeholders | **Yes** | `seats.kind = tbd`, `tbd_label` |
| §8 Fixtures not structure | **Yes** | After publish: schedule overlay only |
| §9 Event mapping | **Ingest-only** | `event_map`, `event-mapper.js` — **not** web sockets |
| §10 Live session | **N/A in the web app** | `live-session.js` is provider helper |
| §11 Draw refresh / LL diff | **Yes, via sync-facts** | `draw_revisions`, `draw_replacements`, adaptive `shouldPollDraw` |
| §12 Reconnect-before-join | **N/A** (no product socket) | — |
| §13 Fallbacks F1–F15 | **Subset** — REST ingest + freeze-on-conflict exist; socket banners do not |
| §14 Settlement | **Split two layers** | Facts: `claim_settlement` + advance. Product: `settle-leagues` / `gradeBracket` |
| §15 Lifecycle | **Yes, retriggered by `published_at`** | Not fixture-derived publish |
| §16 schema proposals | **Already different tables** | Do not expect `draw_slots` |
| §17.4 Manual QA | **This folder** | Slot-by-slot official site |
| §17.5 / §18 launch lists | **Rewritten** in `launch-sequence.md` | Current ops commands |
| §19 G7 slot-keyed picks | **Still player-keyed** | Pre-lock `rewritePicksForReplacements` is the compensating check |
| §21 Matchstat questions | **N/A** | Tennis API contract, not Matchstat |

---

## 5. Product copy you will actually see (en)

Do not fail an item because the 17 Aug in-play pending sentence is gone. Current English strings:

| State | Title / chip | Body |
|-------|----------------|------|
| Draw pending | “Draw pending” | “Picking opens when the official draw is published.” |
| Announced R1 only | “First round so far” | “{have} of {need} first-round matches are named…” |
| Published | “Official draw” | Fill CTA if entry is open |
| Open | “Open now” / calendar open | “You can fill a bracket once the official draw is out, until entry locks.” |
| Locked | “Locked” | “Entry is locked.” |
| On court | “On court” | “This tournament is in play.” |
| Complete | complete status | “This tournament has finished.” |
| TBD seat | — | “Qualifier / Lucky Loser” |
| Entry tags | — | `WC` / `PR` / `Q` / `LL` |
| Later-round empty | — | “Not played” (`bracket.notPlayed`) |
| Fill CTA | — | “Fill a bracket” |
| League CTA | — | “Start a league” |

Source: `packages/i18n/src/index.ts`. Locale switcher: `en` / `es` / `ja`.

**Important behaviour change vs the manual’s §2.1 reading:** “The full bracket is not published yet…” is now `tournament.drawPending.body` and is used when there is **no official published sheet**. It must **not** appear on an event that already has `published_at` + a full official `seats` row set. If it does, that is the original published-sheet-hidden defect still alive — **STOP**.

---

## 6. Pick identity (manual G7) — still the highest-risk schema fact

The manual’s recommended `picks.chosen_slot` was **not** shipped.

Current write:

```text
apps/web/app/actions/brackets.ts
  → RPC save_picks / submit_bracket
  → picks (bracket_id, match_id, player_id)
```

Compensating path (must be checked, not assumed):

- Draw diff writes `draw_replacements` (`replacement`, `tbd_filled`, `bye_to_player`, …).
- **Pre-lock:** `rewritePicksForReplacements` updates `picks.player_id`.
- **Post-lock:** picks are left as stored; grading uses `matches.winner_player_id`.

A lucky loser after lock can therefore score “wrong” relative to the user’s original *name* even if the *match* was picked correctly. Record that as a **known design** in the worksheet; fail only if pre-lock replacements leave a submitted name that no longer occupies the seat **and** no rewrite row exists.

---

## 7. Two settlement layers (manual §14 mixed them)

| Layer | What “settled” means | Who writes |
|-------|----------------------|------------|
| **Facts** | `matches.winner_player_id` / `voided` / `settled_at`; winner copied to parent side | `apply-results.ts` + `claim_settlement` |
| **Product** | `brackets.points`, `brackets.rank` | `settle-leagues` (~15m) or founder/commissioner `actions/settlement.ts` |

A public page can show official **WON** on the draw (facts) while league standings are still empty (no submitted brackets, or settle cron not run). That is **Blocked**, not Fail.

Conflict policy: if a claim already exists and the provider disagrees, ingest **must not** overwrite — look for `ops_events` `winner_conflict`.

---

## 8. What the manual said to leave alone (still true)

Do **not** treat these as broken just because the manual proposed new workers:

- Tournament calendar upsert and dual-tour ATP/WTA rows
- Lifecycle chip set (pending / open / locked / on court / complete)
- League / invite / solo-entry product model
- i18n locales
- Bracket **rendering** once seats are correct (ordering bugs are data, not CSS)

---

## 9. Gaps that remain vs the manual (do not pretend they shipped)

Mark **N/A** in the checklist; they are not launch proof of the current stack:

- Matchstat-specific clients and `/seeds` ingest (client exists in provider; **sync does not call** `getTournamentSeeds`)
- In-browser Socket.IO, `join-event`, live score overlay, “reconnecting” banner
- Slot-keyed picks
- Dedicated draw-refresh / mapping-warmup / live-polling **workers**
- User notification copy for “Lucky loser X replaces Y”
- Draw-revision audit UI (founder shows replacement **counts**, not a slot diff viewer)

---

## 10. How this check pack uses the file

The manual is the **question list**. This repo is the **answer key**.

- Every checklist item cites a manual section **and** a real path or UI string.
- Inferred filenames from the manual are never used as pass criteria.
- Pure-fact rules in `.cursor/rules/pure-fact.mdc` and `publish-complete-draw.mdc` override any manual line that would hide official TBD seats or invent a 64-draw from named pairs.
