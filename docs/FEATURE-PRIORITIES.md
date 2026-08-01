# Feature Priorities (CEO)

Source: `Wireframe/MatchRead_US_Open_MVP_Feature_Priorities.pdf`

**Objective:** Create the most engaging digital bracket experience for the US Open. Every feature should increase emotional investment, daily retention, league competition, or organic sharing. Avoid generic tennis-app functionality before launch.

**Engineering status (2026-07-31):** Tier 1 **code shipped** — owner E2E in [completion Phase 10](./plans/09-completion-to-launch.md#phase-10--owner-e2e-sign-off). Tier 2–3 = [Phase 14](./plans/09-completion-to-launch.md#phase-14--ceo-tier-2--3-optional) (deferred).

## Tier 1 — Must Have

| Feature | Behaviour | Surfaces on | Status |
|---|---|---|---|
| **Pick Confidence** | Assign confidence (1–5) to every pick. High-confidence misses create memorable moments. | Bracket entry | **Code done — E2E** |
| **Bracket Health** | Status: Elite / Surviving / Hanging On / In Trouble — not only a score. | League home, tournament, Daily Check | **Code done — E2E** |
| **Biggest Miss** | Highlight each user's most costly incorrect pick after every round/day. | Daily Check / Recap | **Code done — E2E** |
| **Perfect Picks Remaining** | Remaining perfect picks + tournament-wide perfect bracket count. | Bracket locked, league home | **Code done — E2E** |
| **Live Leaderboard Movement** | Rank Δ (+/−), biggest climber, new personal best. | Standings, Daily Check | **Code done — E2E** |
| **League Highlights** | Auto labels: Biggest Climber, Upset King, Biggest Collapse, Cold Streak. | League home | **Code done — E2E** |
| **Daily Recap** | Yesterday's results, biggest upset, league movement, today's key matches. | League home (Daily Check family) | **Code done — E2E** |

## Tier 2 — High value if time allows

| Feature | Notes | Status |
|---|---|---|
| Fan Pick Percentages | Only after lock (integrity: splits hidden until pick/lock) | **Not started** (Phase 14) |
| AI Match Insights | No betting advice | **Not started** (Phase 14) |
| Upset Alerts | Needs notifications — out of web MVP pull model unless in-app | **Not started** (Phase 14) |
| MatchRead Pulse | Per-match impact on bracket, ranking, league chances | **Not started** (Phase 14) |

## Tier 3 — Nice to have

| Feature | Status |
|---|---|
| Share Cards · Prediction DNA · Trophy Cabinet · Bracket Timeline | **Not started** (Phase 14) |

## Mapping to engineering phases

- Tier 1 built in [plans/06-ceo-tier1-engagement.md](./plans/06-ceo-tier1-engagement.md); sign-off via completion Phase 10.
- Tier 2–3 only after private beta (completion Phase 12) unless a Tier 1 gap forces a pull-forward — see [09-completion-to-launch.md](./plans/09-completion-to-launch.md).
