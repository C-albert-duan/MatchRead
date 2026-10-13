# MatchRead manual check pack

Human QA for the product as it runs today. **No code is changed by this folder.**

## Source

Deep-analyzed file:

[`discussion/MatchRead-Matchstat-Integration-Manual.md`](../discussion/MatchRead-Matchstat-Integration-Manual.md)

That manual was written **without this repository** (black-box production audit, 17 Aug 2026) and assumes a **Matchstat** client that this repo does **not** ship. Runtime truth is Tennis API → `sync-facts` → `seats` / `matches`. See [00-source-analysis.md](./00-source-analysis.md).

## How to use

1. Read [00-source-analysis.md](./00-source-analysis.md) once so names in the manual (`draw_slots`, `workers/`, Matchstat `/draws`) do not send you looking for files that do not exist.
2. Pick **two live events** before you start:
   - **Published:** official sheet is live (`published_at` set, seat count = `draw_size`). Prefer an in-play or recently finished event.
   - **Pending:** no official sheet yet (`published_at` null). Prefer a named upcoming or in-week “awaiting draw” event.
3. Walk [MANUAL-CHECKLIST.md](./MANUAL-CHECKLIST.md) in order. Stop on any **STOP** fail (do not continue past it).
4. For a ceremony / first-ball window, also run [launch-sequence.md](./launch-sequence.md).
5. Record verdicts in [worksheet.md](./worksheet.md).

## Verdict rules

| Mark | Meaning |
|------|---------|
| **Pass** | Observed behaviour matches the *current* product rule in the item |
| **Fail** | Observed behaviour violates the product rule |
| **Blocked** | Cannot run (no event in that state, no founder session, no provider access) |
| **N/A** | Item is Matchstat-future or not in this codebase — do not fail the product for it |

**Fail closed on fiction.** Invented names, padded draw sizes, guessed byes, or a lock time the provider did not prove are automatic **Fail + STOP**.

**Fail open on official seats.** A published official sheet with Q/LL TBD or official byes is a **Pass** if those seats are shown in official order. Waiting for every qualifier to be named is a **Fail**.

## Surfaces (do not invent URLs)

| Surface | Path / command |
|---------|----------------|
| Production | `https://www.matchreadtennis.com` (or your staging origin) |
| Landing | `/` |
| Calendar | `/tournaments` |
| Event | `/tournaments/{slug}` — `{slug}` is `tournaments.slug` (app calls it `ref`) |
| Solo enter | `/enter/{slug}` |
| League bracket | `/leagues/{leagueSlug}/t/{slug}/bracket` |
| League result | `/leagues/{leagueSlug}/t/{slug}/result` |
| Sign-in | `/sign-in` |
| Founder | `/founder`, `/founder/integrity` |
| Ingest | `POST /functions/v1/sync-facts` (ops only; `INGEST_SECRET`) |
| Local preview | `npm run publish:draws` (dry), `npm run tennis:verify -- --slug …` |

Public discovery must come from **`public_calendar`**, never raw `tournaments`.

## Complementary automation (not a substitute)

| Automated | Manual still required |
|-----------|------------------------|
| `apps/web/e2e/live-checklist.spec.ts` | Slot-by-slot official-draw eye check |
| `apps/web/e2e/live-checklist-auth.spec.ts` | Lucky-loser / replacement notification feel |
| `packages/core` + provider unit tests | Locale + mobile 128-draw |
| `npm run verify:settlement` | Standings after a real finished match |

## File index

| File | Role |
|------|------|
| [00-source-analysis.md](./00-source-analysis.md) | Manual vs this repo (names, gaps, what is already built) |
| [MANUAL-CHECKLIST.md](./MANUAL-CHECKLIST.md) | Numbered human checks |
| [launch-sequence.md](./launch-sequence.md) | Time-ordered window (T−72h → Day 1) |
| [worksheet.md](./worksheet.md) | Pass / fail log |
| [MILESTONE-1-UPDATES.txt](./MILESTONE-1-UPDATES.txt) | M1 what shipped + how users and ops verify it |

## Do not

- Treat `discussion/` paths (`ingest-events`, `rebuild-draw`, `apps/worker`, `settle-slate`) as live.
- Treat `⟨inferred⟩` filenames in the source manual as real.
- Change application code to “make a check pass.” File a finding instead.
