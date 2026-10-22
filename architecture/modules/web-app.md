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

The public draw is `BracketTree`: one horizontal column per round from the draw size, feeder keys, and stored sides. Each slot’s vertical place is the midpoint of its two feeders. Feeder lines are CSS borders on that placement. The match cards, round headings, and feeder names remain when the lines do not paint. An empty later-round side stays empty. A node is Scheduled or Official from the settled result. `MatchSheetState` also includes `live` and `provisional` when a live overlay is present. The server tree does not invent that overlay. `officialWinnerRef` stays null for a provisional final. A later-round name is an advanced seat only when that side is stored. An unresolved pick stays `data-pick-rule="open"`; an official result marks the selected pick `settled`. A live pick rule is not assigned. On a narrow screen the bracket stage scrolls horizontally by round. Columns stay 280px wide, so a 320px page shows about one round and does not become a vertical list. The page itself scrolls vertically. The earliest unfinished round is aligned in that stage after paint. A 128-draw is 127 matches. Those nodes are server markup (`SeatName` inside `BracketTree`). The page does not hydrate a component per seat. `BracketScroller` is the one client island: it sets `scrollLeft`, then writes viewer-zone clocks into `[data-clock]` with `matchStartCaption`. Date-only and missing times stay in the server HTML. Distant rounds stay in that HTML. The sheet is not virtualized. Each round is a heading and an ordered list of matches, so reading and tab order follow round then match. The stage is the labeled horizontal region. Connector lines are empty CSS and carry no text. A winner seat shows the word Winner. Scheduled and Official are written on the match, not only colored. `BracketGrid` remains the editor. There, a member pick fills a side only when that stored side is still empty. The grid does not copy a child winner into the parent. Match cells show `officialScore` and mark the seat whose ref equals `winnerRef` on a non-void settled result. A pick does not mark a winner. Each non-bye cell is `official` when that result has `winnerRef` or `voided`, and `scheduled` otherwise. `officialScore` and start time do not choose the state. A scheduled node shows the shared `matchStartCaption` clock, then day or night and the court when those labels exist. A null session or court is omitted. A missing clock, UTC midnight, or the Unix epoch is “Time to be announced”.

No route has a `loading.tsx` ancestor. A segment skeleton would be the first HTML Next flushes, so the raw document would be `RouteLoading` (“Loading…”) until the client revealed the page. The server `page.tsx` is the initial response. `NavigationProgress` stays inactive until a client navigation, so it does not print that label on first paint. The landing shell omits `BackButton`; every other shell still renders it.

The public tournament page loads `loadTournamentReadModel` on the server. Its first HTML includes the event name, dates, surface, and status. A published sheet is `PublicOfficialDraw`. Named pairs before that sheet are `AnnouncedSheet`, also server markup: both last names, the venue-zone clock, and the public match link. `AnnouncedFirstRound` stays the league pick editor. `BracketScroller` only scrolls and rewrites published clocks after mount. Each match cell carries `data-public-ref`, the same `external_ref` as `/matches/[ref]`, plus `data-match-key` and `data-base-resolution`. `LiveMatchLayer` is the one live island. It portals `LiveScore` into that cell's `data-live-root`: the live badge, the live score, and the serve indicator when `serving` is `a` or `b`. `knownServingSide` returns null for every other value. A null server omits the Serving label and `data-live-serve`. The set score and the game score are not used to choose a server. The server tree does not mount that component and does not hold live rows. A snapshot read goes to `POST /api/live` with the public tournament ref on `data-tournament-ref`. That route calls `live_overlay_open` first. A down or stale listener returns no matches. The island then clears a non-official live paint and does not replay held frames. The server page does not call that function. `getLiveTournamentState` in `server/repositories/live.ts` is the only web select of `live_match_state`. It resolves `tournaments.slug` and returns canonical live display: public match ref, phase, sets, game, serving side, flag, provisional winner ref, and the two clocks. Provider payload names, `match_id`, and `tournament_id` are not in that JSON. The component does not fetch the draw or rebuild the tree. A score update becomes `liveNodePatch` (`lib/live/node-patch.ts`), addressed by that public ref. `patchAffectedNodes` leaves every other node object in place and returns the same list when the ref is absent. The island then paints only `[data-public-ref]` cells for that ref, including an announced pair. A match uuid is not a patch address and is not a field of the patch. An official cell is left as server HTML. A provisional final shows the set score and the muted line `live.provisional` (“Awaiting official result”). That score is not colored as an official result. The cell does not gain a winner mark, a parent name, an official score, or a settlement call. When that live row is deleted, the island drops the provisional paint and calls `router.refresh()` once. The delete payload carries the match key, so a row that `liveNodePatch` cannot address refetches `POST /api/live`, drops the paint that snapshot no longer includes, and then refreshes. The official winner, scoreline, and next-round seat are the server sheet from the REST settlement path. The island does not write them.

Match, lock, and announced-pair clocks use `lib/tournaments/format.ts`.
`profiles` has no `time_zone`. The bracket uses `useViewerTimeZone` after mount
and stays null on the server. A caption that must be in the first HTML uses
`captionTimeZone`: viewer zone when it exists, otherwise the venue zone, then UTC.
The public match page uses that same order.
Tournament `starts_on` / `ends_on` stay calendar dates in `dates.ts`.

`AppShell` mounts `LiveRefresh` (~45s `router.refresh()`) on every routed page so
homepage, calendar, tournament, and league views reflect new facts after sync-facts
without a manual reload. Ingest remains batch (~5m cron); this only re-reads Postgres.
The same shell mounts `LiveMatchLayer`. That island calls `useLiveTournament`. The bracket page stays a server component. On a visible tab it drops the previous channel and subscribes again. Match cells that share a public tournament ref use one topic, `live:tournament:{ref}`. The Postgres Changes filter for that topic is `tournament_id=eq.<id>`. There is not a channel per match. The publication stays the shared `supabase_realtime` publication. After that subscription reports ready, the island refetches `getLiveTournamentState` through `POST /api/live`. Patches that arrived after subscribe are applied after that snapshot. A hidden tab sets `data-tab-hidden` on the document, which pauses the live badge pulse and the on-court dot pulse. A visible tab clears that attribute. The badge pulse is only on a live cell that is not stale, so a match that left live while hidden does not resume it. `prefers-reduced-motion: reduce` sets that animation to none, alongside the existing `.live-dot` rule. A hidden tab, on `visibilitychange` to visible, refetches the current projection, including when the channel has not reached the apply phase. Frames received while hidden, and frames received during that refetch, are not applied afterward. A channel error, timeout, closed socket, or offline browser retries the subscription at 1, 2, 4, 8, then 15 seconds. A further loss while that wait is pending does not stack another. After that it refetches the current projection about every 30 seconds and still tries the subscription. A disconnect and a return to the foreground mark a quiet cell stale immediately, so the badge does not stay live until the next interval. A confirmed subscription clears that wait. A live or provisional cell older than `LIVE_STALE_MS` (45s) shows the stale label on the badge, so a frozen score does not stay marked live. During play, about 60s without a successful live update or refetch (`LIVE_BROWSER_STALE_MS`) shows the subdued `status-banner--beta` delay banner. The last score stays on the cell. A disconnected channel
waits, subscribes, confirms, and refetches again. Unmount, including navigation to another page, calls `removeChannel` on that topic so the subscription does not stay open. `lib/live/trust.ts` keeps official columns off the live projection type. Refetch and channel failures call `reportError`
(at most once a minute per source). Founder integrity lists `listener_health` and
`event_map` status counts. The listener row also shows connection, heartbeat time, the newer of that row's last provider event and `live_match_state.occurred_at`, and the tick counts `events_received`, `mapped_count`, and `unmapped_count`. A heartbeat older than 2 minutes while a row is `in_play` uses the existing error mark. A provider event older than 5 minutes while a row is `in_play` or `suspended` uses the existing event mark. Events in and unmapped stay counts. They do not alarm. `ops_events` `unmapped_event` is the event mark only when its `provider_tournament_id` is an `ingestion_enabled` tournament. That id is not a player name. `live_rest_disagreement` is the error mark. The alert list shows the live score, the official score, and both winner refs. The official score stays the REST result. `lag_ms` and an integrity warning code `freshness` render when they are already stored.
```

## Key routes

| Route | Responsibility |
|-------|----------------|
| `/` | Landing + open / on court / **awaiting draw** / upcoming calendar partitions. Server page. The shell has no back control |
| `/tournaments`, `/tournaments/[ref]` | Public calendar + official draw / announced pairs. The event page is a server render: identity, `PublicOfficialDraw` or `AnnouncedSheet`. Sheet comes from `tournament_match_sheet` plus seats |
| `/matches/[ref]` | Server page. Lookup is `loadPublicMatch` on `matches.external_ref`. A uuid or a bare numeric id is not a public ref and is not queried. Unknown ref calls `notFound()`. Metadata comes from `generateMetadata` and `matchHref`. There is no segment `loading.tsx`. The sheet renders on the server: both sides, the round, the official score or the scheduled caption, court and session when stored, and the tournament name linking back. The clock uses the venue zone, then UTC. The server sheet does not query live state. A missing live row is the normal match, not an error. The shell's live layer fills the slots when a row exists |
| `/enter/[ref]` | Solo league + jump into bracket |
| `/leagues`, `/leagues/new`, `/leagues/[slug]` | League list / create / home |
| `/leagues/[slug]/t/[ref]/bracket` | Bracket editor. Picks come from the same `loadTournamentReadModel` call as the sheet |
| `/leagues/[slug]/t/[ref]/result` | Results / breakdown |
| `/join/[token]` | Invite accept |
| `/sign-in`, `/welcome` | Auth + display name |
| `/founder/*` | Ops / integrity surfaces. Integrity alerts include `ingestion_gap`, `unexplained_absence`, `unmapped_event`, and `live_rest_disagreement`, shown with public ref, slug, tour, and provider tournament id when those fields are stored. Integrity also shows listener connection, heartbeat, last provider event, tick mapping counts, and event-map counts |
| `POST /api/live` | Tournament live snapshot. Body is `{ tournamentRef }`, the public slug. `getLiveTournamentState` returns canonical match display. A uuid or a bare id is rejected |

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
