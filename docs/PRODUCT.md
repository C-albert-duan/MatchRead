# Product — MatchRead

A tennis prediction platform where a group of people fill in tournament brackets together and keep the group across a whole season.

**Not gambling and not fantasy** — no entry fees, no wagering, no odds. The point is getting better at reading tennis.

The sentence the product is built around: *"I wonder what happened in my league today"* — the **Daily Check**.

## Integrity rules (enforced in Postgres, not just UI)

1. **Picks are secret until the draw locks.** Community split is hidden until you have picked.
2. **Rating scores difficulty, not volume.** No strategy farms rating by volume alone.
3. **Comments open only after a match finishes, and only inside that match.** No global feed, no DMs.

## Growth loop (must work for US Open)

Create a league → share a link → friends join → everyone completes brackets → standings update → users return for the Daily Check.

The critical calendar window: draw ~27 August → lock ~11:00 ET 30 August. League creation and invites must be public **weeks earlier**.

## Terminology

| Term | Meaning |
|---|---|
| **League** | The social object (formerly "pool") |
| **Player** | A tennis player |
| **Member** | A person in a league |
| **Bracket** | A member's tournament tree of picks |
| **Daily Check** | Computed personal pulse for "what happened today" |

## Design philosophy (CEO)

Do not optimize for being another tennis scores app. Optimize for a March Madness–style social event around the US Open. Every feature should answer one of:

1. Did something change for me?
2. Did I move in my league?
3. Do I have something worth sharing?

See [FEATURE-PRIORITIES.md](./FEATURE-PRIORITIES.md).
