# Design Language

Tokens for implementation live in `packages/tokens` and are injected into `:root` via `rootStyle()`. Production look: **club system** — white canvas, charcoal action, Tournament Green for verified fact, rare ball yellow. Elevation is canvas / raised / sunken + hairlines. No decorative shadows.

## Meaning colours

| Token | Hex | Meaning |
|---|---|---|
| `--mr-canvas` | `#FFFFFF` | The room. 65–75% of any screen. |
| `--mr-read` / `--mr-text-primary` | `#15181B` | Type, primary button, a user’s pick |
| `--mr-data` | `#0A6B42` | Identity and verified tournament fact |
| `--mr-ball` | `#D9F35A` | Live play / Daily Check marker. Never text on white. Never a button. |
| `--mr-miss` | `#C93F36` | An incorrect read |
| Court clay / grass / hard / indoor | … | Surface fact only — 3px edge + the word |

Primary button is **charcoal**, never green — green would imply a verified result. Court hard (`#2F6FA8`) is not the CTA.

Ball yellow appears at most twice per screen. Label live play **“On court”**, not “Live”.

## Type

| Role | Stack |
|---|---|
| Display | Archivo 800 |
| Body | Instrument Sans |
| Numerals | IBM Plex Mono (tabular) — every number, without exception |

## Rules

- No decorative shadows. Elevation: canvas / raised / sunken + hairlines.
- Hairlines over boxes; eyebrow (mono + 20×2px green tick) separates sections.
- 4pt spacing scale (`--s-xs` … `--s-5xl`). Section rhythm `--section`.
- 48px minimum touch (`--touch`).
- Motion 120 / 220 / 250ms; neutralize under `prefers-reduced-motion`.
- No state by colour alone — words for screen readers.
- WTA is a 2px violet underline, not violet text.
- Bracket is a printed draw sheet: open seats, left rule for a pick, green only after settlement. Scrolled, never scaled.
- Daily Check leads with one sentence. `null` movement renders nothing, never `+0`.
