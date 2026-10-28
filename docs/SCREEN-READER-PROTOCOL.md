# Screen-reader protocol (M4.12)

Run this against the Stage (`/me`) and the live bracket (`/tournaments/[ref]`) before an M4 release, and record the result at the bottom. It needs a person with a screen reader; automated tests cover the structure, not what is spoken.

## Setup

| Reader | Browser | Platform |
|---|---|---|
| NVDA (current) | Firefox and Chrome | Windows |
| VoiceOver | Safari | iOS (320–390 px wide) |

- A signed-in account holding a locked bracket in a tournament with at least one live match. Locally: `db reset`, then the `my-tennis.spec.ts` / `live-client.spec.ts` seeds, and push frames with the listener or the spec helpers.
- NVDA: speech viewer on, so the spoken text can be copied into the results.

## What the page should expose

- `/me`: one `<section class="stage">` named by its headline, `#stage-status`, which is the page's only Stage live region (`role="status"`, `aria-live="polite"`). The headline text changes only when the Stage state changes.
- Live scores are patched into bracket cells and match rows with no live region, so a score tick is never spoken.
- `/tournaments/[ref]`: the bracket is a `region` named "Tournament bracket"; each match is a named `radiogroup` (or `group` for a bye) whose label gives round, match number and state.
- When the feed is delayed, one `role="status"` banner ("delayed", "last updated N min ago") appears above the page.
- Nothing on either page moves focus by itself.

## Steps

| # | Page | Action | Expected |
|---|---|---|---|
| S1 | `/me` | Load the page, read from the top (NVDA: Insert+Down) | The Stage headline is read once as part of the page; the Stage facts read as term/value pairs (`dl`) |
| S2 | `/me` | Jump by landmark / region | The Stage is reachable and announced by its headline text |
| S3 | `/me` | Leave the cursor on the list, push 5 score frames that keep the same leader | Nothing is spoken; focus and reading position stay put |
| S4 | `/me` | Push a frame that changes the leader of a live match | The page refreshes (within 5 s); focus and reading position stay put; no score is spoken |
| S5 | `/me` | Move a match from scheduled to live so the Stage goes `morning` → `live` | The new headline is spoken once, politely (after current speech), and nothing else |
| S6 | `/me` | Finish the live match officially so the Stage goes to `next` or `reckoning` | The new headline is spoken once |
| S7 | `/me` | Turn on reduced motion in the OS, reload | No animated live badge; content and reading order unchanged |
| B1 | bracket | Load, jump to the "Tournament bracket" region, step through matches | Each match is read with round, match number and state; the decorative court is skipped |
| B2 | bracket | Push score frames for a match while reading another | Nothing is spoken; reading position stays put |
| B3 | bracket | Push a provisional final (socket says finished, not yet settled) | The cell does not announce a winner; reading the cell gives the interim state, not an advanced player |
| B4 | bracket | Stop the listener until the delay banner appears, then wait 3 minutes | The banner is spoken when it appears. Note whether each minute change of "last updated" is spoken again; more than once a minute is a fail |
| B5 | both | Tab through the page with the keyboard only | Focus order follows the visual order; no focus jump happens on a live update or refresh |

Pass means every row matches its Expected column on both readers. Record anything spoken that the table does not predict.

## Results

| Date | Tester | Reader / browser | Build (commit) | Failed steps | Notes |
|---|---|---|---|---|---|
| | | | | | |
