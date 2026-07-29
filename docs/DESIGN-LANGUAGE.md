# Design Language

Tokens for implementation live in `packages/tokens`. Seeded from `Wireframe/MatchRead-main/matchread-spec/css/tokens.css`.

## Meaning colours

| Token | Hex | Meaning |
|---|---|---|
| `--mr-read` | `#15181B` | User commitment (pick / ink) |
| `--mr-data` | `#0A6B42` | Verified tournament fact |
| `--mr-miss` | `#C93F36` | Incorrect / miss |
| Court clay/grass/hard | … | Surface context only |

Primary button is **charcoal**, not green — green would imply a verified result.

## Type

| Role | Stack |
|---|---|
| Display | Archivo |
| Body | Instrument Sans |
| Numerals | IBM Plex Mono (tabular) |

Production may self-host licensed fonts later; system fallbacks are acceptable early.

## Rules

- No shadows anywhere. Elevation: canvas / raised / sunken.
- Hairlines over boxes; eyebrow separates sections.
- 4pt spacing scale (`--s-xs` … `--s-5xl`).
- 44px minimum touch (`--touch`).
- Motion 120 / 220 / 340ms; neutralize under `prefers-reduced-motion`.
- No state by colour alone — words for screen readers.

## Components to extract early

- **PlayerChip** — seed / name / country once
- **BracketGrid** — radiogroup, rounds as columns, distinct empty states (bye · em dash · unpicked)
- **LeagueCard**, **StandingsTable**, **MatchCard**, app shell nav

Scaffolding in the wireframe (charcoal dock, state rails) is **not** product — do not build it.
