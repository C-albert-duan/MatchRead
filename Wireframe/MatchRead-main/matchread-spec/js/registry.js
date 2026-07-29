/* =========================================================================
   registry.js — the specification itself.
   -------------------------------------------------------------------------
   Deliverables 2, 3 and 4 of the brief live here as data, so that the screen
   inventory, the interaction specification and the engineer mapping are one
   object per screen rather than three documents that drift apart.

   Implementation status vocabulary, used exactly as the brief defines it:
     exists   Already Exists   — shipped in apps/web today, at migration 0030
     partial  Partial          — some of it exists; the gap is named
     needs    Needs Engineering— does not exist and is on the launch path
     future   Future Feature   — deliberately not in the US Open launch

   The `status` on a screen is the status of the WHOLE screen. Where one
   interaction on an existing screen needs engineering, the interaction carries
   its own status and the screen stays Partial.
   ========================================================================= */

(function () {
  'use strict';

  /** Shorthand for an interaction row. */
  function ix(o) {
    return {
      name: o.name,
      action: o.action,
      behaviour: o.behaviour,
      destination: o.destination || '—',
      data: o.data || '—',
      disabled: o.disabled || 'Never disabled.',
      loading: o.loading || 'Not applicable — navigation only.',
      empty: o.empty || '—',
      success: o.success || '—',
      failure: o.failure || '—',
      motion: o.motion || 'None beyond the standard hover: colour only, 120ms, ease-standard.',
      status: o.status || 'exists'
    };
  }

  MR.registry = [

  /* ===================================================================== */
  /* ENTRY AND IDENTITY                                                     */
  /* ===================================================================== */

  {
    id: 'landing', name: 'Landing page', mvp: 'mvp', route: '/',
    group: 'Entry',
    purpose:
      'The public argument. It has one job: convince somebody who was sent a link that a MatchRead league is not the office spreadsheet they tried last year, and get them to start one.',
    entry: ['Direct / search / a shared link', 'The wordmark from any page', 'Sign-out returns here'],
    exit: ['Start a league → /leagues/new (via /sign-in when signed out)', 'See what it looks like → /showcase', 'Tournaments → /tournaments'],
    data: [
      'None authenticated. Anonymous-readable, server-rendered, indexable.',
      'The calendar strip reads `tournaments` (reference layer, migration 0001) — name, surface, starts_on.'
    ],
    states: ['Signed out', 'Signed in', 'Loading', 'Unexpected error'],
    interactions: [
      ix({ name: 'Start a league (prominent)', action: 'Click',
        behaviour: 'Signed out: routes to /sign-in with ?next=/leagues/new. Signed in: routes straight to /leagues/new.',
        destination: '/sign-in?next=%2Fleagues%2Fnew or /leagues/new',
        data: 'Session presence only.',
        success: 'Navigation. The `next` round-trip is the single most-broken thing in a magic-link flow and is verified in runbook 10 step 6.',
        failure: 'A malformed `next` falls back to / rather than erroring — safeNext() rejects by shape, never by blocklist.' }),
      ix({ name: 'See what it looks like', action: 'Click', behaviour: 'Routes to the live component showcase.', destination: '/showcase' }),
      ix({ name: 'Calendar row', action: 'Click', behaviour: 'Opens the public tournament page.', destination: '/tournaments/[ref]',
        empty: 'When no tournaments are imported the strip is not rendered at all — an empty calendar is not a design state, it is a missing import.' })
    ],
    mapping: {
      route: 'apps/web/app/page.tsx',
      component: 'components/landing/Argument.tsx · components/layout/AppShell.tsx · components/shared/actions.tsx',
      backend: 'None. Anonymous read of the reference layer.',
      database: 'tournaments (0001). RLS: reference tables are anonymously readable by policy.',
      api: 'Server Component read via lib/supabase/server.ts with the anon key. Never the service role.',
      status: 'exists',
      notes: 'All prose is in packages/i18n under landing.* — 12 keys, complete in en/es/ja. Do not hard-code copy into the component; the build is gated on catalogue completeness.'
    }
  },

  {
    id: 'sign-in', name: 'Sign in', mvp: 'mvp', route: '/sign-in',
    group: 'Entry',
    purpose:
      'The only authentication surface. Magic link, email only — no password, no social provider on web. There is no separate "create account" screen because there is no separate account creation: a first-time address gets an account when it first completes the round trip.',
    entry: ['Header "Sign in"', 'Any authenticated route while signed out (middleware redirect, carrying ?next=)', 'An invite link while signed out'],
    exit: ['Check your email (same route, submitted state)', 'On callback → the `next` destination, or /leagues'],
    data: ['Email address. Nothing else is collected at any point in the flow.'],
    states: ['Idle', 'Invalid address', 'Submitting', 'Check your email', 'Rate limited'],
    interactions: [
      ix({ name: 'Email field', action: 'Type', behaviour: 'Validated on submit, not on keystroke — validating an email while it is being typed marks every address invalid for as long as it takes to write one.',
        data: 'Local state only until submit.',
        failure: 'Field gets aria-invalid, the message is rendered below it and referenced by aria-describedby, and focus moves to the field.',
        motion: 'None. Never animate a validation error into view.' }),
      ix({ name: 'Send me a link (prominent)', action: 'Click / Enter',
        behaviour: 'Calls supabase.auth.signInWithOtp with emailRedirectTo pointing at /auth/callback, carrying the sanitised `next`.',
        destination: 'Same route, "check your email" state.',
        data: 'The email. The `next` parameter, already passed through safeNext().',
        disabled: 'Disabled while a request is in flight, and for 30 seconds after a successful send, so a second tap cannot burn a rate-limit slot.',
        loading: 'Label becomes "Sending". The button keeps its width so the row does not reflow.',
        success: 'The form is replaced by the confirmation, which states the address it was sent to — a mistyped address is the commonest failure and the screen must make it visible.',
        failure: 'Rate limit gets its own message naming the wait, because "something went wrong" sends the user to support for a problem that resolves itself. Supabase built-in email is limited to a handful an hour and is NOT beta-grade; a transactional provider is item 7 on the founder checklist.',
        status: 'exists' }),
      ix({ name: 'Change language', action: 'Select', behaviour: 'Sets the locale cookie and re-renders server-side.', destination: 'Same route', data: 'preferences.locale (0026) when signed in; cookie only when not.', status: 'exists' })
    ],
    mapping: {
      route: 'apps/web/app/sign-in/page.tsx · SignInForm.tsx · app/auth/callback/route.ts',
      component: 'components/shared/actions.tsx · lib/routes.ts (safeNext, signInWithNext)',
      backend: 'Supabase Auth, magic link. @supabase/ssr cookie sessions so Server Components can read the user.',
      database: 'auth.users; profiles row provisioned by trigger (0001).',
      api: 'auth.signInWithOtp → email → /auth/callback exchanges the code for a cookie session.',
      status: 'partial',
      notes: 'BLOCKER-ADJACENT. The magic-link round trip has NEVER been executed against a deployed Supabase project — ENGINEERING-HANDOFF §2 lists it first under "never verified in production". Day 3 gate: the nine-step auth walk on a real phone, and step 6 (landing back where you started) is the one that fails.'
    }
  },

  {
    id: 'check-email', name: 'Check your email', mvp: 'mvp', route: '/sign-in (submitted state)',
    alias: { id: 'sign-in', state: 3 },
    group: 'Entry',
    purpose: 'The dead end that is not a dead end. It confirms the address, sets the expectation, and gives the one recovery action that matters — send it again.',
    entry: ['Successful submit on /sign-in'],
    exit: ['The email client (out of product)', 'Use a different address → back to the form'],
    data: ['The submitted address, held in client state only.'],
    states: ['Sent', 'Resend cooling down', 'Resent'],
    interactions: [
      ix({ name: 'Send it again', action: 'Click',
        behaviour: 'Re-issues the OTP for the same address.',
        disabled: 'Disabled for 30 seconds after each send, with the remaining time named in the label rather than hidden in a tooltip.',
        loading: 'Label becomes "Sending".', success: 'A status region confirms the resend. The screen does not change shape.',
        failure: 'Rate-limit message names the wait.' }),
      ix({ name: 'Use a different address', action: 'Click', behaviour: 'Returns to the form with the field pre-filled and focused.', destination: '/sign-in' })
    ],
    mapping: {
      route: 'apps/web/app/sign-in/page.tsx (state within SignInForm)',
      component: 'SignInForm.tsx', backend: 'Supabase Auth', database: '—',
      api: 'auth.signInWithOtp (repeat)', status: 'exists',
      notes: 'routes.checkEmail exists in the route table as a distinct path but the current implementation renders this as a state of the same page. Either is defensible; pick one and delete the other so the route table is not describing a page that does not exist.'
    }
  },

  {
    id: 'onboarding', name: 'Lightweight onboarding', mvp: 'post', route: '— not built',
    group: 'Entry',
    purpose:
      'A single screen after a first sign-in: choose a display name, confirm a time zone. Everything else the product needs it already knows.',
    entry: ['First successful callback for an address with no display_name'],
    exit: ['→ the `next` destination, or /leagues'],
    data: ['profiles.display_name (0001)', 'preferences.time_zone (0020)'],
    states: ['Prompt', 'Saving'],
    interactions: [
      ix({ name: 'Display name', action: 'Type + save',
        behaviour: 'Writes profiles.display_name. This is the name that appears in every standings row in every league, and it is the only identity decision the product asks anyone to make.',
        disabled: 'Save disabled until the field is non-empty.',
        failure: 'A uniqueness collision is not possible — display names are not unique. Only length is validated.',
        status: 'needs' }),
      ix({ name: 'Time zone', action: 'Select',
        behaviour: 'Defaults to Intl.DateTimeFormat().resolvedOptions().timeZone and writes preferences.time_zone.',
        data: 'preferences.time_zone (0020)',
        failure: 'If the browser reports nothing, the field is required rather than defaulted. There is no default zone anywhere in this product; a default is how a member in California reads a New York lock time and misses the tournament by fourteen hours.',
        status: 'needs' }),
      ix({ name: 'Skip', action: 'Click',
        behaviour: 'Proceeds. The member appears in standings under the local part of their email until they set a name.',
        destination: '/leagues', status: 'needs' })
    ],
    mapping: {
      route: '— does not exist',
      component: '— does not exist',
      backend: 'Server Action writing profiles + preferences.',
      database: 'profiles (0001) · preferences.time_zone (0020) · preferences.locale (0026). All three columns exist.',
      api: 'One Server Action. No new table, no new migration.',
      status: 'needs',
      notes: 'POST LAUNCH. The columns exist and the writes are trivial, but nothing on the launch path depends on this: a member with no display name is rendered from their email, and the time zone falls back to the browser at render. Building it in the 38-day window would be spending the scarcest resource on the least-blocking screen.'
    }
  },

  /* ===================================================================== */
  /* LEAGUES                                                                */
  /* ===================================================================== */

  {
    id: 'leagues', name: 'My leagues (home dashboard)', mvp: 'mvp', route: '/leagues',
    group: 'Leagues',
    purpose:
      'The signed-in home. Not a dashboard of statistics — a list of the groups you belong to, ordered so the one with something happening in it is first.',
    entry: ['Header "Leagues"', 'After sign-in with no `next`', 'After creating or joining a league'],
    exit: ['A league → /leagues/[slug]', 'Start a league → /leagues/new'],
    data: ['league_members joined to leagues, filtered by RLS to the viewer\'s own memberships', 'memberCount, tournamentCount, format, visibility'],
    states: ['Has leagues', 'Empty', 'Loading', 'Unexpected error'],
    interactions: [
      ix({ name: 'League row', action: 'Click', behaviour: 'Opens the league home.', destination: '/leagues/[slug]',
        motion: 'Border colour line → line-strong over 120ms. No lift, no shadow: elevation in this product is ground, not depth.' }),
      ix({ name: 'Start a league (prominent)', action: 'Click', destination: '/leagues/new',
        behaviour: 'Opens the creation form.' }),
      ix({ name: 'Empty state action', action: 'Click', behaviour: 'Same destination as above; the empty state names what happens next rather than saying "no data".',
        empty: '"No leagues yet — Start one for a single tournament, or for a whole season. Invite whoever you would text about a five-setter."' })
    ],
    mapping: {
      route: 'apps/web/app/leagues/page.tsx · loading.tsx',
      component: 'components/shared/primitives.tsx (EmptyState) · a LeagueCard, which today is inline JSX and should be extracted',
      backend: 'server/repositories/league.ts — the only place Supabase is called for league data.',
      database: 'leagues (0016) · league_members (0016). RLS restricts to the viewer\'s memberships.',
      api: 'Server Component read, anon key + the user JWT.',
      status: 'exists',
      notes: 'The row markup is duplicated between this page and the season page. Extract LeagueCard — this prototype implements it once, in components.js, and uses it in both places.'
    }
  },

  {
    id: 'create-league', name: 'Start a league', mvp: 'mvp', route: '/leagues/new',
    group: 'Leagues',
    purpose:
      'Four decisions, two of which cannot be changed later. It is short on purpose: the growth loop needs a commissioner to get from intent to a shareable link in under a minute, weeks before any draw exists.',
    entry: ['Landing "Start a league"', '/leagues "Start a league"', 'Empty state'],
    exit: ['Created → /leagues/[slug] with the invite panel open', 'Cancel → /leagues'],
    data: ['name, format (single | season), visibility (private | public), tournament ref when format=single'],
    states: ['Idle', 'Validation error', 'Submitting'],
    interactions: [
      ix({ name: 'League name', action: 'Type',
        behaviour: 'Validated on submit against the Zod schema in lib/validation/league.ts.',
        failure: 'Empty → "Give your league a name". Over 60 characters → "Keep the name under 60 characters". Both are validation CODES returned by the Server Action and translated at the surface — an action that returned an English sentence would be a locale decision made on the server for a page rendered in another language.' }),
      ix({ name: 'Format — single tournament / season', action: 'Select one',
        behaviour: 'Chooses whether the league dies with its tournament or keeps its people across the year. This is the product\'s central claim and it is presented as two consequences, not as a dropdown.',
        disabled: 'Immutable after creation. The form says so at the point of choice, not in a confirmation afterwards.',
        failure: '"Choose a single tournament or a full season"' }),
      ix({ name: 'Visibility — private / public', action: 'Select one',
        behaviour: 'Private is the default. Public exposure is an explicit, opt-in projection rather than a loosened policy.',
        disabled: 'Changeable later by the commissioner.',
        failure: '"Choose private or public"' }),
      ix({ name: 'Tournament picker', action: 'Select',
        behaviour: 'Shown only when format = single. Lists tournaments whose draw has not locked.',
        disabled: 'Hidden entirely for a season league rather than disabled — a disabled control that can never apply is furniture.',
        empty: 'If no tournaments are imported: the picker is replaced by a line saying the calendar is being confirmed, and a season league is still creatable. A commissioner must never be blocked by an import.',
        failure: '"Choose the tournament this league plays"' }),
      ix({ name: 'Create league (prominent)', action: 'Click',
        behaviour: 'Server Action create_league: inserts the league, adds the caller as commissioner, mints an invite token, generates the slug.',
        destination: '/leagues/[slug]',
        loading: 'Label becomes "Creating". The form is not disabled wholesale — only the submit — so a failed attempt leaves every field editable.',
        success: 'Redirect to the new league, invite panel expanded, focus on the copy control. The commissioner\'s next act is always sharing.',
        failure: 'Field errors render inline AND as a summary above the form ("There is 1 problem with this form."), with focus moved to the summary. A form that reports errors only inline is unusable when the failing field is below the fold.',
        motion: 'None. A form that animates on submit is a form that feels slower than it is.' })
    ],
    mapping: {
      route: 'apps/web/app/leagues/new/page.tsx · CreateLeagueForm.tsx',
      component: 'components/shared/actions.tsx · lib/hooks/useAction.ts',
      backend: 'server/actions/leagues.ts → server/use-cases → server/repositories/league.ts',
      database: 'leagues · league_members · league_invites (0016). Slug generated server-side; internal ids never reach the wire.',
      api: 'Server Action. Validation codes, never sentences.',
      status: 'exists',
      notes: 'This screen must be live in public WEEKS before the draw exists. A commissioner cannot recruit twelve coworkers in the 72 hours between the draw and the lock — pools ship before brackets can be filled, and that inversion is the single most important scheduling decision in the launch plan.'
    }
  },

  {
    id: 'invite', name: 'Invite friends', mvp: 'mvp', route: '/leagues/[slug] (panel)',
    alias: { id: 'league-home', state: 0 },
    group: 'Leagues',
    purpose:
      'One link, copied. The entire growth loop is this control working on a phone, in a group chat, on the first try.',
    entry: ['Immediately after league creation, expanded', 'The league home, for the commissioner'],
    exit: ['Out of product — the clipboard'],
    data: ['league_invites.token (0016)', 'The absolute URL /join/[token]'],
    states: ['Idle', 'Copied', 'Copy failed', 'Token revoked'],
    interactions: [
      ix({ name: 'Copy link', action: 'Click',
        behaviour: 'navigator.clipboard.writeText on the absolute invite URL.',
        success: 'Label becomes "Copied" for 2.2 seconds, then returns. The label is the feedback — no toast, because the control is already where the eye is.',
        failure: 'The clipboard can be denied: insecure context, permissions policy, an embedded webview. On rejection the product says "Could not copy. Select the link above and copy it by hand." and the link stays selectable. A control that does nothing and reports nothing is indistinguishable from a broken one, and the previous implementation caught the rejection and said nothing at all.',
        motion: 'Label crossfade only, 120ms.' }),
      ix({ name: 'The link itself', action: 'Select / long-press',
        behaviour: 'Rendered as selectable monospaced text, never as an image or a truncated span with a hidden full value.',
        data: 'Same token.' }),
      ix({ name: 'Revoke and re-issue', action: 'Click',
        behaviour: 'Mints a new token and invalidates the old one.',
        disabled: 'Commissioner only. For a member the control is absent, not disabled.',
        success: 'The displayed link changes in place and a status region announces it.',
        failure: 'On failure the OLD link stays displayed — showing a new token that was not persisted would hand out a link that does not work.',
        status: 'needs' })
    ],
    mapping: {
      route: 'apps/web/components/leagues/CopyInvite.tsx',
      component: 'CopyInvite.tsx — a client component, one of very few',
      backend: 'None for copy. Revoke needs a Server Action.',
      database: 'league_invites (0016)',
      api: 'Clipboard API only.',
      status: 'partial',
      notes: 'Copy exists and handles rejection. Revoke/re-issue does not exist. For an invited beta a permanent token is acceptable; write that acceptance down rather than leaving it implied.'
    }
  },

  {
    id: 'join', name: 'Join a league', mvp: 'mvp', route: '/join/[token]',
    group: 'Leagues',
    purpose:
      'The receiving end of the growth loop, and the screen with the highest ratio of importance to size in the product. A stranger arrives from a group chat and has to understand what they are joining before they are asked to sign in.',
    entry: ['An invite link, from anywhere'],
    exit: ['Join → /leagues/[slug]', 'Sign in first → /sign-in?next=/join/[token]', 'Invalid → /leagues or the landing page'],
    data: ['The league name, format, member count and tournament — resolved from the token BEFORE authentication', 'Session presence'],
    states: ['Signed out', 'Signed in', 'Already a member', 'Invalid or revoked', 'Joining'],
    interactions: [
      ix({ name: 'Join this league (prominent)', action: 'Click',
        behaviour: 'Signed in: Server Action accept_invite, inserting a league_members row and enrolling the member in the field of every tournament the league already has. Signed out: routes to /sign-in carrying ?next=/join/[token].',
        destination: '/leagues/[slug]',
        data: 'The token. The caller\'s user id, server-side only.',
        disabled: 'Disabled while joining. Absent when already a member — that case shows "Go to the league" instead, because a Join button that means Open is a lie.',
        loading: 'Label becomes "Joining".',
        success: 'Redirect to the league home. The Daily Check on arrival is the draw-pending one: your league is ready, invite your friends.',
        failure: 'An invalid or revoked token renders a page that names what happened and offers the landing page — never a 404, because the user did nothing wrong and a 404 reads as their mistake.',
        status: 'exists' }),
      ix({ name: 'Sign in first', action: 'Click',
        behaviour: 'The `next` round trip. This is the exact case routes.ts safeNext() exists to make safe: carrying a destination through an auth redirect is also the textbook open-redirect vulnerability.',
        destination: '/sign-in?next=%2Fjoin%2F[token]',
        failure: 'An absolute URL, a protocol-relative URL, a backslash-smuggled variant or anything with a scheme is refused and falls back to home rather than erroring.' })
    ],
    mapping: {
      route: 'apps/web/app/join/[token]/page.tsx · AcceptInvite.tsx',
      component: 'AcceptInvite.tsx · components/shared/actions.tsx · lib/routes.ts',
      backend: 'server/actions/leagues.ts (accept invite) · repositories/league.ts',
      database: 'league_invites · league_members · league_tournament_entries (0016, 0017)',
      api: 'Server Action. The pre-auth league preview is a SECURITY DEFINER read returning exactly name, format, member count and tournament — nothing else.',
      status: 'exists',
      notes: 'The pre-auth preview is the part to protect in review. It must never widen: a token holder is not a member, and the preview is the one place a non-member reads league data.'
    }
  },

  {
    id: 'league-home', name: 'League home', mvp: 'mvp', route: '/leagues/[slug]',
    group: 'Leagues',
    purpose:
      'The answer to "I wonder what happened in my league today". It leads with the Daily Check — a computed personal sentence — and not with a dashboard, because a dashboard is a thing you check once.',
    entry: ['/leagues', 'An invite acceptance', 'A bookmark — this is the page members return to'],
    exit: ['Open my bracket → /leagues/[slug]/t/[ref]/bracket', 'A tournament → /leagues/[slug]/t/[ref]', 'Season standings → /leagues/[slug]/season', 'The result → /leagues/[slug]/t/[ref]/result'],
    data: [
      'league + membership (0016)',
      'daily_check_log / computed check (0018, 0024) via packages/core/src/league/pulse.ts',
      'the focus tournament and its standings (0017)',
      'between-tournaments state (0027) when nothing is in play'
    ],
    states: [
      'Draw pending',
      'Awaiting entries',
      'Bracket stale',
      'Live · morning',
      'Live · now',
      'Live · evening',
      'Quiet day',
      'Champion out',
      'Picks voided',
      'Finished',
      'No data',
      'Loading',
      'Unexpected error'
    ],
    interactions: [
      ix({ name: 'The check action', action: 'Click',
        behaviour: 'One action, chosen by the check\'s own kind. Draw pending → copy the invite. Awaiting entries → open the bracket. Finished → see the result. The check decides; the component never picks its own destination.',
        destination: 'Varies by check kind',
        empty: 'A check with no action renders no button. An always-present call to action would make every day look identical, which is the failure this screen exists to avoid.' }),
      ix({ name: 'Standings preview', action: 'Read / click "All 12"',
        behaviour: 'Five rows. A league home that renders forty is a leaderboard.',
        destination: '/leagues/[slug]/t/[ref]' }),
      ix({ name: 'Tournament row', action: 'Click', behaviour: 'Opens that tournament inside this league.',
        destination: '/leagues/[slug]/t/[ref]' }),
      ix({ name: 'Copy invite', action: 'Click', behaviour: 'See the invite screen. Present for the commissioner in every state, and prominent in draw-pending.', status: 'exists' })
    ],
    mapping: {
      route: 'apps/web/app/leagues/[slug]/page.tsx',
      component: 'DailyCheck.tsx · StandingsTable.tsx · TournamentRow.tsx · BetweenTournaments.tsx · CommissionerPanel.tsx · CopyInvite.tsx',
      backend: 'server/use-cases/index.ts composes the check; packages/core/src/league/pulse.ts computes it.',
      database: 'leagues · league_members · league_tournaments · bracket_snapshots · daily_check_log (0016–0018, 0024, 0027)',
      api: 'Server Component read. The check is computed in core from projections, never assembled in the component.',
      status: 'partial',
      notes: 'BLOCKER. The check is honest and will be permanently quiet until settlement is scheduled — nothing invokes packages/settlement today, so previous_score stays null forever and no standing ever moves. See runbooks/SETTLEMENT-SCHEDULING.md. Also: the three-check design (morning/live/evening) has never seen real start times — the Reality Milestone fixture has dates but no times, so every match in it began at the same instant. Its test count is not evidence.'
    }
  },

  {
    id: 'league-standings', name: 'Season standings', mvp: 'mvp', route: '/leagues/[slug]/season',
    group: 'Leagues',
    purpose:
      'The running table across a whole year. This is the screen that makes the product\'s central claim true — a bracket pool dies with its tournament; a league keeps its people, its rivalries and a table.',
    entry: ['League home, season leagues only', 'The between-tournaments module'],
    exit: ['A tournament → /leagues/[slug]/t/[ref]', 'Back to the league'],
    data: ['season standings aggregate (0017, 0019)', 'per-tournament results and weights'],
    states: ['Populated', 'Empty', 'Partially settled', 'Loading'],
    interactions: [
      ix({ name: 'How points work', action: 'Expand',
        behaviour: 'Discloses the scoring rule in one paragraph: every tournament is worth the same maximum whatever its size, so a perfect bracket at a 250 is worth exactly what a perfect bracket at a Slam is. Points are awarded when an event finishes, not while it is being played.',
        motion: 'Height transition, 220ms, ease-standard. Bypassed under prefers-reduced-motion by the global rule.' }),
      ix({ name: 'Tournament row', action: 'Click', destination: '/leagues/[slug]/t/[ref]', behaviour: 'Opens that event.' })
    ],
    mapping: {
      route: 'apps/web/app/leagues/[slug]/season/page.tsx',
      component: 'StandingsTable.tsx (SeasonStandings) · TournamentRow.tsx',
      backend: 'repositories/league.ts', database: 'league_tournaments · bracket_snapshots · season aggregates (0017, 0019)',
      api: 'Server Component read.', status: 'exists',
      notes: 'The season table is downstream of settlement. Until §3.1 is closed it renders zeroes honestly and the empty-state copy carries the page.'
    }
  },

  {
    id: 'between', name: 'Between tournaments', mvp: 'mvp', route: '/leagues/[slug] (state)',
    group: 'Leagues',
    purpose:
      'The gap between events, designed rather than left blank. A league is waiting, not finished — and the modules here are what stop a season league feeling dead for three weeks in July.',
    entry: ['League home when no tournament is in play'],
    exit: ['Add the next tournament (commissioner) → picker', 'The last result → /leagues/[slug]/t/[ref]/result', 'Season table → /leagues/[slug]/season'],
    data: ['next tournament and its lock instant', 'last result', 'champion history', 'head-to-head rivalry', 'entry streak', 'members joined since the last draw (0027)'],
    states: ['Next draw known', 'Next draw unannounced', 'No calendar'],
    interactions: [
      ix({ name: 'Add the next tournament', action: 'Click',
        behaviour: 'Commissioner only. Adds an event to the league; every member joins its field automatically.',
        disabled: 'Absent for a member, not disabled.',
        empty: '"Nothing on the calendar yet. Add the next tournament and everyone in the league gets it the moment the draw lands."',
        status: 'exists' }),
      ix({ name: 'Countdown', action: 'Read',
        behaviour: 'Renders the lock in the VIEWER\'s zone, with the venue clock as a footnote when the two differ.',
        data: 'preferences.time_zone (0020) · tournaments.venue_time_zone',
        failure: 'If the next draw has no announced date: "The next draw has not been announced. Your league is waiting, not finished." Never a blank countdown.' })
    ],
    mapping: {
      route: 'apps/web/components/leagues/BetweenTournaments.tsx',
      component: 'BetweenTournaments.tsx · StandingsTable.tsx · primitives (LocalDeadline)',
      backend: 'server/use-cases (between state)', database: '0027_between_and_measurement.sql',
      api: 'Server Component read.', status: 'exists',
      notes: 'Time formatting is server-side against an explicit zone, deliberately. Rendering a time on the client flashes on first paint and produces a hydration mismatch that React resolves by trusting the server — so the correction sometimes never happens.'
    }
  },

  /* ===================================================================== */
  /* THE TOURNAMENT AND THE BRACKET                                         */
  /* ===================================================================== */

  {
    id: 'tournament-entry', name: 'Tournament in a league', mvp: 'mvp', route: '/leagues/[slug]/t/[ref]',
    group: 'Tournament',
    purpose:
      'One event, as this league sees it. It is the entry surface before the lock, the live scoreboard during play, and the result page afterwards — one route, three faces, because they are the same object at three times.',
    entry: ['League home tournament row', 'The Daily Check action', 'The season table'],
    exit: ['Bracket → /leagues/[slug]/t/[ref]/bracket', 'Result → /leagues/[slug]/t/[ref]/result', 'Back to the league'],
    data: ['tournament (name, surface, draw size, starts_on, lock instant, venue zone)', 'the field: who has entered', 'standings for this event', 'settlement health (0012)'],
    states: [
      'Pre · draw not out',
      'Pre · entry open',
      'Locked · play not started',
      'Live',
      'Postponed',
      'Suspended',
      'Cancelled',
      'Complete',
      'Loading',
      'Empty',
      'Offline',
      'Provider error',
      'Settlement failed'
    ],
    interactions: [
      ix({ name: 'Open / Review / View my bracket', action: 'Click',
        behaviour: 'One control, three labels, chosen by state: "Open my bracket" before entry, "Review my bracket" once saved, "View my bracket" after lock. An action keeps the same destination through the flow; only the promise changes.',
        destination: '/leagues/[slug]/t/[ref]/bracket',
        disabled: 'Never disabled. After the lock it opens read-only, which is a different thing from being unavailable.' }),
      ix({ name: 'Submit my bracket', action: 'Click',
        behaviour: 'Server Action submit_entry. Separate from saving: a saved bracket is a private draft; submitting makes it an entry in THIS league. That separation is what lets the league see who has committed without seeing what anyone picked.',
        disabled: 'Disabled after the lock instant, enforced by a Postgres trigger and not by the button. The client is never the source of truth.',
        loading: 'Label becomes "Submitting".',
        success: 'The standings row for the member flips from "Not yet" to "In". The picks stay invisible to everyone.',
        failure: 'A lock that has passed returns a refusal code the surface translates. The button never guesses the lock has passed from the client clock.' }),
      ix({ name: 'Withdraw my entry', action: 'Click',
        behaviour: 'Quiet tone, never prominent. Removes the entry; the bracket itself is kept.',
        disabled: 'Disabled after lock.',
        success: 'Status flips back to "Not yet".',
        failure: 'Refusal code, translated.' }),
      ix({ name: 'Standings table', action: 'Read',
        behaviour: 'Before the lock it shows who has committed and NOTHING about what they picked. After the lock it shows score, movement and whether each member\'s champion is still alive.',
        empty: '"Nobody is in this field yet."' }),
      ix({ name: 'Settlement disclosure', action: 'Read',
        behaviour: 'Renders only when the standings are not current, with wording per state — "we are still counting" and "the last attempt failed" ask different things of the reader. Sourced from draw_settlement_health so the interface reports what the database knows rather than guessing from a timestamp.',
        motion: 'None. role=status, not role=alert — information to receive, not an interruption.' })
    ],
    mapping: {
      route: 'apps/web/app/leagues/[slug]/t/[ref]/page.tsx',
      component: 'StandingsTable.tsx · EntryControls.tsx · primitives (SettlementDisclosure, LocalDeadline) · CommissionerControls.tsx',
      backend: 'repositories/league.ts · server/actions/leagues.ts',
      database: 'league_tournaments · league_tournament_entries · brackets · bracket_snapshots · draw_settlement_health (0012, 0016–0019)',
      api: 'Server Component read + two Server Actions.',
      status: 'partial',
      notes: 'Postponed / suspended / cancelled have NO first-class representation in the current UI. The disruption pipeline has never met real data — Geneva 2025 is the one tournament ever replayed and it had no retirements, walkovers, withdrawals or suspensions. Treat these three states as Needs Engineering and design them before the Cincinnati rehearsal on 13 August, which is the only free chance to find out.'
    }
  },

  {
    id: 'bracket', name: 'Bracket — entry', mvp: 'mvp', route: '/leagues/[slug]/t/[ref]/bracket',
    group: 'Tournament',
    purpose:
      'The signature screen. A tournament tree, not a table: rounds are columns, each slot holds two names, and picking one sends it forward. Every US Open bracket that will ever exist is entered through this screen inside a 72-hour window, so it gets one attempt with no recovery.',
    entry: ['Tournament page', 'The Daily Check action', 'A direct link from a group chat'],
    exit: ['Back to the tournament', 'Submit → same screen, submitted state'],
    data: ['draws + draw_seats (0006, 0025 provenance)', 'the member\'s picks (brackets)', 'the lock instant', 'official results once settled', 'voided picks (0028)'],
    states: [
      'No pick',
      'Partially filled',
      'Complete · unsubmitted',
      'Saving',
      'Save failed',
      'Submitted',
      'Locked',
      'Settled',
      'Void',
      'Loading',
      'Offline'
    ],
    interactions: [
      ix({ name: 'A name in a slot', action: 'Click / Space / Enter / arrow keys',
        behaviour: 'Picks that player to win the match, and advances them into the next round\'s slot. Picking the other name un-picks this one. The pair is a radiogroup of two radios, not two toggle buttons — a mutually exclusive choice is what a radiogroup is, and the previous implementation announced "Alcaraz, toggle button, pressed" with nothing to say the two were alternatives of the same match.',
        data: 'Local state, then autosaved.',
        disabled: 'Not rendered as a button at all after the lock — it becomes a span. A disabled button that will never enable is furniture.',
        success: 'The chosen name takes WEIGHT AND A LEFT RULE, never a fill. A filled row reads as a result; a rule reads as "this one continues", which is what a pick is. It is set in ink, not green — choosing is a claim, not a result.',
        failure: 'Downstream slots the pick invalidates are cleared, and the clearing is visible rather than silent.',
        motion: 'Background colour on hover only, 120ms. The advance is NOT animated: a pick that flies across the draw is a pick you cannot make sixty-three more of.' }),
      ix({ name: 'Autosave', action: 'Automatic',
        behaviour: 'Every change schedules a save 1.2 seconds later; a further change reschedules it. submit_bracket is a whole-bracket replace and is idempotent, so a retry on a bad connection cannot corrupt anything and the last write wins by construction.',
        loading: 'A status region reads "Saving your bracket" — text, not a spinner.',
        success: '"Bracket saved". Then it settles back to "Changes save automatically".',
        failure: '"Your bracket did not save. Nothing has been lost — try again." The wording matters: the member has spent twenty minutes and needs to know the work is still in the page.',
        status: 'exists' }),
      ix({ name: 'Progress', action: 'Read',
        behaviour: '"n of 127 picks made". A count, not a percentage — a draw has a number of matches and that number is meaningful.',
        empty: 'At zero it reads "Pick your way through to a champion."' }),
      ix({ name: 'The scroll region', action: 'Tab / arrow keys / drag',
        behaviour: 'A focusable, named region. A 128 draw is wider than any viewport and reaching the sixth round must not require a trackpad.',
        motion: 'Native scrolling. Round headings stay sticky beneath the app header so a column is never anonymous.' }),
      ix({ name: 'Submit my bracket (prominent)', action: 'Click',
        behaviour: 'Turns the private draft into an entry in this league.',
        disabled: 'Disabled until every match has a pick, AND after the lock. The incomplete case names what is missing rather than greying out silently.',
        loading: '"Submitting".',
        success: 'A confirmation state on the same screen — not a new page. The member sees their own bracket with the commitment recorded above it.',
        failure: 'Refusal code translated at the surface.' })
    ],
    mapping: {
      route: 'apps/web/app/leagues/[slug]/t/[ref]/bracket/page.tsx · loading.tsx',
      component: 'BracketEditor.tsx — a client component, and one of the few that must be',
      backend: 'server/actions/leagues.ts (saveBracketAction) · repositories/league.ts',
      database: 'draws · draw_seats · brackets · bracket_picks · bracket_snapshots (0006–0008); lock authority in 0013; voids in 0028',
      api: 'submit_bracket RPC — whole-bracket replace, idempotent.',
      status: 'exists',
      notes: 'PEAK LOAD IS A CLIFF, NOT A RAMP. The traffic profile is the last three hours before 11:00 ET on 30 August: everyone who procrastinated, filling 127 slots each, at once. Load-test that shape, not an average day. Entry is already incremental and resumable, which is what stops a lost connection at 10:47 costing twenty minutes of work — do not regress it.'
    }
  },

  {
    id: 'bracket-locked', name: 'Bracket — locked and settled', mvp: 'mvp', route: '/leagues/[slug]/t/[ref]/bracket',
    alias: { id: 'bracket', state: 7 },
    group: 'Tournament',
    purpose:
      'The same route after the lock. The picks stop being editable and start being graded, and the moment colour arrives on a name committed to days ago is the emotional payload of the entire product.',
    entry: ['Tournament page after lock', 'The Daily Check'],
    exit: ['Back to the tournament', 'The result artifact'],
    data: ['the member\'s locked picks', 'official winners as they settle', 'voids (0028)'],
    states: ['Locked, nothing settled', 'Partially settled', 'Fully settled', 'Contains voids', 'Offline'],
    interactions: [
      ix({ name: 'A settled name', action: 'Read',
        behaviour: 'Correct picks turn Tournament Green with weight and a green left rule. Incorrect picks turn red and are struck through. Every state ALSO carries a visually hidden word — correct, incorrect, still alive, not yet played — because state carried only by colour is a WCAG 1.4.1 failure and silent to a screen reader.',
        motion: 'Colour transition 220ms on first paint after settlement. This is the one place in the product where motion is emotional rather than explanatory, and it is still 220ms.' }),
      ix({ name: 'A voided pick', action: 'Read',
        behaviour: 'Void outranks every other state, including a settled result — a player can win round one and withdraw before round two, and in that case the later slot is void while the earlier one is not. The slot gets a dashed border, a dashed strike-through, NO colour, and the explanation inside the slot rather than in a legend elsewhere.',
        empty: 'Void is neither a verified fact nor a miss. Spending green or red on it would say something untrue.',
        status: 'exists' }),
      ix({ name: 'Champion', action: 'Read',
        behaviour: '"Your champion: [name]" above the draw. The single fact that decides whether a bracket still has a future.' })
    ],
    mapping: {
      route: 'Same route as bracket entry; the editable flag comes from the database, never the client.',
      component: 'BracketEditor.tsx (editable=false path)',
      backend: 'repositories/league.ts', database: '0013 lock authority · 0028 withdrawal and replacement',
      api: 'Read only.', status: 'exists',
      notes: 'Lock is enforced by a Postgres trigger. If you find yourself adding a lock rule to a component, it belongs in the database or in packages/core.'
    }
  },

  {
    id: 'result', name: 'Result artifact', mvp: 'mvp', route: '/leagues/[slug]/t/[ref]/result',
    group: 'Tournament',
    purpose:
      'A member\'s finished result for one league event, as an object rather than a page. It is the thing somebody screenshots into the group chat.',
    entry: ['The Daily Check when a league is frozen', 'The tournament page after settlement', 'The season table'],
    exit: ['Back to the league'],
    data: ['final rank, field size, score, percent of a perfect bracket, champion pick and whether it came in, season position (0008, 0019)'],
    states: ['Placed (2nd)', 'Won', 'Not yet available', 'Loading'],
    interactions: [
      ix({ name: 'Copy share text', action: 'Click',
        behaviour: 'Copies the artifact sentence — "2nd of 12 in Fourth Floor Slam Challenge at US Open — 588 points. MatchRead."',
        success: 'Label becomes "Copied".',
        failure: 'Same clipboard-denied path as the invite: name the failure and leave the text selectable.',
        status: 'partial' }),
      ix({ name: 'Download image', action: 'Click',
        behaviour: 'Renders the artifact to a shareable image.',
        disabled: 'Does not exist on web. apps/mobile has ShareCanvas and shareImage.ts; there is no web equivalent.',
        status: 'needs' }),
      ix({ name: 'Not-yet-available state', action: 'Read',
        behaviour: '"A result page appears once a tournament has been scored and the league frozen. If this was your league, check back after the final." — an explanation, not a 404.',
        empty: 'Same copy.' })
    ],
    mapping: {
      route: 'apps/web/app/leagues/[slug]/t/[ref]/result/page.tsx',
      component: 'ResultArtifact.tsx',
      backend: 'packages/core/src/results/artifact.ts composes the headline; the surface renders it.',
      database: 'bracket_snapshots · league settlement (0019)',
      api: 'Server Component read, governed by the same RLS as every other league page.',
      status: 'partial',
      notes: 'KNOWN AND ACCEPTED: this URL is shareable WITHIN the league and not outside it. A token-addressed public page needs a token column, a publish action and a read path that bypasses RLS, and every one of those is a way for a private league\'s standings to leave the league. Genuine public sharing is a migration, not a route. The cost is recorded in KNOWN_WEAKNESSES; do not "fix" it by loosening a policy.'
    }
  },

  {
    id: 'tournaments', name: 'Tournaments', mvp: 'mvp', route: '/tournaments',
    group: 'Public',
    purpose: 'The public calendar. Anonymous-readable, indexable, and the surface that makes a tennis year legible at a glance.',
    entry: ['Header nav', 'The landing calendar strip'],
    exit: ['A tournament → /tournaments/[ref]'],
    data: ['tournaments (0001) — name, surface, starts_on, draw size'],
    states: ['Populated', 'Empty', 'Loading'],
    interactions: [
      ix({ name: 'Tournament row', action: 'Click', destination: '/tournaments/[ref]',
        behaviour: 'Opens the public tournament page. The 3px court hairline is the only colour on the row and it means surface, nothing else.' })
    ],
    mapping: {
      route: 'apps/web/app/tournaments/page.tsx · loading.tsx',
      component: 'TournamentRow.tsx (shared with the league surfaces)',
      backend: 'repositories/tournament.ts', database: 'tournaments (0001)',
      api: 'Anonymous Server Component read.', status: 'exists', notes: '—'
    }
  },

  {
    id: 'players', name: 'Players', mvp: 'mvp', route: '/players',
    group: 'Public',
    purpose: 'Rankings. A reference surface — this is a tennis product and a rankings page is table stakes for feeling like one.',
    entry: ['Header nav', 'A name in a draw'],
    exit: ['A player → /players/[ref]'],
    data: ['players + rankings (0001)'],
    states: ['Populated', 'Empty', 'Loading'],
    interactions: [
      ix({ name: 'Player row', action: 'Click', destination: '/players/[ref]', behaviour: 'Opens the player page.',
        empty: '"Rankings appear once the first tournament of the season has been imported."' })
    ],
    mapping: {
      route: 'apps/web/app/players/page.tsx · players/[ref]/page.tsx · loading.tsx',
      component: 'A PlayerChip, which is currently hand-rolled in four places and should be one component.',
      backend: 'repositories/player.ts', database: 'players · rankings (0001)',
      api: 'Anonymous Server Component read.', status: 'exists',
      notes: 'The seed/name/country triple is duplicated in BracketEditor, the rankings table, the operator seat list and the draw list. Extracting PlayerChip is in KNOWN_WEAKNESSES; this prototype implements it once.'
    }
  },

  /* ===================================================================== */
  /* SYSTEM                                                                 */
  /* ===================================================================== */

  {
    id: 'shell', name: 'Global navigation (app shell)', mvp: 'mvp', route: '— wraps every route',
    alias: { id: 'leagues', state: 0 },
    group: 'System',
    purpose:
      'The frame every screen renders inside: skip link, wordmark, three nav links, the language control, the session control, and the footer that carries the two sentences the product is legally and ethically required to keep saying. It is specified once here because it is built once, and because a nav that changes shape between screens is the fastest way to make a product feel assembled rather than designed.',
    entry: ['Present on every route. There is no way to reach a screen without it.'],
    exit: [
      'Wordmark → /',
      'Tournaments → /tournaments',
      'Players → /players',
      'Leagues → /leagues (signed in only)',
      'Sign in → /sign-in (signed out only)',
      'Sign out → / (signed in only)'
    ],
    data: [
      'The session, to decide between Leagues + Sign out and Sign in',
      'preferences.locale (0026), to label the language control',
      'The active route, for aria-current="page"'
    ],
    states: ['Signed in', 'Signed out', 'Narrow viewport (nav wraps, never collapses to a hamburger)'],
    interactions: [
      ix({ name: 'Skip to content', action: 'Tab from the top of the page, then Enter',
        behaviour: 'The first focusable element on every page. Invisible until focused, then it appears against the canvas and moves focus to <main id="main">. It is not decoration: with nine header controls, a keyboard user reaching page content without it costs nine tabs on every navigation.',
        destination: '#main on the current page',
        motion: 'Appears instantly on focus. No transition — a skip link that animates in is a skip link that is slower than tabbing past it.' }),

      ix({ name: 'Wordmark', action: 'Click', destination: '/',
        behaviour: 'Returns to the landing page. The "Tennis brackets" descriptor beside it is an eyebrow, not a link, and is not part of the hit target.',
        data: 'None.' }),

      ix({ name: 'Nav link (Tournaments · Players · Leagues)', action: 'Click',
        behaviour: 'Standard navigation. The active link carries aria-current="page" and is distinguished by weight, never by colour — a green nav link would claim the item is a verified result. Leagues is absent entirely when signed out rather than shown disabled: a control that exists but refuses is worse than a control that does not exist.',
        destination: '/tournaments · /players · /leagues',
        data: 'The session, for the Leagues link only.',
        disabled: 'Never disabled. Leagues is omitted when there is no session.',
        loading: 'Route-level loading.tsx renders the page skeleton; the header itself never enters a loading state and never moves.' }),

      ix({ name: 'Language control (EN)', action: 'Click',
        behaviour: 'Opens language selection. Deliberately placed before the session control: a user who has landed in a language they cannot read must be able to reach this without first solving the sign-in screen in that language.',
        destination: 'Settings (in-shell); the page re-renders server-side in the chosen locale.',
        data: 'preferences.locale (0026) when signed in; a cookie when not.',
        success: 'Every string on the page changes at once. Nothing shifts position — the three locales are laid out to the same measure, and ja is the one that tests it.',
        failure: 'The write fails silently to the cookie and the UI still changes. A language the user cannot read is not the place to surface a database error.',
        motion: 'None. The locale change is a server render, not a transition.',
        status: 'partial' }),

      ix({ name: 'Sign in / Sign out', action: 'Click',
        behaviour: 'Signed out, this is the standard action linking to /sign-in with the current path as next, guarded by safeNext(). Signed in, it is a quiet action that ends the session.',
        destination: '/sign-in?next=… · / after sign out',
        data: 'The session.',
        success: 'Sign out returns to the landing page signed out. No confirmation dialog — signing back in is one email away, and a modal here would be friction pretending to be care.',
        failure: 'If sign-out fails the session is cleared client-side regardless and the user lands on /. Never leave someone who asked to leave still signed in.' }),

      ix({ name: 'Footer', action: 'Read',
        behaviour: 'Two sentences, both permanent. "Free to play. No entry fees, no wagering." states what this product is, on every page, including the ones a stranger lands on first. The second disclaims affiliation with tournament organisers, which is what makes descriptive use of tournament names defensible.',
        destination: '—',
        data: 'None. Neither sentence is translated from a variable — both are i18n keys like everything else.',
        motion: 'None ever.' })
    ],
    mapping: {
      route: 'apps/web/app/layout.tsx → components/AppShell.tsx',
      component: 'AppShell.tsx · actions.tsx (ActionLink, Action) · Eyebrow',
      backend: 'The Supabase session, read server-side in the root layout.',
      database: 'preferences (0020, 0026) — locale and time_zone only',
      api: 'No client fetch. The shell is a Server Component and the session is read once per request.',
      status: 'partial',
      notes:
        'The shell exists and is correct. Two gaps keep it Partial. First, the language control routes to a settings surface that is not a page — locale switching is specified here and the persistence path through preferences.locale has never run against a deployed project, because the magic-link round trip has never run against a deployed project either. Second, no screen reader has ever been used on this product; the skip link, aria-current and the nav landmark are all mechanically correct and none of them has been heard out loud. Budget a real assistive-technology pass before launch and treat the result as a defect list, not a nice-to-have.'
    }
  },

  {
    id: 'settings', name: 'Settings', mvp: 'mvp', route: '— in the shell',
    group: 'System',
    purpose:
      'Two preferences, both of which change how the product reads: language and time zone. There is no settings PAGE — the language picker is in the header and the time zone follows the browser.',
    entry: ['The header language control'],
    exit: ['Stays in place; the page re-renders server-side'],
    data: ['preferences.locale (0026)', 'preferences.time_zone (0020)'],
    states: ['Signed in', 'Saving'],
    interactions: [
      ix({ name: 'Language', action: 'Select',
        behaviour: 'en / es / ja. 427 keys, all three complete, build-gated on completeness.',
        success: 'The page re-renders in the new language server-side. No flash of the old language, because nothing is translated on the client.',
        failure: 'A locale that is not supported falls back to en rather than erroring.',
        status: 'exists' }),
      ix({ name: 'Time zone', action: 'Select',
        behaviour: 'Every instant in the product is rendered in this zone, with the venue clock as a footnote when they differ.',
        disabled: 'No UI exists for this today — it is read from preferences or the browser.',
        status: 'needs' }),
      ix({ name: 'Sign out', action: 'Click', behaviour: 'Clears the session and returns to the landing page.', destination: '/', status: 'exists' })
    ],
    mapping: {
      route: 'apps/web/components/layout/LanguagePicker.tsx · SignOutButton.tsx',
      component: 'LanguagePicker.tsx', backend: 'server/actions/preferences.ts',
      database: 'preferences (0020 time zone, 0026 locale)',
      api: 'Server Action. Cookie for anonymous visitors.',
      status: 'partial',
      notes: 'The columns exist for both. Only language has a control. A time-zone picker is small, and it matters more than it looks: the lock is the one instant in this product where being wrong is unrecoverable.'
    }
  },

  {
    id: 'notifications', name: 'Notifications', mvp: 'post', route: '— not connected',
    group: 'System',
    purpose:
      'A budgeted channel — at most one message a day, and only when something actually moved. It exists in the schema and in core, and it is deliberately connected to nothing.',
    entry: ['— none'],
    exit: ['— none'],
    data: ['notification composition and delivery classification in packages/core/src/notifications'],
    states: ['Not connected'],
    interactions: [
      ix({ name: 'Everything on this screen', action: '—',
        behaviour: 'Nothing here is wired. The Daily Check is a PULL habit by choice: the product\'s bet is that "I wonder what happened in my league today" is a stronger reason to return than a push telling you.',
        status: 'future' })
    ],
    mapping: {
      route: '— none',
      component: '— none on web',
      backend: 'supabase/functions/dispatch-notifications (exists, invoked by nothing)',
      database: 'notification tables from 0013; ADR-0013 budgeted channel; ADR-0015 delivery and failure classification',
      api: '—', status: 'future',
      notes: 'POST LAUNCH, deliberately. Built since migration 0013 and connected to nothing on purpose. Do not wire this for the US Open: an unproven push channel on launch day is a way to be paged at 3am for something the product does not need.'
    }
  },

  {
    id: 'errors', name: 'Error pages', mvp: 'mvp', route: '/404 · error boundary',
    group: 'System',
    purpose:
      'Two different facts, two different pages. "There is nothing at this address" is not the same claim as "this page failed to build", and conflating them tells the user to retry something that will never work.',
    entry: ['A bad URL', 'A thrown error in a Server Component', 'A router-level failure'],
    exit: ['Browse tournaments', 'Go to MatchRead', 'Try again (error boundary only)'],
    data: ['An error reference id on the boundary page.'],
    states: ['Not found', 'Unexpected error', 'Global error'],
    interactions: [
      ix({ name: 'Try again', action: 'Click',
        behaviour: 'Calls the boundary reset. Present on the error page and ABSENT on not-found, because retrying a URL that does not exist is not a recovery.',
        status: 'exists' }),
      ix({ name: 'Error reference', action: 'Read / copy',
        behaviour: 'A short id the member can quote. It is the only thing that makes a support message actionable today, because there is no error tracking anywhere in the product.',
        status: 'partial' }),
      ix({ name: 'Go to MatchRead', action: 'Click', destination: '/',
        behaviour: 'On the global error boundary this is a raw anchor rather than a router Link — the one place in the app where a hand-written anchor is correct, because the router may itself be broken.' })
    ],
    mapping: {
      route: 'apps/web/app/not-found.tsx · app/error.tsx · app/global-error.tsx',
      component: 'components/shared/actions.tsx (actionClasses, exported for exactly this case)',
      backend: '—', database: '—', api: '—',
      status: 'partial',
      notes: 'NOT A BLOCKER BUT NAME IT: apps/web reports no exceptions anywhere. A client-side error is invisible. You will be operating a beta on the Founder Dashboard and member reports. docs/MONITORING.md is a specification for greenfield work, not documentation of existing wiring.'
    }
  },

  {
    id: 'system-states', name: 'System states', mvp: 'mvp', route: '— cross-cutting',
    group: 'System',
    purpose:
      'The four conditions every data-bearing screen must survive: loading, empty, offline and provider error. Specified once here rather than re-specified per screen.',
    entry: ['Any screen'],
    exit: ['Recovery into the normal state'],
    data: ['Whatever the host screen needs; these states are about its absence.'],
    states: ['Loading', 'Empty', 'Offline', 'Provider error'],
    interactions: [
      ix({ name: 'Loading', action: 'Automatic',
        behaviour: 'A skeleton of the page\'s own shape, never a spinner. A spinner says "wait"; a skeleton says "this is what is arriving", which is the calmer claim and the honest one.',
        motion: 'A 1.4s sheen, neutralised under prefers-reduced-motion by the global rule in globals.css.' }),
      ix({ name: 'Empty', action: 'Automatic',
        behaviour: 'Names what is missing and what happens next. Never "no data". Every empty state in this product is an invitation to act.' }),
      ix({ name: 'Offline', action: 'Automatic',
        behaviour: 'A status banner stating that this is the last data MatchRead had, and that bracket edits are queued. The bracket stays editable offline — losing twenty minutes of entry to a dropped connection at 10:47 on lock day is the failure this design exists to prevent.',
        status: 'needs' }),
      ix({ name: 'Provider error', action: 'Automatic',
        behaviour: 'Live scores are not arriving; results shown are from the last successful REST reconciliation sweep. The banner names the sweep rather than saying "something went wrong", because the data on screen is real and merely late.',
        status: 'needs' })
    ],
    mapping: {
      route: 'loading.tsx per route segment · a shared banner component',
      component: 'components/shared/skeleton.tsx exists. An offline/provider banner does NOT.',
      backend: 'provider_freshness (0009) already reports staleness.',
      database: '0009_live_platform.sql',
      api: 'The freshness read exists; nothing renders it to a member.',
      status: 'partial',
      notes: 'BLOCKER 2 CONTEXT. There is no deployable ingestion listener — packages/provider-rapidapi has a tested socket transport and ADR-0018 decided it lives in one always-on container, but that container does not exist. No Dockerfile, no apps/listener, no railway.json. A beta can open without it: results arrive only via the REST sweep, so scores lag by the sweep interval. That is acceptable for an invited beta and NOT for a public launch, because live scores during a match are most of why anyone opens the product. The provider-error state is therefore the normal state until the listener is built.'
    }
  },

  /* ===================================================================== */
  /* OPERATOR                                                               */
  /* ===================================================================== */

  {
    id: 'founder', name: 'Operations dashboard', mvp: 'mvp', route: '/founder',
    group: 'Operator',
    purpose:
      'The surface a launch engineer reads at 3am. It reports and it does not write — the console that changes things is a separate route on purpose.',
    entry: ['Direct URL only. Allowlisted, never linked in nav.'],
    exit: ['Draw changes → /founder/disruption', 'A runbook link per failing metric'],
    data: ['people, playing, settlement, machinery, Daily Check, readiness (0021)'],
    states: ['Healthy', 'Watch', 'Needs attention', 'Replay data mixed in'],
    interactions: [
      ix({ name: 'A metric tile', action: 'Read',
        behaviour: 'Every coloured rule is accompanied by a STATE WORD. The colour is aria-hidden. Colour was the only carrier of health on the page whose entire job is to say whether the platform is broken — the same defect the bracket had, unfixed here because nobody audits an operations surface.',
        status: 'exists' }),
      ix({ name: 'Runbook', action: 'Click', behaviour: 'Opens the incident runbook for that signal.', destination: 'docs/runbooks/*' }),
      ix({ name: 'Replay badge', action: 'Read',
        behaviour: 'States plainly when a rehearsal tournament is in play, because figures that mix replay and production data are worse than no figures.',
        status: 'exists' })
    ],
    mapping: {
      route: 'apps/web/app/founder/page.tsx',
      component: 'components/founder/Dashboard.tsx',
      backend: 'repositories/founder.ts', database: '0021_founder_dashboard.sql',
      api: 'Gated by app_is_founder().',
      status: 'exists',
      notes: 'THE STEP MOST LIKELY TO COST AN HOUR: app_is_founder() gates this route and every function in migrations 0028–0030, and the failure mode is a 404, NOT an error — deliberately, so a stranger cannot discover the route, and confusingly if you have forgotten to seed the allowlist row.'
    }
  },

  {
    id: 'disruption', name: 'Draw changes (operator)', mvp: 'mvp', route: '/founder/disruption',
    group: 'Operator',
    purpose:
      'Replace a player who has withdrawn from a published draw. The one operator surface that writes, and separate from the dashboard deliberately: a screen that both reassures and destroys is one where a tired operator taps the wrong thing at 3am.',
    entry: ['A link from /founder. Never linked in nav.'],
    exit: ['Applied → a verification summary', 'Refused → an explanation', 'Cancel → back'],
    data: ['draws and seats (0028–0030)', 'the preview: brackets affected, picks voided, ceiling reduction', 'a required reason'],
    states: ['Choosing', 'Previewed', 'Applied', 'Refused', 'Draw complete'],
    interactions: [
      ix({ name: 'Replacement search', action: 'Type',
        behaviour: 'Searches players NOT already in this draw. The word "lucky loser" is deliberately absent from the label: the seat can be taken by a lucky loser, a qualifier, an alternate or a special exempt, and naming one would make the other three look wrong.',
        disabled: 'Under two characters it says "Type at least two letters" rather than searching.',
        empty: '"No player outside this draw matches that name."',
        status: 'exists' }),
      ix({ name: 'Reason', action: 'Type',
        behaviour: 'Required, and recorded permanently against the change. "Write what you would want to read in six months."',
        disabled: 'Preview is blocked until it is long enough.',
        failure: '"A few more words — this is the audit trail."' }),
      ix({ name: 'Preview this change', action: 'Click',
        behaviour: 'THE MOST IMPORTANT SCREEN IN THE OPERATOR FLOW. It states the product consequence, never the mechanism: "four members lose a pick", not "four rows will be updated". One of three remedy paragraphs is shown — notify (brackets still editable), void (locked and never played), or eliminate (already competed).',
        success: 'The preview renders. Nothing has been written.',
        failure: 'Refusal codes are translated into sentences. incoming_already_in_draw is not something anybody should read; "That player already holds another seat in this draw. A player cannot appear twice — brackets built on a duplicated name cannot be scored." is.' }),
      ix({ name: 'Apply this change', action: 'Click → confirm',
        behaviour: 'Two steps, always. The confirm names the blast radius in members and picks.',
        disabled: 'Disabled until a preview has been taken. Absent entirely on a completed draw, where a replacement would change nothing.',
        loading: '"Applying".',
        success: 'A verification summary: leagues affected, brackets adjusted, picks voided, whether members will be told, and whether standings are queued for rescoring.',
        failure: 'Nothing is applied. The refusal names which check failed.',
        motion: 'None anywhere in this flow. An irreversible action should never feel fast.' })
    ],
    mapping: {
      route: 'apps/web/app/founder/disruption/page.tsx',
      component: 'components/founder/DisruptionWorkflow.tsx',
      backend: 'server/actions/disruption.ts · repositories/disruption.ts',
      database: '0028_withdrawal_and_replacement · 0029_operator_vocabulary · 0030_replacement_search',
      api: 'SECURITY DEFINER, ref-addressed. Internal ids never reach the wire.',
      status: 'partial',
      notes: 'LEAST-VERIFIED CODE IN THE REPOSITORY. Migration 0030 and its pgTAP suite were written without a database available at all. Suites 0028, 0029 and 0030 have NEVER been executed — plans reconcile and types check, and neither is evidence the SQL is correct. Treat a failure on first run as the expected outcome. This is also the pipeline that has never met real data: Geneva 2025 had no retirements, walkovers, withdrawals or suspensions.'
    }
  },

  {
    id: 'showcase', name: 'Component showcase', mvp: 'mvp', route: '/showcase',
    group: 'System',
    purpose:
      'The living design system. Real components with real projection types, so the showcase cannot quietly describe a product that no longer exists — if a projection changes shape, this page stops compiling.',
    entry: ['Landing "See what it looks like"', 'Direct'],
    exit: ['Anywhere'],
    data: ['app/showcase/fixtures.ts, typed as the production projections'],
    states: ['Static'],
    interactions: [
      ix({ name: 'Every component', action: 'Read',
        behaviour: 'Rendered in its real states. This is the drift guard: it fails the build rather than rotting silently, which is the normal fate of design artefacts.' })
    ],
    mapping: {
      route: 'apps/web/app/showcase/page.tsx · Viewport.tsx · fixtures.ts',
      component: 'All of them.', backend: '—', database: '—', api: '—',
      status: 'exists',
      notes: 'Fixture players are FICTIONAL, deliberately: real names and results in a design surface is a licensing and likeness question, not a design one. This prototype follows the same rule.'
    }
  },

  /* ===================================================================== */
  /* THE MOBILE DAILY-PICKS PRODUCT — cut from the web launch                */
  /* ===================================================================== */

  {
    id: 'today', name: 'Today\'s matches', mvp: 'explor', route: '— mobile only',
    group: 'Daily picks (not on web)',
    purpose:
      'The mobile product\'s spine: today\'s ATP and WTA matches, each one a court with two baselines. Shown here so the two products can be told apart, and so nobody builds it for the US Open by accident.',
    entry: ['apps/mobile (tabs)/matches.tsx'],
    exit: ['A match → /match/[id]'],
    data: ['slate_for_date RPC · matches · players (0001)'],
    states: ['Upcoming', 'Live', 'Completed', 'Postponed', 'Empty'],
    interactions: [
      ix({ name: 'Match card', action: 'Tap', behaviour: 'Opens the match detail.', destination: '/match/[id]', status: 'future' }),
      ix({ name: 'Date strip', action: 'Swipe', behaviour: 'Moves between days.', status: 'future' })
    ],
    mapping: {
      route: 'apps/mobile/app/(tabs)/matches.tsx — React Native, not web',
      component: 'apps/mobile/src/components/match/MatchCard.tsx · PlayerBaseline.tsx',
      backend: 'src/api/slates.ts', database: 'matches · predictions · slate_for_date (0001, 0002)',
      api: 'slate_for_date RPC',
      status: 'future',
      notes: 'DELIBERATELY CUT FROM THE WEB LAUNCH. Read the success definition: create a league, share a link, friends join, everyone completes brackets, standings update, users return. The word "pick" does not appear. On web this is a second product competing with the first for the same fourteen days — the "two Todays" problem — imported into a codebase that has no users yet. Cutting it removes the slate RPC, the lock trigger, community split counters, comment policies, settle-slate and roughly a third of the RLS surface that has never been tested from the critical path. What replaces "users return daily" is bracket movement, which is a stronger hook because it is personal and social rather than editorial.'
    }
  },

  {
    id: 'match-detail', name: 'Match detail', mvp: 'explor', route: '— mobile only',
    group: 'Daily picks (not on web)',
    purpose:
      'One match, studied. Objective statistics beside human MatchRead editorial, and then a single decision: who wins. Winner only, never a score.',
    entry: ['A match card'],
    exit: ['Back', 'Pick submitted'],
    data: ['match · both players\' baselines · engine probability · editorial · the community split'],
    states: ['No pick', 'Pick selected', 'Pick submitted', 'Locked', 'Correct', 'Incorrect'],
    interactions: [
      ix({ name: 'A baseline', action: 'Tap',
        behaviour: 'Picks that player. The baseline lights.',
        disabled: 'Locked at first serve, enforced by a Postgres trigger.',
        status: 'future' }),
      ix({ name: 'The community split', action: 'Read',
        behaviour: 'HIDDEN until the viewer has picked this match. Enforced in RLS and in the RPC, not just in the UI. It prevents herd bias and keeps the product a scouting habit rather than a poll — one of the three product decisions enforced in Postgres rather than in the interface.',
        status: 'future' }),
      ix({ name: 'Comments', action: 'Read / write',
        behaviour: 'Open only AFTER the match finishes, and only inside that match. Anti-toxicity as a database constraint. No global feed, no DMs.',
        status: 'future' })
    ],
    mapping: {
      route: 'apps/mobile/app/match/[id].tsx',
      component: 'MatchCard.tsx · PlayerBaseline.tsx · ConfidenceControl.tsx · EditorialCard.tsx · Meters.tsx',
      backend: 'src/api/slates.ts', database: 'predictions · lock trigger · split counters · comments (0001, 0004)',
      api: 'submit_predictions RPC',
      status: 'future',
      notes: 'The three signature decisions this screen enforces — pick secrecy, difficulty-weighted rating, post-match-only comments — are all in Postgres. If a web version is ever built, none of that logic moves to the client.'
    }
  },

  {
    id: 'match-iq', name: 'Prediction history / Match IQ', mvp: 'explor', route: '— mobile only',
    group: 'Daily picks (not on web)',
    purpose:
      'The permanent record of a daily picker: a difficulty-weighted rating and the graded history behind it.',
    entry: ['apps/mobile profile tab'],
    exit: ['A graded day → /results/[date]'],
    data: ['rating_events · the materialised leaderboard · graded predictions'],
    states: ['Populated', 'Empty'],
    interactions: [
      ix({ name: 'Rating', action: 'Read',
        behaviour: 'Scores DIFFICULTY, not volume: correct → +K·(1−p), incorrect → −K·p, where p is the engine probability of the picked side. Expected value at the model\'s own price is exactly zero, so no strategy farms rating.',
        status: 'future' })
    ],
    mapping: {
      route: 'apps/mobile/app/(tabs)/profile.tsx · results/[date].tsx',
      component: 'MatchIQProgress.tsx · GradedPickRow.tsx · DayVerdict.tsx',
      backend: 'src/api/profile.ts · results.ts',
      database: 'rating_events · leaderboard materialised view (0001, 0005)',
      api: '—', status: 'future',
      notes: 'CUT FROM THE WEB LAUNCH. League standings are scored by tournament score. Match IQ is the record of a daily picker and no US Open web user will have one — showing a stranger\'s 1,200 starting rating next to their bracket score teaches them nothing and invites exactly the currency-proliferation problem the Product Constitution spends a whole part on. Cutting it takes the ratings tables, rating_events, the materialised leaderboard and its refresh job entirely off the launch path.'
    }
  },

  {
    id: 'user-profile', name: 'User profile', mvp: 'post', route: '— not on web',
    group: 'Daily picks (not on web)',
    purpose:
      'A member\'s own page. On web the identity surface is a standings row and a result artifact, and that is enough for a bracket league.',
    entry: ['— none on web'],
    exit: ['— none on web'],
    data: ['profiles.display_name (0001)'],
    states: ['Not built on web'],
    interactions: [
      ix({ name: 'Everything', action: '—',
        behaviour: 'Not built on web, and not on the launch path. /players is a page about TENNIS PLAYERS, not about members — do not conflate the two routes.',
        status: 'future' })
    ],
    mapping: {
      route: '— none', component: '— none', backend: '—',
      database: 'profiles (0001)', api: '—', status: 'future',
      notes: 'POST LAUNCH. Naming trap worth stating once: on web, "player" means a tennis player and "member" means a person in a league. The route table reflects that and so should every component name.'
    }
  }

  ];

  /* --------------------------- derived lookups ---------------------------- */

  MR.registryById = {};
  MR.registry.forEach(function (s) { MR.registryById[s.id] = s; });

  MR.STATUS_LABEL = {
    exists: 'Already Exists',
    partial: 'Partial',
    needs: 'Needs Engineering',
    future: 'Future Feature'
  };
})();
