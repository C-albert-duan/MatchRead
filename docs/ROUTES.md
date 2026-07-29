# Routes

Source of truth for screens: `Wireframe/MatchRead-main/matchread-spec/docs/ENGINEER-MAPPING.md` and `SCREEN-INVENTORY.md`.

| Screen | Route | MVP | Status target |
|---|---|---|---|
| Landing | `/` | Yes | Build first |
| Sign in | `/sign-in` | Yes | Magic link |
| Check your email | `/sign-in` (state) | Yes | Same route |
| My leagues | `/leagues` | Yes | |
| Start a league | `/leagues/new` | Yes | |
| Invite friends | `/leagues/[slug]` panel | Yes | |
| Join a league | `/join/[token]` | Yes | |
| League home | `/leagues/[slug]` | Yes | Daily Check lead |
| Season standings | `/leagues/[slug]/season` | Yes | |
| Tournament in league | `/leagues/[slug]/t/[ref]` | Yes | |
| Bracket | `/leagues/[slug]/t/[ref]/bracket` | Yes | Signature |
| Result artifact | `/leagues/[slug]/t/[ref]/result` | Yes | |
| Tournaments | `/tournaments` | Yes | |
| Players | `/players` | Yes | Rankings only |
| Auth callback | `/auth/callback` | Yes | |
| Showcase | `/showcase` | Dev | Optional |
| Founder | `/founder` | Ops | Phase 7 |
| Draw disruption | `/founder/disruption` | Ops | Phase 7 |
| Lightweight onboarding | — | No | Post-launch |
| Today's matches | — | No | Mobile only |
| User profile | — | No | Post-launch |

Deep links in the wireframe prototype use hash routes (`#/bracket`); production uses the paths above.
