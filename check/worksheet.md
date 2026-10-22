# Manual check worksheet

Copy this file (or duplicate the table) per run. Do not put secrets here.

Identify events by **slug / provider id**, never by a proper event or league title.

```text
Date (UTC):          19 Sep 2026 ~22:30 UTC (tester local 17:30–17:38 America/Chicago)
Tester:              guest browser pass on production (no signed-in / founder session)
Origin (prod / staging): prod — https://www.matchreadtennis.com
Published slug {PUB}: t-wta-16748 (Open, official 32-draw)
                      also walked: t-wta-16747 (Open, 28-in-32 + seed byes),
                      t-wta-16746 (On court),
                      t-atp-21349 (Complete, 128),
                      t-atp-21347 (Complete, 128-slot Masters)
Pending slug {PEND}: t-atp-21352 (Draw pending)
Official comparator: official tour draw pages for t-wta-16748 and t-wta-16747;
                      third-party bracket for t-wta-16746
Founder session (yes/no): no
Provider/ops access (yes/no): no
```

Verdict: **Pass** / **Fail** / **Blocked** / **N/A**  
If **Fail** on a STOP item, stop the pack and write the evidence.

This run **continued after STOP fails** so the rest of the pack could be recorded. STOP fails: D1, E4, H2.

---

## V3 milestone run (copy table per audit)

Plan: [V3-MILESTONE-CHECKLIST.md](./V3-MILESTONE-CHECKLIST.md) · Tests: [V3-TEST-PLAN.md](./V3-TEST-PLAN.md)

```text
Date:
Git ref:
Milestone under review: M1 | M2 | M3 | M4
```

| Id / Command | Verdict | Evidence |
|--------------|---------|----------|
| M3.0 / live-ingest integration | | |
| npm run ci:live-trust | | |
| … | | |

---

## Preconditions

| Id | Verdict | Evidence (URL, screenshot note, slug) |
|----|---------|----------------------------------------|
| A1 | Pass | `/` guest: **Sign in** in header; no **Sign out** |
| A2 | Pass | `/tournaments` lists real ATP/WTA names and dates from `public_calendar`. No `Player 12` / `p-0` |
| A3 | Pass | PUB `t-wta-16748` **Open** + Official draw. PEND `t-atp-21352` **Draw pending** |
| A4 | Pass | Official tour draw pages for the two open WTA slugs, plus the in-play third-party bracket, opened before treating MatchRead as truth |

## B — Calendar / lifecycle

| Id | Verdict | Evidence |
|----|---------|----------|
| B1 STOP | Pass | ` /tournaments/t-atp-21352`: **Draw pending**; “Picking opens when the official draw is published.”; “Starts in 37 hours.” No Official draw heading, no invented names |
| B2 | Pass | Pending slug has no **First round so far** block (no announced pairs to invent) |
| B3 STOP | Pass | `t-wta-16748` / `t-wta-16746` / `t-atp-21349` / `t-atp-21347` all show **Official draw**, not “full bracket is not published yet” |
| B4 | Pass | `t-atp-21352` Draw pending; two WTA slugs Open; `t-wta-16746` On court + “This tournament is in play.”; two Complete slugs + “This tournament has finished.” |
| B5 | Pass | Homepage “2 draws are open right now” = `t-wta-16748` + `t-wta-16747` only. On court = `t-wta-16746` + one other in-play event. Upcoming includes `t-atp-21352` and later events. No event in two buckets |
| B6 | Pass | `t-atp-21349` public dates **31 Aug – 13 Sep 2026** (main-draw window, not qualifying week) |
| B7 | Blocked | No clay/grass event on the public calendar this window. Listed hard-court slugs render Hard |
| B8 | Pass | Locale `es` on `t-wta-16748`: **Rellenar un cuadro**, **Cuadro oficial**, **Dura**, **Abierto**; surnames unchanged. Round titles stay English (“Round of 32”). `ja` not fully walked |

## C — Trust

| Id | Verdict | Evidence |
|----|---------|----------|
| C1 | Pass | Guest sees `t-wta-16748` / `t-wta-16746` / `t-atp-21349` names, tags, later rounds without sign-in |
| C2 | Pass | Public pages have no “Your picks” / “Your bracket” / “saved pick” |
| C3 | Pass | `/founder` → `https://www.matchreadtennis.com/sign-in?next=%2Ffounder` |
| C4 | Pass | Public list is ATP/WTA 250+ only; no ITF/Challenger rows |

## D — Official draw

| Id | Verdict | Evidence (pair that failed, official vs MatchRead) |
|----|---------|-----------------------------------------------------|
| D1 STOP | Fail | `t-wta-16748` official: Qualifier vs Linette (7), Qualifier vs Joint (5), Jones vs Qualifier. MatchRead: those sides are **BYE · ADVANCES** and the named player is already in R16. `t-wta-16747` official: Qualifier vs Fernandez (6), Krejcikova vs Qualifier, Hunter vs Qualifier, Mladenovic vs Qualifier. MatchRead: all four are **BYE · ADVANCES**. Named-vs-named pairs on `t-wta-16748` (Ostapenko–Zakharova, Preston–Sakatsume, …) match the official tour sheet |
| D2 STOP | Pass | `t-wta-16748`: 16 R32 nodes (32 seats). `t-atp-21349`: 64 timed R128 matches. `t-atp-21347`: Round of 128 (Masters 128-slot sheet) |
| D3 STOP | Pass | No `Player47`, `p-0`, or invented qualifier names. Occupants are real surnames, **Bye**, or (incorrectly) bye instead of TBD — that last case is E4, not fiction |
| D4 | Pass | `t-wta-16748` / `t-wta-16746` R32: each named person in one seat. Duplicate surnames not observed as the same person twice |
| D5 | Pass | Later rounds on `t-wta-16748` are **Not played** (plus auto-advanced bye winners). No second invented 32-name list |
| D6 | Pass | `t-wta-16746` R32 clock labels stay in bracket order (01:30, 01:30, 04:40, 02:00…) — not resorted by session |

## E — Seeds / tags / byes / TBD

| Id | Verdict | Evidence |
|----|---------|----------|
| E1 | Pass | `t-wta-16748`: Ostapenko 1, Birrell 2, Tararudee 3, Ruse 4, Joint 5, Bondar 6, Linette 7, Rakhimova 8 on the official people |
| E2 | Pass | `t-wta-16746`: WC / Q / LL on named players (Barros WC, You Q, Kinoshita LL, …). `t-atp-21349`: Q/WC/LL counts present. `t-wta-16748`: Park WC, Back WC |
| E3 | Fail | `t-wta-16747` official 28-draw has **4** seed byes (Andreeva, Mertens, Eala, Anisimova) — those four match. MatchRead also byes Fernandez/Krejcikova/Hunter/Mladenovic (official Qualifier opponents). `t-wta-16748` has **no** official byes; MatchRead invented four. `t-atp-21347` official byes render as **BYE · ADVANCES** (32) |
| E4 | Fail | Official Qualifier TBD never appears as **Qualifier / Lucky Loser**. Converted to bye + auto-advance instead |
| E5 | Blocked | No founder `/founder/integrity` session; no `bye_to_player` row inspected |

## F — Picks

| Id | Verdict | Evidence |
|----|---------|----------|
| F1 | Pass | `t-wta-16748` **Fill a bracket** → `/sign-in?next=%2Fenter%2Ft-wta-16748`. Direct `/enter/t-wta-16748` same redirect. Guest radios are readonly |
| F2 | Pass | Complete slugs: no Fill; **Start a league** remains; “This tournament has finished.” `t-wta-16746` (on court): no Fill |
| F3 | Blocked | Needs signed-in `/enter` or league editor |
| F4 | Blocked | Needs signed-in complete-tree submit |
| F5 | Pass | `/leagues/not-a-real-league/t/t-wta-16748/bracket` → sign-in; no foreign pick sheet |

## G — Lock

| Id | Verdict | Evidence (`lock_at` ISO, first timed match) |
|----|---------|-----------------------------------------------|
| G1 STOP | Blocked | No public `lock_at` / EntryLockWhen caption on `t-wta-16748` (open, week not started) or `t-wta-16746` (on court). In-play first timed R0 shown as **15 SEP · 01:30 PM**; entry already closed — consistent but ISO not proven from DB |
| G2 | Pass | Pending slug (no sheet, no lock) is Draw pending, not Open now |
| G3 | Blocked | No signed-in locked editor |
| G4 | Blocked | No commissioner league |

## H — Results / settlement

| Id | Verdict | Evidence |
|----|---------|----------|
| H1 | Pass | `t-wta-16746` R32 occupants + later-round names match the official comparator (Semenistaja/Kinoshita LL, Kostovic/Barros WC, …; QF Kostovic–Quevedo, Blinkova–Charaeva, Podoroska–Lamens, Stoiana–Badosa) |
| H2 STOP | Fail | `t-atp-21347` Complete: **FINAL 21 Arthur Fils FRA / Not played**. QF and SF also have a **Not played** hole. `t-atp-21349` final **Zverev vs Shelton** and `t-wta-16746` final **Quevedo vs Podoroska** are filled |
| H3 | Blocked | No retirement / walkover annotation checked |
| H4 | Pass | In-play public tree already matches official finished results (guest snapshot; did not wait a live ingest cycle) |
| H5 | Blocked | No submitted league / standings session |
| H6 | Blocked | No founder `winner_conflict` view |
| H7 | Blocked | No submitted bracket on a bye event |

## I — Replacements

| Id | Verdict | Evidence |
|----|---------|----------|
| I1 | Blocked | No founder replacement count / `draw_replacements` |
| I2 | Blocked | No pre-lock pick + LL swap to observe |
| I3 | Blocked | No post-lock replacement + editor |
| I4 | Blocked | No played-slot identity correction observed |

## J — Live / event map

| Id | Verdict | Evidence |
|----|---------|----------|
| J1 | N/A | `t-wta-16746` shows schedule times, not point-by-point. UI does not claim a live socket feed |
| J2 | Pass | Finished in-play matches are on the public sheet (same as H1) |
| J3 | N/A | No in-app Socket.IO (ingest-only by design) |
| J4 | N/A | No reconnect banner; no implied live feed |

## K — Integrity / ops

| Id | Verdict | Evidence |
|----|---------|----------|
| K1 STOP | Blocked | No unpublished `safe_to_publish = false` event observed as guest |
| K2 STOP | Blocked | No founder `refresh_blocked_keep_published` event |
| K3 STOP | Pass | `t-atp-21349` is main-draw names/seeds (Zverev 1, Alcaraz, Q/WC/LL in main). Not a qualifying 128 |
| K4 | Blocked | No `.env.provider` / probe scripts run |
| K5 | Pass | Only public pages. Did not call `ingest-events`, `rebuild-draw`, or `settle-slate` |

## L — Viewport

| Id | Verdict | Evidence |
|----|---------|----------|
| L1 | Pass | `t-wta-16748` at ~390px: tree readable, long names ellipsize (`Ostapen…`). Not two players collapsed into one |
| L2 | Pass | Desktop `t-wta-16748` / `t-wta-16746` named-pair order matches official (except the Q/bye slots already failed in D1) |

## M — Cross-page

| Route | Verdict | Note |
|-------|---------|------|
| `/` | Pass | Same buckets as B5; open / pending / on-court slugs as above |
| `/tournaments` | Pass | Same chips and slugs |
| `/tournaments/{slug}` | Pass | Same sheet / status as calendar |
| `/enter/{slug}` | Pass | Guest → sign-in with `next=/enter/t-wta-16748` (pickability not tested signed-in) |
| league hub | Blocked | No member league |
| league bracket | Blocked | Fake slug only proved sign-in gate (F5) |
| league result | Blocked | No member result page |

## N — Explicit N/A

| Id | Ticked N/A | Note |
|----|------------|------|
| N1 Matchstat clients | yes | Provider is RapidAPI Tennis API |
| N2 draw_slots / bracket_nodes | yes | Live tables are `seats` / `matches` |
| N3 chosen_slot | yes | Picks still `player_id` |
| N4 Browser Socket.IO | yes | Not in `apps/web` |
| N5 BullMQ workers | yes | Cron `sync-facts` / `settle-leagues` |
| N6 LL push copy | yes | Not shipped |
| N7 User draw-diff UI | yes | Not shipped |
| N8 Doubles / juniors product | yes | Not a bracket surface |

---

## Launch sequence (if used)

Window: not run as a ceremony clock. Slugs above were a **guest checklist pass**, not T−72h ops.

| Id | Verdict | Evidence |
|----|---------|----------|
| L72-1 | N/A | Launch sequence not run |
| L72-2 | N/A | |
| L72-3 | N/A | |
| L72-4 | N/A | No `probe:rapidapi` |
| L72-5 | N/A | No founder session |
| L72-6 | N/A | |
| L72-7 | N/A | |
| L0-1 | N/A | |
| L0-2 | N/A | |
| L0-3 | N/A | |
| L0-4 STOP | N/A | Covered by D1 on the two open WTA slugs instead |
| L0-5 | N/A | |
| L0-6 | N/A | |
| L0-7 | N/A | |
| L0-8 | N/A | |
| L2-1 | N/A | |
| L2-2 | N/A | |
| L2-3 | N/A | |
| L2-4 | N/A | |
| L2-5 | N/A | |
| L2-6 | N/A | |
| L1-1 | N/A | |
| L1-2 | N/A | |
| L1-3 | N/A | |
| L1-4 | N/A | |
| L1-5 | N/A | |
| L1-6 | N/A | |
| L1-7 | N/A | |

---

## Summary

```text
Pass:     32  (A1–A4, B1–B6, B8, C1–C4, D2–D6, E1–E2, F1–F2, F5, G2, H1, H4, J2, K3, K5, L1–L2, M home/calendar/event/enter)
Fail:     4   (D1, E3, E4, H2)
Blocked:  16  (B7, E5, F3–F4, G1, G3–G4, H3, H5–H7, I1–I4, K1–K2, K4, M league*)
N/A:      11+ (J1, J3–J4, N1–N8, launch L72/L0/L2/L1)
STOP failures (ids): D1, E4, H2  (E3 is Fail but not marked STOP in the pack)
Ship / no-ship recommendation: No-ship the two open WTA slugs as a clean official sheet until Qualifier seats are TBD (or named), not byes. t-wta-16746 + t-atp-21349 show the intended stack working. t-atp-21347 still has a settlement hole in the final.
```

## Failures (write facts, not feelings)

```text
Id: D1 STOP
What you opened: https://www.matchreadtennis.com/tournaments/t-wta-16748
                 https://www.matchreadtennis.com/tournaments/t-wta-16747
What the official source showed:
  t-wta-16748 — Qualifier vs Linette (7); Qualifier vs Joint (5); Jones vs Qualifier
  t-wta-16747 — Qualifier vs Fernandez (6); Krejcikova vs Qualifier;
              Hunter vs Qualifier; Mladenovic vs Qualifier
  (t-wta-16747 also has four official seed byes: Andreeva, Mertens, Eala, Anisimova)
What MatchRead showed: those Qualifier sides as BYE · ADVANCES; named players already in R16
Why this violates a current product rule: slot order must be the official draw; do not invent byes or hide official TBD
```

```text
Id: E3
What you opened: t-wta-16748 + t-wta-16747 as above; t-atp-21347 for official byes
What the official source showed: t-wta-16748 32-draw, no byes. t-wta-16747 28-draw = 4 official seed byes only
What MatchRead showed: t-wta-16748 4 invented byes; t-wta-16747 8 BYE · ADVANCES (4 official + 4 Q-as-bye)
Why this violates a current product rule: byes only if the official draw published them
```

```text
Id: E4
What you opened: same two official WTA draws vs MatchRead sheets
What the official source showed: Qualifier TBD seats still unnamed
What MatchRead showed: no “Qualifier / Lucky Loser” label; TBD replaced by bye
Why this violates a current product rule: official Q/LL TBD must stay visible until named; fail open on official seats
```

```text
Id: H2 STOP
What you opened: https://www.matchreadtennis.com/tournaments/t-atp-21347 (Complete)
What the official source showed: that event finished with a champion (not re-fetched slot-by-slot this run)
What MatchRead showed: FINAL “21 Arthur Fils FRA” vs “Not played”; QF/SF also have a Not played hole
Why this violates a current product rule: a completed event must advance winners through the tree; later rounds must not stay empty when the week is over
Contrast: t-atp-21349 final Zverev vs Shelton; t-wta-16746 final Quevedo vs Podoroska — those pass
```
