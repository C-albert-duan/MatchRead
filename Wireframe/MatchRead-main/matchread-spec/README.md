# MatchRead — Visual Product Specification

**US Open 2026 web launch.** The definitive visual implementation reference.

**Two builds, same thing.**

- **`matchread-spec.html`** — one self-contained file. Open it anywhere, move it
  anywhere, email it to anyone. Start here.
- **`index.html`** — the folder build, with `css/` and `js/` beside it. This is the
  readable reference; the single file is generated from it by `node tools/bundle.js`.

The folder build only works with its `css/` and `js/` folders next to it. Detached
from them — downloaded on its own, dragged to a desktop, forwarded as an
attachment — it renders a blank page and says nothing about why. That is the
entire reason the single file exists.

No installation, no server, no build step either way.

---

## What this is

A disconnected, high-fidelity prototype whose only job is to remove engineering
ambiguity. It is not production code and it is not an MVP. Every screen states
what it is, which states it has, what each control does when things are missing
or slow or broken, and what it costs to build.

It is built against the repository at migration `0030_replacement_search.sql`.
Routes, terminology, component names, copy, colour semantics and the type ramp
are taken from that repository, not invented. Where this specification adds
something the repository does not have, it is marked **Needs Engineering** and
says so in the spec drawer.

## How to use it

| | |
|---|---|
| **Index** | The bottom-right dock opens the screen index — every screen, its route, its state count, its status and its classification. Filter by classification. |
| **State rail** | The grey rail under the header on every screen switches that screen through its states. That rail *is* the state specification. Arrow keys work. |
| **Spec drawer** | The charcoal drawer holds three tabs per screen: the inventory entry, the interaction specification, and the engineer mapping. `Esc` closes it. |
| **Deep links** | `index.html#/bracket`, `index.html#/league-home`, and so on. |

**Anything charcoal and monospaced is scaffolding.** The dock, the drawer and the
state rails are apparatus for reading the specification. None of it is product
and none of it should be built. The product surface is the white one.

## What is in it

| | |
|---|---|
| Screens | 29 |
| Interaction states | 126 |
| Interactive elements specified | 82 |
| Classification | 23 Launch MVP · 3 Post Launch · 3 Visual Exploration |
| Status | 13 Already Exists · 10 Partial · 1 Needs Engineering · 5 Future Feature |

Written deliverables are in `docs/`, **generated from `js/registry.js`** by
`node tools/build-docs.js`. They are generated rather than written beside the
prototype for the same reason `apps/web/app/showcase` is typed against the
production projections: a document maintained by hand next to the artefact it
describes will disagree with it inside a month.

- `docs/SCREEN-INVENTORY.md` — purpose, entry, exit, required data, states, classification
- `docs/INTERACTION-SPEC.md` — every control, ten aspects each
- `docs/ENGINEER-MAPPING.md` — route, component, backend, database, API, status

---

## Three reconciliations this specification makes

The brief's screen list and the repository do not agree in three places. Rather
than silently pick one, each is resolved here in the open, because an engineer
finding the disagreement on their own is the failure this document exists to
prevent.

**1. Daily picks are not on web, and are shown as Visual Exploration.**
The brief asks for *Today's Matches*, *Daily Picks* and *Match Detail*. Those are
the mobile product. The US Open engineering assessment cuts the daily-picks loop
from the web launch explicitly, and the assessment's reasoning is sound: read the
success definition — create a league, share a link, friends join, everyone
completes brackets, standings update, users return — and the word "pick" does not
appear. Cutting it removes the slate RPC, the lock trigger, split counters,
comment policies, `settle-slate` and about a third of the never-tested RLS surface
from the critical path.

They are still built here, dark-first and in a phone frame, classified **Visual
Exploration**, so the two products can be told apart and nobody builds one while
reading a spec for the other. What the brief calls *Pick Selection*, *Pick
Confirmation* and *Locked Picks* map on web to the bracket's states, and are
specified there.

**2. "Pool" is "League", and there is no account-creation screen.**
The repository moved from pools (migration 0014) to leagues (0016, ADR-0019 *The
League as the Social Object*). The route table says `/leagues`. This specification
uses League throughout. Likewise there is no *Account Creation* screen because
there is no account creation: magic link is the only method the web app
implements, and a first-time address gets an account when it completes the round
trip. It is specified as a state of `/sign-in`, not invented as a page.

**3. User Profile and Prediction History do not exist on web.**
On web, *player* means a tennis player and *member* means a person in a league.
`/players` is a rankings page and must not become a user directory by accident. A
member's identity surface is a standings row and a result artifact. Both screens
are present and classified honestly.

---

## The three things that will hurt on launch day

Carried forward from `ENGINEERING-HANDOFF.md` §3 and surfaced on the screens they
affect, because a blocker recorded only in a document is a blocker nobody reads.

1. **Settlement is not scheduled.** The engine exists and is integration-tested.
   Nothing invokes it. Until a schedule exists, no result is frozen into a league,
   `previous_score` stays null forever, the Daily Check is honest and permanently
   quiet, and season standings never move. Every movement chip, every "+22 today",
   and the entire *live* family of Daily Checks in this prototype are downstream of
   this one cron expression.

2. **There is no deployable ingestion listener.** A tested socket transport exists;
   the container it lives in does not. A beta can open without it at a stated cost:
   results arrive only through the REST reconciliation sweep, so scores lag. That is
   acceptable for an invited beta and not for a public launch — which is why the
   *Provider error* state in this prototype is not an edge case, it is the normal
   state until the listener is built.

3. **The 72-hour window.** Every US Open bracket that will ever exist is entered
   between the draw on ~27 August and the lock at ~11:00 ET on 30 August. The
   bracket builder does not need to ship first; it needs to be *already proven* when
   the draw drops. League creation and invites must be public weeks earlier — a
   commissioner cannot recruit twelve coworkers in seventy-two hours in late August.
   That is why *Draw pending* is a designed state in this prototype rather than a
   placeholder: it is the growth loop's primary surface for a third of the window.

---

## Design rules this prototype holds

Taken from `docs/DESIGN-LANGUAGE.md` and enforced in `packages/tokens`.

- **The read is charcoal; the data is Tournament Green.** A pick is a claim and sits
  in ink. It turns green or red only when the tournament rules on it. That moment is
  the product. The primary button is charcoal for exactly this reason — a green
  button would be telling the user the button is a verified result.
- **Court colours mean surface and nothing else.** One 3px hairline per row.
- **No shadows anywhere.** Elevation is ground: canvas / raised / sunken.
- **Hairlines over boxes.** The eyebrow separates sections, not a border or a card.
- **Every number is monospaced and tabular**, so a score can tick without reflowing
  and a draw's columns align the way a printed draw sheet's do.
- **4pt spacing, exhaustively.** A gap that is not on the scale means the layout is wrong.
- **44px minimum target, always.** Padding shrinks; the target does not.
- **Motion explains state, it does not entertain.** 120 / 220 / 340ms, two curves, all
  of it neutralised under `prefers-reduced-motion` by one blanket rule.
- **No state is carried by colour alone.** Every bracket state has a word, and the word
  is what a screen reader reads.

## Structure

```
matchread-spec.html     the single-file build — generated, never edited by hand
index.html              classic scripts, ordered — ES modules are blocked on file://
css/tokens.css          transcribed verbatim from packages/tokens via globals.css
css/app.css             the product surface
css/spec.css            the specification chrome — deliberately a different language
js/dom.js               h() — the only rendering primitive
js/data.js              US Open 2026, a full 128 draw, invented players
js/components.js        THE DESIGN SYSTEM — every component, implemented once
js/registry.js          the specification: inventory, interactions, engineer mapping
js/screens.js           the web product
js/screens-mobile.js    the daily-picks product, shown for contrast
js/app.js               router, state switcher, spec drawer, index
tools/build-docs.js     emits docs/ from the registry
tools/bundle.js         inlines everything into matchread-spec.html
docs/                   the three written deliverables
```

`js/components.js` is the point of the file layout. A Match Card that appears on
six screens is written once and imported six times; so are the navigation bar, the
league card, the player chip, the tournament row, the standings table, the actions,
the dialog and the bracket slot. The prototype demonstrates the intended component
architecture, not just the finished screens.

Two of those components are load-bearing arguments rather than conveniences:

- **`PlayerChip`** is currently hand-rolled in four places in `apps/web` —
  `BracketEditor`, the rankings table, the operator seat list and the draw list.
  The seed / name / country triple is one component. It is already in
  `KNOWN_WEAKNESSES`; this specification implements it once to show what
  extracting it costs (very little) and what it buys (every draw in the product
  agreeing about what a player looks like).
- **`BracketGrid`** is a radiogroup, not a grid of toggles. Rounds are columns,
  round names are derived from distance to the final rather than hardcoded, the
  chosen name takes weight and a left rule and never a fill, and there are three
  visually distinct empty states — bye, em dash, unpicked — because they mean
  three different things.

The app shell is specified as a screen in its own right (**Global navigation**),
because it is the one interactive surface that appears on every route and a nav
that changes shape between screens is the fastest way to make a product feel
assembled rather than designed. Its skip link, `aria-current`, language control
and session control are specified there once, not repeated on twenty-nine
screens.

## Fidelity notes

- **Players are fictional.** Every surname is invented, following the rule already
  set in `apps/web/app/showcase/fixtures.ts`: real names and results in a design
  surface is a licensing and likeness question, not a design one. Tournament names
  are used descriptively, which is what the product footer already states.
- **Fonts.** Archivo, Instrument Sans and IBM Plex Mono are loaded from Google Fonts
  so the identity is visible at display sizes. `apps/web` deliberately does not load
  them yet — self-hosting a licensed webfont is a decision with a licence attached —
  so offline this degrades to exactly the system stacks production ships today.
- **Data is deterministic, and it is scored by the real rule.** The draw, the
  results and the standings are seeded, so every reload shows the same thing — a
  reference that reshuffles itself is not one. Every score is produced by grading
  a generated bracket with `packages/core/src/tournament/scoring.ts`: weight
  doubles each round from 1, and naming the champion pays the final's weight
  again, so a 128 draw tops out at **512**. Two earlier versions of this fixture
  were quietly impossible — one graded 127/127 because the PRNG's first output
  sat in a narrow band, so the *incorrect* state never rendered anywhere; the
  other had members scoring 604 with 520 still to play for. Both are the kind of
  thing an engineer notices on day three and then stops trusting the rest of the
  document over. The Daily Check's numbers are derived from the standings for the
  same reason: a panel that says "up 1 place" beside a table showing a drop
  discredits the one screen whose whole job is to be believed.
- **The 128 draw is rendered in full.** A faithful draw sheet is roughly 6,000px tall,
  because that is what a draw sheet is. The starting-round control above it is
  scaffolding for reviewing, not a product feature.
