# Routes

Source of truth for screens: `Wireframe/MatchRead-main/matchread-spec/docs/ENGINEER-MAPPING.md` and `SCREEN-INVENTORY.md`.

| Screen | Route | MVP | Status target |
|---|---|---|---|
| Landing | `/` | Yes | Build first |
| Sign in | `/sign-in` | Yes | Magic link |
| Check your email | `/sign-in` (state) | Yes | Same route |
| My leagues | `/leagues` | Yes | |
| Start a league | `/leagues/new` | Yes | |
| Enter solo bracket | `/enter/[ref]` | Yes | Ensures personal `is_solo` league → bracket |
| Invite friends | `/leagues/[slug]` panel | Yes | |
| Join a league | `/join/[token]` | Yes | |
| League home | `/leagues/[slug]` | Yes | Daily Check lead |
| Season standings | `/leagues/[slug]/season` | Yes | |
| Tournament in league | `/leagues/[slug]/t/[ref]` | Yes | |
| Bracket | `/leagues/[slug]/t/[ref]/bracket` | Yes | Phase 3 |
| Result artifact | `/leagues/[slug]/t/[ref]/result` | Yes | |
| Tournaments | `/tournaments` | Yes | |
| Public tournament | `/tournaments/[ref]` | Yes | Pre-draw + calendar destination |
| Players | `/players` | Yes | Rankings only |
| Auth callback | `/auth/callback` | Yes | |
| Founder | `/founder` | Ops | Phase 7 — health counts |
| Draw disruption | `/founder/disruption` | Ops | Phase 7 — void / withdrawal |
| Lightweight onboarding | — | No | Post-launch |
| Today's matches | — | No | Mobile only |
| User profile | — | No | Post-launch |

### Phase 3 routes (live)

| Route | Role |
|---|---|
| `/leagues/[slug]/t/[ref]` | Tournament in league (draw pending or entry) |
| `/leagues/[slug]/t/[ref]/bracket` | Fill / submit / locked bracket |
| `/leagues/[slug]/t/[ref]/result` | Result artifact after settlement |
| `/leagues/[slug]/season` | Season standings |

Deep links in the wireframe prototype use hash routes (`#/bracket`); production uses the paths above.
