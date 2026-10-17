# Module: Web app (`apps/web`)

**Package:** `@matchread/web`  
**Role:** Product UI and authenticated write path into Supabase. Owns presentation, routing, and server actions — not Tennis API ingest.

## Boundaries

| Depends on | Must not |
|------------|----------|
| `@matchread/core`, `@matchread/i18n`, `@matchread/tokens` | Import `@matchread/provider-rapidapi` |
| `@supabase/ssr` with **anon** key | Hold `SUPABASE_SERVICE_ROLE_KEY` |
| RPCs for product writes | Direct client DML into product tables |

Clients: `lib/supabase/server.ts`, `client.ts`; session refresh in `middleware.ts`. Env surface: `lib/env.ts` (public URL/anon/site origin only). Errors: `lib/report-error.ts` always writes `ops_events` and calls `@sentry/nextjs` only when `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` is set. Next 14 loads `instrumentation.ts` plus `sentry.server.config.ts`, `sentry.edge.config.ts`, and `sentry.client.config.ts`. `next.config.js` wraps the build with `withSentryConfig` from `@sentry/nextjs/config`. No DSN is required to run. Source map upload runs only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all set.

## Architecture

```text
app/ (routes + RSC)
  │
  ├─ lib/tournaments/*     public_calendar, status, lock captions
  ├─ lib/brackets/*        load seats/matches/picks → core shapes
  ├─ lib/leagues/*         membership, covers, Daily Check wiring
  ├─ lib/auth/*            session, founder gate
  │
  └─ app/actions/*         "use server" → RPC + revalidatePath
         brackets | leagues | settlement | auth | profile

components/
  bracket/  league/  tournaments/  shell/  auth/  founder/

The public draw is `BracketTree`: one horizontal column per round from the draw size, feeder keys, and stored sides. Each slot’s vertical place is the midpoint of its two feeders. Feeder lines are CSS borders on that placement. The match cards, round headings, and feeder names remain when the lines do not paint. An empty later-round side stays empty. A node is Scheduled or Official from the settled result. M3 extends `MatchSheetState` in `lib/brackets/resolution.ts` for in-progress and unfinished-final states. Those values are not produced. A later-round name is an advanced seat only when that side is stored. An unresolved pick stays `data-pick-rule="open"`; an official result marks the selected pick `settled`. A live pick rule is not assigned. On a narrow screen the bracket stage scrolls horizontally by round. Columns stay 280px wide, so a 320px page shows about one round and does not become a vertical list. The page itself scrolls vertically. The earliest unfinished round is aligned in that stage after paint. A 128-draw is 127 matches. Those nodes are server markup (`SeatName` inside `BracketTree`). The page does not hydrate a component per seat. `BracketScroller` is the one client island: it sets `scrollLeft`, then writes viewer-zone clocks into `[data-clock]` with `matchStartCaption`. Date-only and missing times stay in the server HTML. Distant rounds stay in that HTML. The sheet is not virtualized. Each round is a heading and an ordered list of matches, so reading and tab order follow round then match. The stage is the labeled horizontal region. Connector lines are empty CSS and carry no text. A winner seat shows the word Winner. Scheduled and Official are written on the match, not only colored. `BracketGrid` remains the editor. There, a member pick fills a side only when that stored side is still empty. The grid does not copy a child winner into the parent. Match cells show `officialScore` and mark the seat whose ref equals `winnerRef` on a non-void settled result. A pick does not mark a winner. Each non-bye cell is `official` when that result has `winnerRef` or `voided`, and `scheduled` otherwise. `officialScore` and start time do not choose the state. A scheduled node shows the shared `matchStartCaption` clock, then day or night and the court when those labels exist. A null session or court is omitted. A missing clock, UTC midnight, or the Unix epoch is “Time to be announced”.

No route has a `loading.tsx` ancestor. A segment skeleton would be the first HTML Next flushes, so the raw document would be `RouteLoading` (“Loading…”) until the client revealed the page. The server `page.tsx` is the initial response. `NavigationProgress` stays inactive until a client navigation, so it does not print that label on first paint. The landing shell omits `BackButton`; every other shell still renders it.

The public tournament page loads `loadTournamentReadModel` on the server. Its first HTML includes the event name, dates, surface, and status. A published sheet is `PublicOfficialDraw`. Named pairs before that sheet are `AnnouncedSheet`, also server markup: both last names, the venue-zone clock, and the public match link. `AnnouncedFirstRound` stays the league pick editor. `BracketScroller` only scrolls and rewrites published clocks after mount. There is no live-state island. Each match cell carries `data-public-ref`, the same `external_ref` as `/matches/[ref]`, plus `data-match-key`. A later live update addresses that one cell. It does not fetch the draw or rebuild the tree. A subscription, LIVE badge, live score, serve indicator, and provisional-final presentation are not implemented.

Match, lock, and announced-pair clocks use `lib/tournaments/format.ts`.
`profiles` has no `time_zone`. The bracket uses `useViewerTimeZone` after mount
and stays null on the server. A caption that must be in the first HTML uses
`captionTimeZone`: viewer zone when it exists, otherwise the venue zone, then UTC.
The public match page uses that same order.
Tournament `starts_on` / `ends_on` stay calendar dates in `dates.ts`.

`AppShell` mounts `LiveRefresh` (~45s `router.refresh()`) on every routed page so
homepage, calendar, tournament, and league views reflect new facts after sync-facts
without a manual reload. Ingest remains batch (~5m cron); this only re-reads Postgres.
```

## Key routes

| Route | Responsibility |
|-------|----------------|
| `/` | Landing + open / on court / **awaiting draw** / upcoming calendar partitions. Server page. The shell has no back control |
| `/tournaments`, `/tournaments/[ref]` | Public calendar + official draw / announced pairs. The event page is a server render: identity, `PublicOfficialDraw` or `AnnouncedSheet`. Sheet comes from `tournament_match_sheet` plus seats |
| `/matches/[ref]` | Server page. Lookup is `loadPublicMatch` on `matches.external_ref`. A uuid or a bare numeric id is not a public ref and is not queried. Unknown ref calls `notFound()`. Metadata comes from `generateMetadata` and `matchHref`. There is no segment `loading.tsx`. The sheet renders on the server: both sides, the round, the official score or the scheduled caption, court and session when stored, and the tournament name linking back. The clock uses the venue zone, then UTC. There is no live-state read; a missing live row is the normal match, not an error |
| `/enter/[ref]` | Solo league + jump into bracket |
| `/leagues`, `/leagues/new`, `/leagues/[slug]` | League list / create / home |
| `/leagues/[slug]/t/[ref]/bracket` | Bracket editor. Picks come from the same `loadTournamentReadModel` call as the sheet |
| `/leagues/[slug]/t/[ref]/result` | Results / breakdown |
| `/join/[token]` | Invite accept |
| `/sign-in`, `/welcome` | Auth + display name |
| `/founder/*` | Ops / integrity surfaces. Integrity alerts include `ingestion_gap` and `unexplained_absence`, shown with public ref, slug, tour, and provider tournament id |

## Write path

1. Server Action authenticates session.
2. Calls security-definer RPC (`save_picks`, `create_league`, `ensure_solo_league`, …).
3. Revalidates affected paths.

Read path for discovery always goes through **`public_calendar`** (`lib/tournaments/calendar.ts`), not raw `tournaments`.

## Guardrails

The public sheet and the editor stay separate. `BracketTree` is the server view. `BracketGrid` is the client editor. They share `buildRoundStructure`, `resolution.ts`, and `matchScheduleCaption`. A view change does not rewrite the editor.

Round columns and feeder keys are the structure. Connector lines are CSS on that placement. If the lines get in the way, simplify the lines. The rounds and the stored sides stay.

A 128-draw is 127 server nodes in horizontal rounds. The sheet is not virtualized. Measure a real draw before adding that.

`session` is `day`, `night`, or null. An unknown value is null. A start clock is not a session.

A date-only provider value is stored at noon UTC with `has_time` false (`parseFixtureInstant`). Midnight is not a kickoff. The sheet shows “Time to be announced”.

`/matches/[ref]` is settled or scheduled structure. It does not mount a live island.

The first HTML is the server page. There is no route `loading.tsx`. A spinner is not a stand-in for that page.

If the milestone slips, keep work in this order: the bracket tree and its data, the tournament read model, the session migration and its tests, the match route, the server-rendered page, mobile round scrolling, then connector lines. Schema tests, route correctness, advancement safety, TBA and null session handling, and the raw-HTML server check stay. Connector polish can wait.

## Related

- Flows: [../data-flows.md](../data-flows.md) B–E  
- Domain math: [core.md](./core.md)  
- DB/RPC: [../infrastructure/supabase.md](../infrastructure/supabase.md)
