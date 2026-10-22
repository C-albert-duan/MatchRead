# Specific manual checklist

Walk in order. Record each id in [`worksheet.md`](./worksheet.md).  
**STOP** items: do not continue the pack if one fails.

Pick slugs from the live calendar. Never hard-code a tournament URL — copy `tournaments.slug` from `/tournaments` or `public_calendar`.

```text
Published event page:  /tournaments/{PUB}
Pending event page:    /tournaments/{PEND}
Solo enter (signed in): /enter/{PUB}
```

---

## A. Preconditions

### A1. Guest session
- **Source:** manual §2 (public audit); e2e item 1
- **Do:** Open `/` in a private window. Confirm no **Sign out**.
- **Pass:** Landing loads; header offers sign-in, not sign-out.
- **Fail:** Already signed in as someone else.

### A2. Calendar is reachable
- **Source:** manual §2.5
- **Do:** Open `/tournaments`. Confirm ATP/WTA rows with real names and dates.
- **Pass:** List comes from eligible events (you can later prove `public_calendar` in C2).
- **Fail:** Empty calendar while production should have a tour week, or invented placeholder names (`Player 12`, `p-0`).

### A3. Two events selected
- **Source:** this pack
- **Do:** Write `{PUB}` and `{PEND}` on the worksheet with status chips you see.
- **Pass:** One published (heading **Official draw** or a full sheet). One pending (chip **Draw pending** or **awaiting draw** / upcoming without a sheet).
- **Blocked:** No pending event this week — skip only **B** items marked pending-only; do not skip published checks.

### A4. Official comparator ready
- **Source:** manual §17.4
- **Do:** Open the official tournament draw (ATP/WTA site or the event’s official draw PDF/page) for `{PUB}` **before** looking at MatchRead’s sheet.
- **Pass:** You have the official first-round order in another tab.
- **Fail:** You are about to “remember” the draw. Stop and find the official sheet.

---

## B. Calendar and lifecycle (manual §2.4, §2.5, §15)

### B1. Pending event has no invented bracket — STOP
- **Source:** manual §2.1 / §7; pure-fact “draw pending”
- **Do:** Open `/tournaments/{PEND}`.
- **Pass:** Title/chip **Draw pending**. Body **Picking opens when the official draw is published.** No **Official draw** heading. No fictional 32/64/128 names.
- **Fail + STOP:** A full bracket of invented or padded seats, or “Official draw” with no `published` sheet.

### B2. Pending may show announced named pairs
- **Source:** publish-complete-draw; UI `AnnouncedFirstRound`
- **Do:** If first-round names exist, look for **First round so far** and `{have} of {need} first-round matches are named`.
- **Pass:** Only **named** pairs appear. Partial pair (named vs Q/LL) is visible; TBD side is not pickable as a person.
- **Fail:** Qualifying-draw matches, or a guessed opponent name.

### B3. Published event is not “draw pending” — STOP
- **Source:** manual §2.1 published-sheet-hidden-as-pending defect
- **Do:** Open `/tournaments/{PUB}` on an event that has an official main draw.
- **Pass:** Heading **Official draw**. Status is **Open now**, **Locked**, **On court**, or complete — not **Draw pending** hiding the sheet.
- **Fail + STOP:** In-play or pre-play event with a known official draw still shows only “The full bracket is not published yet” and no sheet.

### B4. Status chip matches the week
- **Source:** `apps/web/lib/tournaments/status.ts` `calendarStatus`
- **Do:** Compare chip to facts: `published_at`, `lock_at` vs now, `main_draw_starts_on` / `ends_on`.
- **Pass:**
  - No sheet → **Draw pending**
  - Sheet + lock in the future + not complete → **Open now** (or open copy)
  - Sheet + lock passed + week not started → **Locked**
  - Sheet + lock passed + week started → **On court** (“This tournament is in play.”)
  - After `ends_on` → complete (“This tournament has finished.”)
- **Fail:** On court while still pickable; open while lock has passed; complete while the week is ongoing.

### B5. Homepage partitions do not double-count
- **Source:** manual D2; `partitionLandingCalendar`
- **Do:** On `/`, read **Open now**, **On court**, **awaiting draw**, **Upcoming** (max 6 upcoming, 14-day horizon).
- **Pass:** `{PUB}` appears in **exactly one** bucket. Upcoming is not a dump of every ITF. Open-now count is not “all in-play events.”
- **Fail:** Same event in two buckets, or homepage claims N “open draws” while listing a different in-play set as open.

### B6. Dates prefer main-draw day
- **Source:** `main_draw_starts_on` vs week `starts_on`
- **Do:** For a slam or event whose qualifying week starts earlier, compare the public date line to the official **main draw** start, not the qualifying Monday.
- **Pass:** Product date is the main-draw window (or clearly the week the UI documents).
- **Fail:** Qualifying week sold as main-draw start.

### B7. Surface is ingested, not defaulted Hard — STOP if slam clay/grass is Hard
- **Source:** manual D1
- **Do:** Find a clay or grass event on `/tournaments` (or a known clay Challenger/250). Open it.
- **Pass:** Lead line matches reality (Clay / Grass / Hard / Carpet). Unknown surface is **not** labelled Hard.
- **Fail:** A clay or grass event showing **Hard**. Unknown coerced to Hard.

### B8. Locales
- **Source:** manual §17.4
- **Do:** Switch `en` → `es` → `ja` on `{PUB}` and `{PEND}`.
- **Pass:** Status, CTAs, TBD (“Qualifier / Lucky Loser” and locale equivalents), and tag badges translate. Player **surnames** stay as facts.
- **Fail:** Mixed leftover English on status/CTA, or names “translated.”

---

## C. Trust boundary (manual §3.10 / architecture)

### C1. Guest can read the public sheet
- **Source:** facts are world-readable
- **Do:** Stay logged out on `/tournaments/{PUB}`.
- **Pass:** Official names, byes, TBD, and official **WON** grades are visible.
- **Fail:** Forced sign-in just to **see** the draw.

### C2. Guest cannot read other people’s picks
- **Source:** manual privacy; e2e item 14
- **Do:** On the public `{PUB}` page, search for “Your picks”, “Your bracket”, “saved pick.”
- **Pass:** No member pick list. Official results are not presented as someone’s bracket.
- **Fail:** Another user’s pick sheet is visible.

### C3. `/founder` is gated
- **Source:** e2e item 13
- **Do:** As guest, open `/founder`.
- **Pass:** Redirect to `/sign-in?next=…` or sign-in UI.
- **Fail:** Ops counts visible to the world.

### C4. Public list is eligibility-filtered
- **Source:** `public_calendar`; `product_override` is **force_off only**
- **Do:** Confirm ITF/low-tier noise is absent from `/` and `/tournaments` (ATP/WTA 250+ policy).
- **Pass:** Calendar is the product field, not the raw provider dump.
- **Fail:** Ineligible events on the public list, or a demoted event still offered as **Fill a bracket**.

---

## D. Official draw — structure (manual §7, G1, G2) — core STOP group

Do this **by eye**. Do not delegate. This is the class of bug that passes unit tests.

### D1. Slot order vs official sheet — STOP
- **Source:** manual §2.2, §7.2, §17.4
- **Do:** For `{PUB}`, walk **every first-round pairing** in official slot order (left/top of the MatchRead sheet = official position 0…n).
- **Pass:** Same opponents, same order as the official draw. Seeds sit where the **official** draw put them, not in a generated 1-vs-32 pattern.
- **Fail + STOP:** Duplicate surname in non-adjacent slots that the official sheet does not repeat; textbook synthetic seed placement; names shuffled.

### D2. Draw size is the official size — STOP
- **Source:** pure-fact; publish-complete-draw
- **Do:** Count seats on the public sheet (named + bye + TBD).
- **Pass:** Count equals official size (32 / 64 / 128). A 96-player Masters is **128 slots including seed byes**, not a 64-draw of named pairs.
- **Fail + STOP:** 32 named R128 pairs shown as a 64-draw; extra padded seats; missing official bye/TBD slots collapsed away.

### D3. No fictional occupants — STOP
- **Source:** `players` CHECKs; `isFictionalName`
- **Do:** Scan last names on `{PUB}`.
- **Pass:** Real surnames, **Bye**, or **Qualifier / Lucky Loser** (or official TBD wording).
- **Fail + STOP:** `Player47`, `p-0`…`p-15`, `Player ${id}`, or a qualifier name nobody published.

### D4. Same player is not in two R0 seats
- **Source:** manual §7.7
- **Do:** Mentally (or with find-in-page) check unique surnames+country+seed.
- **Pass:** Each named player occupies one first-round seat. Duplicate **surnames** with different given names / provider ids / countries are allowed (e.g. two Wangs).
- **Fail:** Same person listed twice.

### D5. Later rounds are a tree, not a second invented field
- **Source:** manual §7.2
- **Do:** Expand or scroll R16 / QF / etc.
- **Pass:** Empty later rounds show **Not played** (or the advanced winner after results). You never see a second 128-name list invented for R64.
- **Fail:** Generated players in later rounds.

### D6. Fixture order did not rebuild the sheet
- **Source:** manual §8; published-sheet guard
- **Do:** If `{PUB}` is in play, compare still-scheduled court order to the **bracket** order.
- **Pass:** Bracket order stays official slot order. Night-session matches are not pulled to the top of the draw.
- **Fail:** Live schedule reordered the bracket.

---

## E. Seats: seeds, tags, byes, TBD (manual §7.3–7.5, G8, G9)

### E1. Numeric seeds render
- **Source:** `seats.seed`, `PlayerChip`
- **Do:** Confirm seed numbers on `{PUB}` match the official draw (not merely 1–8 in textbook corners).
- **Pass:** Official seeds present on the correct people.
- **Fail:** Seeds missing on a slam/Masters sheet, or seeds assigned by convention.

### E2. Entry tags WC / PR / Q / LL
- **Source:** manual G8; i18n `draw.entry.*`
- **Do:** Find wild cards / PR / qualifiers / lucky losers on the official sheet; find the same badges on MatchRead.
- **Pass:** Tags visible (`WC`, `PR`, `Q`, `LL`). A seeded WC can show **both** seed and WC.
- **Fail:** Tags dropped (numeric only) on an event that has them.

### E3. Official byes
- **Source:** manual §7.4
- **Do:** On a 96-player / 128-slot Masters (or any official-bye event), find bye seats.
- **Pass:** Seat shows **Bye**, not a player named “Bye”. The non-bye side is already through to the next round (auto-advance). You cannot pick “Bye.”
- **Fail:** Bye hidden, invented, or pickable. Points awarded for a bye (check league result if you have an entry).

### E4. Official TBD (Q / LL) stays visible
- **Source:** publish-complete-draw
- **Do:** If the official draw still has Qualifier / Lucky Loser blanks, they must appear.
- **Pass:** Label **Qualifier / Lucky Loser** (or the event’s official TBD wording). Named side of a partial pair is visible; only the named side is pickable in the editor.
- **Fail:** TBD seats omitted so the field looks “complete,” or a guessed qualifier name.

### E5. Bye ↔ player mutations are official only
- **Source:** manual §7.4 edge
- **Do:** If founder `/founder` or integrity shows a `bye_to_player` / `player_to_bye` replacement, open that event.
- **Pass:** Public sheet matches the **new** official draw. Old bye/player is gone.
- **Blocked:** No such replacement this week.

---

## F. Announced matchups and picking (manual §15 entries; G7)

### F1. Public sheet is view; pick starts sign-in
- **Source:** `PublicOfficialDraw` / `enterHref`
- **Do:** Logged out, with `{PUB}` still **open**, click **Fill a bracket** (or a named seat if it routes).
- **Pass:** `/sign-in?next=` toward `/enter/{PUB}`. After sign-in you land in solo enter / bracket, not a dead page.
- **Fail:** Guest can persist picks. Or CTA missing while status is open.
- **Blocked:** `{PUB}` already locked — use F2 and G-lock items instead.

### F2. Complete event does not offer Fill — STOP if embarrassing
- **Source:** manual D4
- **Do:** Open a **finished** tournament (status complete).
- **Pass:** No **Fill a bracket**. **Start a league** may remain. Copy: “This tournament has finished.”
- **Fail:** Fill CTA on a complete event.

### F3. Named vs TBD pickability (signed in)
- **Source:** publish-complete-draw
- **Do:** In `/enter/{slug}` or league bracket, try to pick a TBD side and a named side of a partial pair.
- **Pass:** Named side pickable; TBD / Bye not offered as a winner.
- **Fail:** You can submit Qualifier or Bye as a champion pick.

### F4. Submit needs a complete tree
- **Source:** `submit_bracket` needs `draw_size - 1` picks
- **Do:** On an **open** published event, fill until one match is empty, submit.
- **Pass:** Submit refused until every node has a pick. Autosave does not race submit into “No bracket to submit” if you just clicked the last pick.
- **Fail:** Partial tree accepted as submitted, or last pick lost to debounce.

### F5. Guest cannot open someone else’s editor
- **Source:** product RLS
- **Do:** Guess `/leagues/{any}/t/{PUB}/bracket` while logged out.
- **Pass:** Sign-in or not-a-member — never another person’s live editor.
- **Fail:** Foreign picks loaded.

---

## G. Lock (manual §15; architecture flow E)

### G1. `lock_at` is a timed first ball — STOP
- **Source:** `refresh_lock_at`; pure-fact
- **Do:** On `{PUB}`, read the public lock caption (`EntryLockWhen`). Compare to the official **first timed** main-draw match, not midnight and not a date-only row.
- **Pass:** Lock instant equals the earliest R0 row with a real clock (`has_time`). Date-only fixtures did not invent `15:00` or `00:00`.
- **Fail + STOP:** Lock is midnight UTC, a guessed 15:00, or the qualifying first match.

### G2. No lock invented when only dates exist
- **Source:** `isEntryOpen` — started week + no `lock_at` is not “open”
- **Do:** If any published event has dates but no timed R0, confirm it is **not** sold as Open now.
- **Pass:** Viewing only; no pick window invented.
- **Blocked:** Every published event already has a timed lock.

### G3. After lock, writes die
- **Source:** RPC `picks_are_locked`
- **Do:** Signed in, locked event, open the bracket editor, change a pick.
- **Pass:** UI locked. Save/submit returns tournament locked (not a silent ignore that looks saved).
- **Fail:** Picks still write after lock.

### G4. Commissioner early lock (if you have a league)
- **Source:** `league_tournaments.locked_at`
- **Do:** Commissioner locks the event early.
- **Pass:** Members cannot edit; public `lock_at` unchanged.
- **Blocked:** No commissioner seat.

---

## H. Results, advance, settlement (manual §2.3, §14, G3)

### H1. Finished R0 shows on the public sheet
- **Source:** manual §2.3
- **Do:** On `{PUB}` in play or complete, find a finished first-round match.
- **Pass:** Winner marked (official grade / WON). Loser not still sitting in the next round.
- **Fail:** Finished match still **Not played** on R0.

### H2. Winner sits in the parent node — STOP if a finished event is empty
- **Source:** manual §2.3; `advanceWinnerToParent`
- **Do:** Check the R16/R32 slot that the finished R0 feeds.
- **Pass:** Winner’s name is in the next round. A completed event does **not** show only one result and a tree of **Not played**.
- **Fail + STOP:** Completed (or deep in-play) event with official results on tour sites but MatchRead later rounds all **Not played**.

### H3. Retirement / walkover
- **Source:** manual F10
- **Do:** If a match was ret. / w/o, confirm a winner exists and the annotation is honest.
- **Pass:** Winner advanced; not left void unless the provider voided both.
- **Blocked:** No ret/w/o this week.

### H4. Facts settle before product grades
- **Source:** this analysis §7
- **Do:** After a new finished match, wait up to one `sync-facts` cycle (~5 min) plus `LiveRefresh` (~45 s) **or** trigger ops reconcile.
- **Pass:** Public draw updates without a full deploy. League **points** may lag until `settle-leagues` (~15 min) or founder settle.
- **Fail:** Public winner never appears after several ingest cycles while the official result is final.

### H5. League standings move (signed-in league)
- **Source:** manual §14; `settle-leagues`
- **Do:** In a league with **submitted** brackets, after H2, open standings / `/leagues/{slug}/t/{PUB}/result`.
- **Pass:** Points/rank change for people who had that match right/wrong. Result breakdown matches official winner.
- **Blocked:** No submitted brackets. Founder may run settle once — still not a code change.
- **Fail:** Submitted field, facts settled, and standings unchanged after settle cron **and** a manual settle.

### H6. Winner conflict does not silently overwrite
- **Source:** `winner_conflict` ops event
- **Do:** Founder `/founder` — look for winner-conflict / integrity events after a messy day.
- **Pass:** Conflicts audited; public winner did not flip back and forth without a claim unwind.
- **Blocked:** No conflicts (good).

### H7. Bye advance awarded no pick points
- **Source:** manual §7.4 / §14.3
- **Do:** If `{PUB}` has byes and you have a submitted bracket, confirm bye matches were not a scoring gift.
- **Pass:** No points for auto-bye. Next **played** match is the first scored node on that line.
- **Blocked:** No byes or no entry.

---

## I. Replacements (manual §11, G4, G7)

### I1. Draw change leaves an audit row
- **Source:** `draw_revisions`, `draw_replacements`
- **Do:** Founder dashboard replacement count, or `/founder/integrity`.
- **Pass:** When the official sheet changed a name, a replacement/revision exists. Public sheet matches the **new** official name.
- **Blocked:** No LL/WD this week — write Blocked, do not Pass by assumption.

### I2. Pre-lock replacement rewrites the pick
- **Source:** `rewritePicksForReplacements`
- **Do:** If a replacement landed **before** lock and you had picked the vacated player:
- **Pass:** Editor now shows the new occupant on that match; old name is gone.
- **Fail:** Old name still stored as the pick while the seat is someone else (and no rewrite row).

### I3. Post-lock replacement does not reopen the bracket
- **Source:** manual F8
- **Do:** Replacement after lock.
- **Pass:** Editor stays locked. Public sheet shows the new official player. Standings will grade against official `winner_player_id`.
- **Fail:** Users can edit after lock because of the swap.

### I4. Played-slot identity change pages someone
- **Source:** manual `DATA_CORRECTION`
- **Do:** If a **finished** match’s player ids changed upstream:
- **Pass:** Founder/ops sees an alert; settlement did not quietly restitch history.
- **Blocked:** Has not happened.
- **Fail:** Silent rewrite of a settled match’s sides.

---

## J. Live scores and event map (manual §9–§13)

### J1. In-progress live overlay — N/A unless you see scores
- **Source:** manual D3 / G5
- **Do:** Open an on-court match page.
- **Pass / N/A:** Current product is **not** required to show point-by-point or a socket overlay. `LiveRefresh` (~45 s) re-reads Postgres only.
- **Fail:** Only if the UI **claims** live scores and shows a stale in-progress score as official truth.

### J2. Finished live matches still land as facts
- **Source:** `mapLiveFinishedToIngest` / `apply-results`
- **Do:** After a match goes final, wait an ingest cycle.
- **Pass:** Same as H1 — winner appears. This is the live path that **does** exist.
- **Fail:** Final on tour TV, never on MatchRead after multiple cycles.

### J3. Event map is ingest-only
- **Source:** `event_map`
- **Do:** Do **not** fail the product because the browser has no `socket.io-client`.
- **Pass:** Mark N/A for in-app sockets. Optional founder/ops: `event_map` rows may exist; they must not drive settlement.

### J4. No replay / reconnect banners
- **Source:** manual §12
- **N/A:** Those banners are Matchstat-live design. Honesty check: the UI must not imply a live feed it does not have.

---

## K. Integrity and ops (manual §7.7, §18 alerting)

### K1. Unpublished integrity failure leaves no public sheet — STOP
- **Source:** `draw_integrity_reports`; fail closed
- **Do:** If founder integrity shows `safe_to_publish = false` for an unpublished event:
- **Pass:** Public page stays draw pending / announced-only. No half-imported 128.
- **Fail + STOP:** Partial or qualifying sheet published as the main draw.

### K2. Failed refresh does not unpublish — STOP
- **Source:** `refresh_blocked_keep_published`
- **Do:** If a later sync failed integrity on an already public event:
- **Pass:** Old official sheet still public. Founder shows keep-published / blocked refresh. `published_at` still set.
- **Fail + STOP:** Sheet wiped to “draw pending” after a bad refresh.

### K3. Qualifying draw never published as main
- **Source:** `classifyDraw`
- **Do:** Slam week: confirm you are not looking at a 128 **qualifying** field labelled as the main draw.
- **Pass:** Main-draw names and seeds. Qual *matches* absent. Qual *seats* in the main draw (Q) present.
- **Fail + STOP:** Qualifying bracket shipped as the USO/Masters main sheet.

### K4. Ops scripts (operators only)
- **Source:** `scripts/README.md`
- **Do:** If you have `.env.provider` (do not commit it):
  1. `npm run probe:rapidapi`
  2. `npm run tennis:verify -- --slug {PUB}`
  3. Dry `npm run publish:draws` (preview only unless you intend to publish)
- **Pass:** Probe talks to Tennis API. Verify reports integrity vs DB. Preview seat list matches D1.
- **Blocked:** No provider credentials — skip without failing the product.

### K5. Do not run obsolete endpoints
- **Source:** `discussion/README.md`
- **Pass:** You used `sync-facts` / `publish:draws` / `reconcile:results` only.
- **Fail:** You called `ingest-events`, `rebuild-draw`, or `settle-slate`.

---

## L. Mobile and density (manual §17.4)

### L1. 64/128 sheet on a phone
- **Source:** manual §17.4
- **Do:** ~390px wide on `{PUB}`.
- **Pass:** First-round names readable; seeds/tags not clipped into nonsense; you can scroll the tree.
- **Fail:** Unusable overlap, or names truncated so two players look like one.

### L2. Desktop sheet
- **Source:** same
- **Do:** ≥1280px.
- **Pass:** Official order still holds; no CSS reorder.

---

## M. Cross-page state (same event, many routes)

After any of F–H, revisit:

| Route | Must still agree |
|-------|------------------|
| `/` | Same bucket as B5 |
| `/tournaments` | Same status chip |
| `/tournaments/{slug}` | Same sheet / lock / results |
| `/enter/{slug}` | Same pickability |
| `/leagues/{s}/t/{slug}` | Same lock |
| `/leagues/{s}/t/{slug}/bracket` | Same names |
| `/leagues/{s}/t/{slug}/result` | Same official winners |

**Fail** if the public page shows a winner the league result does not (after settle), or the homepage still says Open now after lock.

---

## N. Explicit N/A (manual future — do not fail)

Tick these as **N/A** so reviewers know you saw them:

| Id | Manual item | Why N/A |
|----|-------------|---------|
| N1 | Matchstat `/draws` + `/seeds` clients in `services/matchstat` | Provider is RapidAPI Tennis API |
| N2 | Tables `draw_slots` / `bracket_nodes` | Use `seats` / `matches` |
| N3 | `picks.chosen_slot` | Still `player_id` (see I2/I3) |
| N4 | Browser Socket.IO Live Session Manager | Not in `apps/web` |
| N5 | `drawRefreshWorker` / BullMQ | Folded into `sync-facts` cron |
| N6 | Push: “Lucky loser X replaces Y” | Not a shipped notification |
| N7 | Draw revision visual diff for users | Not shipped |
| N8 | Doubles / junior product surfaces | Calendar may list juniors; no doubles bracket product |

---

## Suggested stop order if time is short

1. B3, D1, D2, D3, K3  
2. G1, H2  
3. E3, E4, F2, F3  
4. C2, B5, B7  
5. Everything else  
