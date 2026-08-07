# Design Language

Tokens for implementation live in `packages/tokens`. Production look: **night-court editorial** — scoreboard-adjacent navy canvas, full-bleed court photography, hairline elevation (no decorative shadows).

## Meaning colours

| Token | Hex | Meaning |
|---|---|---|
| `--mr-read` | `#F0F6FA` | User commitment (pick / ink) on night canvas |
| `--mr-accent` | `#00A6EF` | Action / CTA (live hard-court cyan) — not a verified result |
| `--mr-data` | `#2DCF7A` | Verified tournament fact |
| `--mr-miss` | `#E0453A` | Incorrect / miss |
| Court clay/grass/hard | … | Surface context only |

Primary button is **hard-court blue**, not green — green would imply a verified result.

## Type

| Role | Stack |
|---|---|
| Display | Archivo |
| Body | Instrument Sans |
| Numerals | IBM Plex Mono (tabular) |

Production may self-host licensed fonts later; system fallbacks are acceptable early.

## Rules

- No decorative shadows. Elevation: canvas / raised / sunken + hairlines.
- Hairlines over boxes; eyebrow separates sections.
- 4pt spacing scale (`--s-xs` … `--s-5xl`).
- 44px minimum touch (`--touch`).
- Motion 120 / 220 / 420ms; neutralize under `prefers-reduced-motion`.
- No state by colour alone — words for screen readers.
- Landing first viewport: brand + one headline + one lede + CTAs on full-bleed court atmosphere.

## Components to extract early

- **PlayerChip** — seed / name / country once
- **BracketGrid** — radiogroup, rounds as columns, distinct empty states (bye · em dash · unpicked)
- **LeagueCard**, **StandingsTable**, **MatchCard**, app shell nav

Scaffolding in the wireframe (charcoal dock, state rails) is **not** product — do not build it.
