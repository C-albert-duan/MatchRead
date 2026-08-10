/* =========================================================================
   screens.js — the product surfaces.
   -------------------------------------------------------------------------
   Each screen declares its states and renders one of them. Nothing here holds
   its own markup for a component that exists in components.js — that is the
   whole discipline of the file. If a Match Card appears on six screens it is
   imported six times and written once.
   ========================================================================= */

(function () {
  'use strict';

  var h = MR.h, U = MR.ui, D = MR.data;

  /* Shorthand */
  function P(text, cls) { return h('p', { class: cls || 't-body c-secondary', style: 'margin:0' }, text); }
  function Stack(gap) {
    var kids = Array.prototype.slice.call(arguments, 1);
    return h('div', { class: 'stack gap-' + gap }, kids);
  }

  MR.screens = {};

  /* ===================================================================== */
  /* LANDING                                                                */
  /* ===================================================================== */

  MR.screens.landing = {
    states: ['Signed out', 'Signed in', 'Loading', 'Unexpected error'],
    signedOut: function (s) { return s !== 'Signed in'; },
    render: function (state) {
      if (state === 'Loading') return U.PageSkeleton();
      if (state === 'Unexpected error') return MR.screens.errors.render('Unexpected error');

      var signedIn = state === 'Signed in';

      var steps = [
        ['Start a league', 'Name it, pick a tournament or a whole season, and you are the commissioner.'],
        ['Share one link', 'Drop it in the group chat. People join in two taps.'],
        ['Fill in a bracket', 'When the draw lands, everyone picks. Nobody sees anyone else\u2019s until it locks.'],
        ['Check it tomorrow', 'Standings move as matches finish.']
      ];

      var why = [
        ['The league does not end', 'A bracket pool dies with its tournament. A MatchRead league keeps its people, its rivalries and a running table across the whole season.'],
        ['One bracket, every league', 'Fill in your bracket once. It enters every league you belong to \u2014 nobody wants to type the same picks four times.'],
        ['Standings that tell you what changed', 'Not just a score. Up two overnight, forty points off the lead, champion still standing \u2014 the things you would actually text someone about.']
      ];

      return Stack('4xl',
        h('div', { class: 'stack gap-lg', style: 'padding:24px 0 8px' },
          h('div', { class: 'row wrap between gap-md' },
            U.Eyebrow('Tennis leagues'),
            U.MvpBadge('mvp')),
          h('h1', { class: 'f-display t-hero c-primary prose', style: 'margin:0' },
            'Follow the tennis season with your people.'),
          h('p', { class: 't-lead c-secondary prose', style: 'margin:0' },
            'Start a league, share one link, and fill in a bracket together. One tournament, or a whole year \u2014 the league carries on between them.'),
          h('div', { class: 'row wrap gap-md', style: 'margin-top:8px' },
            U.Action(signedIn ? 'Go to my leagues' : 'Start a league', function () {
              MR.go(signedIn ? 'leagues' : 'sign-in');
            }, 'prominent'),
            U.Action('See what it looks like', function () { MR.go('showcase'); }, 'standard'))
        ),

        // The calendar strip. Seven court hairlines stacked is the shape of a
        // tennis year, legible without a single extra word.
        U.Section('On the calendar',
          h('ul', { class: 'stack gap-md', style: 'margin:0;padding:0;list-style:none' },
            D.TOURNAMENTS.slice(2).map(function (t) {
              return U.TournamentRow(t, {
                phase: t.ref === 'ext-uso-2026' ? 'noDraw' : 'complete',
                onClick: function (e) { e.preventDefault(); MR.go('tournaments'); }
              });
            }))),

        U.Section('How it works',
          h('ol', { style: 'margin:0;padding:0;list-style:none;display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
            steps.map(function (s, i) {
              // Numbered because the content genuinely is a sequence — you
              // cannot fill a bracket before a league exists.
              return h('li', { class: 'stack gap-sm' },
                h('span', { class: 'eyebrow' }, String(i + 1).padStart(2, '0')),
                h('span', { class: 'f-display t-title3 c-primary' }, s[0]),
                h('span', { class: 't-body c-muted' }, s[1]));
            }))),

        U.Section('Why it is not the spreadsheet you tried last year',
          h('dl', { style: 'margin:0;display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))' },
            why.map(function (w) {
              return h('div', { class: 'stack gap-sm' },
                h('dt', { class: 'f-display t-title3 c-primary' }, w[0]),
                h('dd', { class: 't-body c-muted', style: 'margin:0' }, w[1]));
            })))
      );
    }
  };

  /* ===================================================================== */
  /* SIGN IN                                                                */
  /* ===================================================================== */

  MR.screens['sign-in'] = {
    states: ['Idle', 'Invalid address', 'Submitting', 'Check your email', 'Rate limited'],
    signedOut: function () { return true; },
    render: function (state) {
      var sent = state === 'Check your email';
      var submitting = state === 'Submitting';
      var invalid = state === 'Invalid address';
      var limited = state === 'Rate limited';

      if (sent) {
        return h('div', { class: 'stack gap-2xl prose' },
          U.PageHeader({ eyebrow: 'Check your email', mvp: 'mvp', title: 'A sign-in link is on its way.' }),
          P('We sent it to priya.raghunathan@example.com. The link signs you in and brings you straight back to where you were.'),
          h('div', { class: 'row wrap gap-md' },
            U.Action('Send it again', function () { U.toast('Sent again'); }, 'standard'),
            U.Action('Use a different address', function () { MR.go('sign-in', 0); }, 'standard', 'quiet')),
          h('p', { class: 'hint', style: 'margin:0' },
            'Nothing arrived? Check spam, then try again in 30 seconds \u2014 we limit how often a link can be sent to one address.')
        );
      }

      return h('div', { class: 'stack gap-2xl prose' },
        U.PageHeader({
          eyebrow: 'Sign in', mvp: 'mvp', title: 'Sign in to MatchRead',
          lead: 'We email you a link. No password to remember, and no account to create first \u2014 a new address gets an account the first time it signs in.'
        }),
        h('div', { class: 'stack gap-md' },
          h('label', { class: 'field-label t-caption c-secondary', for: 'email' }, 'Email address'),
          h('input', {
            class: 'input', id: 'email', type: 'email', autocomplete: 'email',
            placeholder: 'you@example.com',
            value: invalid ? 'priya.raghunathan@' : '',
            'aria-invalid': invalid ? 'true' : null,
            'aria-describedby': invalid ? 'email-err' : null
          }),
          invalid ? h('p', { class: 'err', id: 'email-err', role: 'alert', style: 'margin:0' }, 'Enter a complete email address') : null,
          limited ? h('p', { class: 'err', role: 'alert', style: 'margin:0' },
            'Too many links requested for this address. Try again in 4 minutes \u2014 the last link we sent is still valid.') : null
        ),
        h('div', null,
          U.Action(submitting ? 'Sending' : 'Send me a link', function () { MR.go('sign-in', 3); }, 'prominent', null,
            { disabled: submitting || limited })),
        h('p', { class: 'hint', style: 'margin:0' }, 'Free to play. No entry fees, no wagering.')
      );
    }
  };

  MR.screens.onboarding = {
    states: ['Prompt', 'Saving'],
    render: function (state) {
      return h('div', { class: 'stack gap-2xl prose' },
        U.PageHeader({
          eyebrow: 'One more thing', mvp: 'post', title: 'What should your league call you?',
          lead: 'This is the name that appears in every standings row, in every league you join. It is the only identity decision MatchRead asks you to make.'
        }),
        h('div', { class: 'stack gap-md' },
          h('label', { class: 'field-label t-caption c-secondary', for: 'dn' }, 'Display name'),
          h('input', { class: 'input', id: 'dn', value: 'Priya Raghunathan' }),
          h('label', { class: 'field-label t-caption c-secondary', for: 'tz', style: 'margin-top:8px' }, 'Time zone'),
          h('select', { class: 'input select', id: 'tz' },
            h('option', null, 'America/Los_Angeles \u2014 detected'),
            h('option', null, 'America/New_York'),
            h('option', null, 'Europe/London')),
          h('p', { class: 'hint', style: 'margin:0' },
            'Every lock time and start time is shown in this zone. There is no default: a member reading a New York lock time on a California clock misses the tournament by three hours.')),
        h('div', { class: 'row wrap gap-md' },
          U.Action(state === 'Saving' ? 'Saving' : 'Continue', function () { MR.go('leagues'); }, 'prominent', null, { disabled: state === 'Saving' }),
          U.Action('Skip for now', function () { MR.go('leagues'); }, 'standard', 'quiet'))
      );
    }
  };

  /* ===================================================================== */
  /* LEAGUES                                                                */
  /* ===================================================================== */

  MR.screens.leagues = {
    states: ['Has leagues', 'Empty', 'Loading', 'Unexpected error'],
    render: function (state) {
      if (state === 'Loading') return U.PageSkeleton();
      if (state === 'Unexpected error') return MR.screens.errors.render('Unexpected error');

      var header = U.PageHeader({ eyebrow: 'Your leagues', mvp: 'mvp', title: 'Leagues' });

      if (state === 'Empty') {
        return Stack('2xl', header,
          U.EmptyState('No leagues yet',
            'Start one for a single tournament, or for a whole season. Invite whoever you would text about a five-setter.',
            U.Action('Start a league', function () { MR.go('create-league'); }, 'prominent')));
      }

      return Stack('2xl',
        h('div', { class: 'row wrap between gap-md' }, header,
          U.Action('Start a league', function () { MR.go('create-league'); }, 'prominent')),
        h('ul', { class: 'stack gap-md', style: 'margin:0;padding:0;list-style:none' },
          U.LeagueCard(D.SINGLE_LEAGUE, {
            note: '3 brackets missing',
            onClick: function (e) { e.preventDefault(); MR.go('league-home'); }
          }),
          U.LeagueCard(D.SEASON_LEAGUE, {
            note: '1st of 14',
            onClick: function (e) { e.preventDefault(); MR.go('league-standings'); }
          }))
      );
    }
  };

  MR.screens['create-league'] = {
    states: ['Idle', 'Validation error', 'Submitting'],
    render: function (state) {
      var invalid = state === 'Validation error';
      var format = { value: 'single' };

      function choice(group, value, title, detail, checked) {
        var node = h('label', { class: 'choice', 'data-selected': checked ? 'true' : 'false' },
          h('input', { type: 'radio', name: group, checked: checked || false,
            onChange: function () {
              Array.prototype.forEach.call(node.parentNode.children, function (c) { c.setAttribute('data-selected', 'false'); });
              node.setAttribute('data-selected', 'true');
              if (group === 'format') {
                format.value = value;
                var picker = document.getElementById('tournament-picker');
                if (picker) picker.style.display = value === 'single' ? '' : 'none';
              }
            } }),
          h('span', { class: 'stack gap-xs' },
            h('span', { class: 't-body c-primary f-medium' }, title),
            h('span', { class: 't-caption c-muted' }, detail)));
        return node;
      }

      return h('div', { class: 'stack gap-3xl prose' },
        U.PageHeader({
          eyebrow: 'New league', mvp: 'mvp', title: 'Start a league',
          lead: 'Four decisions. Two of them cannot be changed afterwards, and both are marked.'
        }),

        invalid ? h('div', {
          role: 'alert', tabindex: '-1',
          class: 'disclosure disclosure--urgent', style: 'margin:0'
        }, h('span', { class: 'disclosure-dot', 'aria-hidden': 'true' }),
          'There is 1 problem with this form.') : null,

        h('div', { class: 'stack gap-md' },
          h('label', { class: 'field-label t-caption c-secondary', for: 'lname' }, 'League name'),
          h('input', {
            class: 'input', id: 'lname', value: invalid ? '' : 'Fourth Floor Slam Challenge',
            placeholder: 'Fourth Floor Slam Challenge',
            'aria-invalid': invalid ? 'true' : null, 'aria-describedby': invalid ? 'lname-err' : null
          }),
          invalid ? h('p', { class: 'err', id: 'lname-err', style: 'margin:0' }, 'Give your league a name') : null),

        h('fieldset', { style: 'border:0;padding:0;margin:0' },
          h('legend', { class: 'eyebrow', style: 'padding:0;margin-bottom:12px' }, 'Format \u2014 cannot be changed later'),
          h('div', { class: 'stack gap-sm' },
            choice('format', 'single', 'Single tournament', 'One draw, one table, and the league ends with the final.', true),
            choice('format', 'season', 'Season league', 'Every event you add scores into a running table. The league keeps its people between tournaments.'))),

        h('fieldset', { style: 'border:0;padding:0;margin:0' },
          h('legend', { class: 'eyebrow', style: 'padding:0;margin-bottom:12px' }, 'Who can see it'),
          h('div', { class: 'stack gap-sm' },
            choice('visibility', 'private', 'Private', 'Only people with the invite link. This is the default.', true),
            choice('visibility', 'public', 'Public', 'Anyone can find and read the standings. Members still hold their picks until the lock.'))),

        h('div', { class: 'stack gap-md', id: 'tournament-picker' },
          h('label', { class: 'field-label t-caption c-secondary', for: 'tpick' }, 'Which tournament'),
          h('select', { class: 'input select', id: 'tpick' },
            h('option', null, 'US Open \u2014 draw locks Sun 30 Aug, 11:00'),
            h('option', null, 'Winston-Salem \u2014 draw locks Sun 23 Aug, 10:00')),
          h('p', { class: 'hint', style: 'margin:0' },
            'The draw does not have to exist yet. Members join now and the bracket opens the moment it lands.')),

        h('div', { class: 'row wrap gap-md' },
          U.Action(state === 'Submitting' ? 'Creating' : 'Create league', function () { MR.go('league-home', 0); },
            'prominent', null, { disabled: state === 'Submitting' }),
          U.Action('Cancel', function () { MR.go('leagues'); }, 'standard', 'quiet'))
      );
    }
  };

  MR.screens.join = {
    states: ['Signed out', 'Signed in', 'Already a member', 'Invalid or revoked', 'Joining'],
    signedOut: function (s) { return s === 'Signed out'; },
    render: function (state) {
      if (state === 'Invalid or revoked') {
        return h('div', { class: 'stack gap-2xl prose' },
          U.PageHeader({ eyebrow: 'Invite', mvp: 'mvp', title: 'This invite is no longer valid' }),
          P('The link may have been replaced by the commissioner, or the league may have closed. Ask whoever sent it for a fresh one \u2014 nothing is wrong with your account.'),
          h('div', null, U.Action('Go to MatchRead', function () { MR.go('landing'); }, 'standard')));
      }

      var already = state === 'Already a member';
      var signedOut = state === 'Signed out';

      return h('div', { class: 'stack gap-2xl prose' },
        U.PageHeader({ eyebrow: 'Invite', mvp: 'mvp', title: 'Danny March invited you to ' + D.SINGLE_LEAGUE.name }),
        h('div', { class: 'panel stack gap-lg' },
          h('dl', { class: 'row wrap gap-3xl', style: 'margin:0' },
            U.Field('Format', 'Single tournament', false),
            U.Field('Members', '11'),
            U.Field('Tournament', 'US Open', false)),
          h('hr', { class: 'rule' }),
          P('Brackets open when the draw is released on Thursday. The draw locks Sunday 30 August at 11:00 \u2014 after that the field is the field.', 't-caption c-muted')),

        already
          ? h('div', { class: 'stack gap-md' },
              P('You are already in this league.'),
              h('div', null, U.Action('Go to the league', function () { MR.go('league-home'); }, 'prominent')))
          : h('div', { class: 'row wrap gap-md' },
              U.Action(
                state === 'Joining' ? 'Joining' : (signedOut ? 'Sign in and join' : 'Join this league'),
                function () { MR.go(signedOut ? 'sign-in' : 'league-home'); },
                'prominent', null, { disabled: state === 'Joining' }),
              signedOut ? P('You will come straight back here.', 't-caption c-muted') : null),

        signedOut ? h('p', { class: 'hint', style: 'margin:0' },
          'Signing in carries this invite with you. The destination is validated as a path on this site and nothing else \u2014 an invite link can never redirect you off MatchRead.') : null
      );
    }
  };

  /* ===================================================================== */
  /* LEAGUE HOME                                                            */
  /* ===================================================================== */

  var CHECK_STATES = [
    ['Draw pending', 'draw_pending', 'pre'],
    ['Awaiting entries', 'awaiting_entries', 'pre'],
    ['Bracket stale', 'bracket_stale', 'pre'],
    ['Live \u00b7 morning', 'live_morning', 'live'],
    ['Live \u00b7 now', 'live_now', 'live'],
    ['Live \u00b7 evening', 'live_evening', 'live'],
    ['Quiet day', 'quiet', 'live'],
    ['Champion out', 'champion_out', 'live'],
    ['Picks voided', 'picks_voided', 'live'],
    ['Finished', 'final', 'complete'],
    ['No data', 'no_data', 'pre'],
    ['Loading', null, null],
    ['Unexpected error', null, null]
  ];

  MR.screens['league-home'] = {
    states: CHECK_STATES.map(function (c) { return c[0]; }),
    render: function (state) {
      if (state === 'Loading') return U.PageSkeleton();
      if (state === 'Unexpected error') return MR.screens.errors.render('Unexpected error');

      var entry = CHECK_STATES.filter(function (c) { return c[0] === state; })[0];
      var check = D.CHECKS[entry[1]];
      var phase = entry[2];
      var league = D.SINGLE_LEAGUE;

      var standings =
        phase === 'complete' ? D.STANDINGS_COMPLETE :
        phase === 'live' ? D.STANDINGS_LIVE : D.STANDINGS_PRE;
      var locked = phase !== 'pre';

      var disclosure =
        state === 'No data' ? 'not_yet_settled' :
        state === 'Live \u00b7 now' ? 'settling_now' : 'current';

      var trPhase =
        phase === 'complete' ? 'complete' :
        phase === 'live' ? 'playing' :
        state === 'Draw pending' ? 'noDraw' : 'fillBracket';

      return Stack('4xl',
        h('header', { class: 'stack gap-md' },
          h('div', { class: 'row wrap between gap-md' },
            U.Eyebrow(league.format === 'season' ? 'Season league' : 'Single tournament'),
            U.MvpBadge('mvp')),
          h('h1', { class: 'f-display t-title1 c-primary', style: 'margin:0' }, league.name),
          h('p', { class: 'row wrap gap-md t-caption c-muted', style: 'margin:0' },
            h('span', { class: 'numeral' }, String(league.memberCount)), 'members',
            h('span', { 'aria-hidden': 'true' }, '\u00b7'),
            h('span', { class: 'numeral' }, String(league.tournamentCount)), 'tournament',
            h('span', { 'aria-hidden': 'true' }, '\u00b7'), h('span', null, 'Private'))),

        U.DailyCheckPanel(check, 'US Open', function (action) {
          if (action.href === '#/bracket') MR.go('bracket');
          else if (action.href === '#/result') MR.go('result');
          else U.toast('Invite link copied');
        }),

        // Draw-pending is the growth loop's primary surface for a third of the
        // launch window, so the invite is not buried in a commissioner panel.
        state === 'Draw pending'
          ? U.Section('Invite', Stack('md',
              P('One link. Anyone who opens it sees the league and can join in two taps.', 't-body c-secondary'),
              U.CopyInvite('https://matchreadtennis.com/join/8f3a2c9d41b7')))
          : null,

        U.Section(locked ? 'The race' : 'The field',
          Stack('lg',
            U.SettlementDisclosure(disclosure),
            state === 'No data'
              ? U.EmptyState('Nobody is in this field yet.',
                  'The moment somebody enters, this page starts moving.')
              : U.TournamentStandings(standings.slice(0, 5), locked)),
          h('a', {
            class: 'link t-caption', href: '#',
            onClick: function (e) { e.preventDefault(); MR.go('tournament-entry'); }
          }, 'All 12')),

        U.Section('Tournaments',
          h('ul', { class: 'stack gap-md', style: 'margin:0;padding:0;list-style:none' },
            U.TournamentRow(D.US_OPEN, {
              phase: trPhase, fieldSize: 12, submitted: locked ? 11 : 9,
              onClick: function (e) { e.preventDefault(); MR.go('tournament-entry'); }
            })))
      );
    }
  };

  MR.screens['league-standings'] = {
    states: ['Populated', 'Empty', 'Partially settled', 'Loading'],
    render: function (state) {
      if (state === 'Loading') return U.PageSkeleton();

      return Stack('3xl',
        U.PageHeader({
          eyebrow: 'Season standings', mvp: 'mvp', title: D.SEASON_LEAGUE.name,
          meta: [h('span', { class: 'numeral' }, '14'), 'members', h('span', { 'aria-hidden': 'true' }, '\u00b7'),
                 h('span', { class: 'numeral' }, '6 of 7 tournaments complete')]
        }),

        state === 'Partially settled' ? U.SettlementDisclosure('partially_settled') : null,

        state === 'Empty'
          ? U.EmptyState('The season table fills in as events finish.',
              'Add the next tournament and everyone in the league gets it the moment the draw lands.')
          : U.SeasonStandings(D.SEASON_STANDINGS),

        h('details', { class: 'panel' },
          h('summary', { class: 't-body c-primary', style: 'cursor:pointer' }, 'How points work'),
          h('p', { class: 't-body c-muted prose', style: 'margin:12px 0 0' },
            'Every tournament is worth up to 1,000 points, whatever its size \u2014 a perfect bracket at a 250 is worth exactly what a perfect bracket at a Slam is. You earn the share you read correctly. Points are awarded when an event finishes, not while it is being played.')),

        U.Section('The season',
          h('ul', { class: 'stack gap-md', style: 'margin:0;padding:0;list-style:none' },
            D.TOURNAMENTS.map(function (t, i) {
              return U.TournamentRow(t, {
                position: i + 1,
                phase: t.status === 'focus' ? 'fillBracket' : 'complete',
                fieldSize: 14, submitted: t.status === 'focus' ? 11 : 14,
                onClick: function (e) { e.preventDefault(); MR.go('tournament-entry'); }
              });
            })))
      );
    }
  };

  MR.screens.between = {
    states: ['Next draw known', 'Next draw unannounced', 'No calendar'],
    render: function (state) {
      var known = state === 'Next draw known';

      return Stack('4xl',
        U.PageHeader({ eyebrow: 'Between tournaments', mvp: 'mvp', title: D.SEASON_LEAGUE.name }),

        h('section', { class: 'stack gap-xl' },
          h('div', { class: 'row-top gap-lg' },
            h('span', { 'aria-hidden': 'true', class: 'check-rule check-rule--flat' }),
            h('div', null,
              U.Eyebrow('Between tournaments \u00b7 ' + (known ? 'US Open' : 'No event')),
              h('h2', { class: 'f-display t-display c-primary', style: 'margin:8px 0 0' },
                known ? 'US Open in 2 days.' : 'Your league is waiting, not finished.'),
              h('p', { class: 't-lead c-secondary prose', style: 'margin:12px 0 0' },
                known
                  ? 'The draw lands first. You will want to be here for it.'
                  : 'The next draw has not been announced. Your league is waiting, not finished.')))),

        state === 'No calendar'
          ? U.EmptyState('Nothing on the calendar yet.',
              'Add the next tournament and everyone in the league gets it the moment the draw lands.',
              U.Action('Add the next tournament', function () { U.toast('Tournament picker'); }, 'prominent'))
          : h('div', { style: 'display:grid;gap:32px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))' },
              U.Section('Last time out', Stack('sm',
                P('Ada Okafor won Cincinnati Open.'),
                h('a', { class: 'link t-caption', href: '#', onClick: function (e) { e.preventDefault(); MR.go('result'); } }, 'See the full result'))),
              U.Section('Your rivalry', Stack('sm',
                P('You lead Ada Okafor 4\u20132.'),
                P('The rivalry that actually matters in this league.', 't-caption c-muted'))),
              U.Section('Streak', Stack('sm',
                P('6 tournaments in a row entered.'),
                P('3 members joined since the last draw.', 't-caption c-muted'))),
              known ? U.Section('The next draw', Stack('sm',
                h('p', { class: 't-body c-secondary', style: 'margin:0' },
                  'The US Open draw locks in ', h('span', { class: 'numeral' }, '2 days'), '.'),
                h('p', { class: 't-caption c-muted', style: 'margin:0' },
                  'Locks ', U.LocalDeadline(D.LOCKS_AT, 'America/Los_Angeles', D.CLOCK.pre)))) : null),

        U.Section('Season table', U.SeasonStandings(D.SEASON_STANDINGS.slice(0, 5)),
          h('a', { class: 'link t-caption', href: '#', onClick: function (e) { e.preventDefault(); MR.go('league-standings'); } }, 'All 14 members'))
      );
    }
  };

  /* ===================================================================== */
  /* TOURNAMENT                                                             */
  /* ===================================================================== */

  var T_STATES = [
    'Pre \u00b7 draw not out', 'Pre \u00b7 entry open', 'Locked \u00b7 play not started',
    'Live', 'Postponed', 'Suspended', 'Cancelled', 'Complete',
    'Loading', 'Empty', 'Offline', 'Provider error', 'Settlement failed'
  ];

  MR.screens['tournament-entry'] = {
    states: T_STATES,
    render: function (state) {
      if (state === 'Loading') return U.PageSkeleton();

      var live = state === 'Live' || state === 'Provider error' || state === 'Offline' || state === 'Settlement failed';
      var complete = state === 'Complete';
      var locked = live || complete || state === 'Locked \u00b7 play not started';
      var now = complete ? D.CLOCK.complete : live ? D.CLOCK.live : D.CLOCK.pre;

      var standings = complete ? D.STANDINGS_COMPLETE : live ? D.STANDINGS_LIVE : D.STANDINGS_PRE;

      var disclosure =
        state === 'Settlement failed' ? 'settlement_failed' :
        state === 'Live' ? 'settling_now' :
        state === 'Locked \u00b7 play not started' ? 'not_yet_settled' : 'current';

      // Three disrupted states, each a different fact and each needing a
      // different sentence. None of these has a first-class representation in
      // apps/web today.
      var disrupted = null;
      if (state === 'Postponed') disrupted = ['Postponed', 'Play has not started. The draw is unchanged and your bracket is untouched. A new start time appears here when the organiser confirms one.'];
      if (state === 'Suspended') disrupted = ['Suspended', 'Play stopped mid-round. Completed matches are already scored; the rest resume where they left off. Nothing about your bracket changes.'];
      if (state === 'Cancelled') disrupted = ['Cancelled', 'This tournament will not be completed. Matches that finished are scored and stand. Picks in matches that were never played are void \u2014 not wrong \u2014 so the points came off every ceiling rather than off any score.'];

      var banner = null;
      if (state === 'Offline') banner = U.SysBanner('offline');
      if (state === 'Provider error') banner = U.SysBanner('provider_error');

      return Stack('3xl',
        banner,

        h('header', { class: 'stack gap-md' },
          h('div', { class: 'row wrap between gap-md' },
            U.Eyebrow(D.SINGLE_LEAGUE.name),
            U.MvpBadge('mvp')),
          h('div', { class: 'row wrap gap-md', style: 'align-items:baseline' },
            h('h1', { class: 'f-display t-title1 c-primary', style: 'margin:0' }, 'US Open'),
            live ? h('span', { class: 'chip chip--live' }, h('span', { class: 'live-dot' }), 'Live') : null,
            complete ? h('span', { class: 'chip' }, 'Final') : null),
          h('dl', { class: 'row wrap gap-3xl', style: 'margin:8px 0 0' },
            U.Field('Surface', 'Hard', false),
            U.Field('Draw', '128'),
            U.Field(locked ? 'Locked' : 'Locks',
              U.LocalDeadline(D.LOCKS_AT, 'America/Los_Angeles', now)),
            U.Field('Field', (locked ? '11' : '9') + ' of 12'))),

        disrupted
          ? h('div', { class: 'panel stack gap-sm', role: 'status' },
              U.Eyebrow(disrupted[0]),
              h('p', { class: 't-lead c-primary prose', style: 'margin:0' }, disrupted[1]))
          : null,

        // One control, three labels, chosen by state. The destination never
        // changes; only the promise does.
        h('div', { class: 'row wrap gap-md' },
          U.Action(
            locked ? 'View my bracket' : (state === 'Pre \u00b7 entry open' ? 'Review my bracket' : 'Open my bracket'),
            function () { MR.go('bracket', locked ? (complete ? 7 : 6) : 1); }, 'prominent'),
          !locked && state === 'Pre \u00b7 entry open'
            ? U.Action('Submit my bracket', function () { U.toast('Bracket submitted'); }, 'standard') : null,
          !locked && state === 'Pre \u00b7 entry open'
            ? U.Action('Withdraw my entry', function () {
                U.Dialog({
                  title: 'Withdraw your entry?',
                  detail: 'Your bracket is kept and you can submit it again any time before the draw locks. The league sees you as not yet in.',
                  confirmLabel: 'Withdraw', destructive: true,
                  onConfirm: function () { U.toast('Entry withdrawn'); }
                });
              }, 'standard', 'quiet') : null,
          complete
            ? U.Action('See the full result', function () { MR.go('result'); }, 'standard') : null),

        state === 'Pre \u00b7 draw not out'
          ? h('div', { class: 'panel stack gap-sm' },
              U.Eyebrow('What happens next'),
              h('p', { class: 't-lead c-primary prose', style: 'margin:0' },
                'The draw is released on Thursday 27 August. Every member of this league is already in the field \u2014 the bracket opens the moment it lands, and it locks at first ball on Sunday.'))
          : null,

        U.Section(locked ? 'The race' : 'The field',
          Stack('lg',
            U.SettlementDisclosure(disclosure),
            state === 'Empty'
              ? U.EmptyState('Nobody is in this field yet.', 'The moment somebody enters, this page starts moving.')
              : U.TournamentStandings(standings, locked)))
      );
    }
  };

  /* ===================================================================== */
  /* THE BRACKET                                                            */
  /* ===================================================================== */

  /*
     SCAFFOLDING, not product. A 128 draw rendered faithfully is about 6,000px
     tall, because a draw sheet is a tall object and the production component
     scrolls rather than scaling down. That is correct and it is also tiring to
     review, so this specification adds a starting-round control — styled in the
     charcoal spec vocabulary so it reads as apparatus. It does not exist in
     apps/web and must not be built.
  */
  var drawFrom = 0;

  var B_STATES = [
    'No pick', 'Partially filled', 'Complete \u00b7 unsubmitted', 'Saving', 'Save failed',
    'Submitted', 'Locked', 'Settled', 'Void', 'Loading', 'Offline'
  ];

  MR.screens.bracket = {
    states: B_STATES,
    render: function (state) {
      if (state === 'Loading') return U.PageSkeleton();

      var empty = state === 'No pick';
      var partial = state === 'Partially filled';
      var locked = state === 'Locked' || state === 'Settled' || state === 'Void';
      var settled = state === 'Settled' || state === 'Void';
      var showVoid = state === 'Void';

      // The picks. An empty bracket is resolved with a decider that never
      // decides, so every round past the first is genuinely unreached — the
      // em-dash state — rather than inheriting a filled bracket's participants.
      var bracket = empty
        ? D.resolve(function () { return null; })
        : partial ? D.PARTIAL_BRACKET : D.MY_BRACKET;

      var official = settled ? D.OFFICIAL.complete : null;
      var picked = empty ? 0 : partial ? 41 : D.TOTAL_MATCHES;

      var autosave =
        state === 'Saving' ? ['Saving your bracket', false] :
        state === 'Save failed' ? ['Your bracket did not save. Nothing has been lost \u2014 try again.', true] :
        state === 'Submitted' ? ['Bracket saved', false] :
        locked ? ['This bracket is locked.', false] :
        ['Changes save automatically', false];

      var championRef = settled
        ? D.MY_BRACKET.winners[D.ROUNDS.length - 1][0]
        : (partial || empty ? null : D.MY_BRACKET.winners[D.ROUNDS.length - 1][0]);

      return Stack('2xl',
        state === 'Offline' ? U.SysBanner('offline') : null,

        h('header', { class: 'stack gap-md' },
          h('div', { class: 'row wrap between gap-md' },
            U.Eyebrow(D.SINGLE_LEAGUE.name + ' \u00b7 US Open'),
            U.MvpBadge('mvp')),
          h('h1', { class: 'f-display t-title1 c-primary', style: 'margin:0' }, 'Your bracket')),

        h('div', { class: 'row wrap between gap-md' },
          h('p', { class: 't-body c-secondary', style: 'margin:0' },
            championRef
              ? MR.frag('Your champion: ', h('span', { class: 'f-medium c-primary' }, D.BY_REF[championRef].lastName))
              : 'Pick your way through to a champion.'),
          h('p', { class: 'numeral t-caption c-muted', style: 'margin:0' },
            picked + ' of ' + D.TOTAL_MATCHES + ' picks made')),

        // A status region, not a spinner. Text is what a screen reader gets and
        // it is also what a person reads fastest.
        h('p', { role: 'status', class: 't-caption ' + (autosave[1] ? 'c-miss' : 'c-muted'), style: 'margin:0' },
          autosave[0]),

        showVoid
          ? h('p', { class: 'disclosure', style: 'margin:0' },
              h('span', { class: 'disclosure-dot', 'aria-hidden': 'true' }),
              '1 pick on this bracket is void. Not wrong \u2014 void. The points came off your ceiling instead of your score.')
          : null,

        h('div', { class: 'staterail', style: 'position:static;margin:0 -16px 0' },
          h('span', { class: 'staterail-label' }, 'Spec view · start at'),
          h('div', { class: 'stategroup' },
            D.ROUNDS.slice(0, 5).map(function (r, i) {
              return h('button', {
                class: 'statebtn', 'aria-pressed': drawFrom === i ? 'true' : 'false',
                onClick: function () { drawFrom = i; MR.rerender(); }
              }, r.label.column);
            })),
          h('span', { class: 'staterail-label push' }, 'scaffolding — not in apps/web')),

        U.BracketGrid({
          fromRound: drawFrom,
          bracket: bracket,
          official: official,
          editable: !locked,
          locked: locked,
          showVoid: showVoid,
          onChoose: function () { U.toast('Pick recorded \u00b7 saving'); }
        }),

        !locked
          ? h('div', { class: 'row wrap gap-md' },
              U.Action(
                state === 'Submitted' ? 'Submitted' : 'Submit my bracket',
                function () {
                  U.Dialog({
                    title: 'Submit your bracket?',
                    detail: 'This enters you in Fourth Floor Slam Challenge. You can keep editing until the draw locks on Sunday at 11:00 \u2014 submitting now just tells the league you are in.',
                    confirmLabel: 'Submit',
                    onConfirm: function () { MR.go('bracket', 5); }
                  });
                },
                'prominent', null,
                { disabled: picked < D.TOTAL_MATCHES || state === 'Submitted' }),
              picked < D.TOTAL_MATCHES
                ? h('p', { class: 'hint', style: 'margin:0;align-self:center' },
                    (D.TOTAL_MATCHES - picked) + ' matches still need a pick before you can submit.')
                : null)
          : h('p', { class: 'hint', style: 'margin:0' },
              'The draw locked on Sunday 30 August at 11:00. After that the field is the field.')
      );
    }
  };

  /* ===================================================================== */
  /* RESULT ARTIFACT                                                        */
  /* ===================================================================== */

  MR.screens.result = {
    states: ['Placed (2nd)', 'Won', 'Not yet available', 'Loading'],
    render: function (state) {
      if (state === 'Loading') return U.PageSkeleton();

      if (state === 'Not yet available') {
        return h('div', { class: 'stack gap-2xl prose' },
          U.PageHeader({ eyebrow: 'Result', mvp: 'mvp', title: 'That result is not available.' }),
          P('A result page appears once a tournament has been scored and the league frozen. If this was your league, check back after the final.'),
          h('div', null, U.Action('Back to Fourth Floor Slam Challenge', function () { MR.go('league-home', 9); }, 'standard')));
      }

      var won = state === 'Won';
      var R = D.YOUR_RESULT;

      // The winning card borrows the member who actually won the fixture, so
      // both states are scored by the same rule against the same draw. Neither
      // number is chosen; a share card printing an impossible score is the one
      // bug on this screen that would travel outside the product.
      var top = D.STANDINGS_COMPLETE[0];
      var score = won ? top.score : R.score;
      var percent = Math.round((score / R.max) * 100);
      var champ = R.championName;

      var artifact = {
        tournamentName: 'US Open',
        headline: won
          ? D.MEMBERS[0].displayName + ' won ' + D.SINGLE_LEAGUE.name + '.'
          : R.position + 'nd of ' + R.of + ' in ' + D.SINGLE_LEAGUE.name + '.',
        placement: (won ? '1st' : R.position + 'nd') + ' of ' + R.of,
        score: score,
        championName: champ,
        championLine: R.calledChampion
          ? 'Called ' + champ + ' to win it. ' + champ + ' won it.'
          : 'Called ' + champ + '. It was not ' + champ + '.',
        scoreLine: score + ' of ' + R.max + ' \u2014 ' + percent + '% of a perfect bracket.',
        finishedOn: '2026-09-13',
        finishedLabel: '13 Sep 2026'
      };

      return Stack('3xl',
        U.PageHeader({ eyebrow: 'Result', mvp: 'mvp', title: 'US Open \u00b7 ' + D.SINGLE_LEAGUE.name }),
        U.ResultArtifact(artifact),
        h('div', { class: 'row wrap gap-md' },
          U.Action('Copy share text', function () { U.toast('Copied'); }, 'standard'),
          U.Action('Download image', function () {}, 'standard', null, { disabled: true }),
          U.Action('Back to the league', function () { MR.go('league-home', 9); }, 'standard', 'quiet')),
        h('p', { class: 'hint prose', style: 'margin:0' },
          'This page is visible to everyone in your league and to nobody outside it. Sharing it further is a screenshot, deliberately \u2014 a public link would need a read path that bypasses the league\u2019s own privacy.')
      );
    }
  };

  /* ===================================================================== */
  /* PUBLIC REFERENCE                                                       */
  /* ===================================================================== */

  MR.screens.tournaments = {
    states: ['Populated', 'Empty', 'Loading'],
    render: function (state) {
      if (state === 'Loading') return U.PageSkeleton();
      return Stack('2xl',
        U.PageHeader({ eyebrow: 'All tournaments', mvp: 'mvp', title: 'Tournaments' }),
        state === 'Empty'
          ? U.EmptyState('No tournaments yet',
              'The calendar fills as the season is confirmed. Check back \u2014 or start a league now and add an event when the draw lands.')
          : h('ul', { class: 'stack gap-md', style: 'margin:0;padding:0;list-style:none' },
              D.TOURNAMENTS.map(function (t) {
                return U.TournamentRow(t, {
                  phase: t.status === 'focus' ? 'noDraw' : 'complete',
                  onClick: function (e) { e.preventDefault(); U.toast('/tournaments/' + t.ref); }
                });
              })));
    }
  };

  MR.screens.players = {
    states: ['Populated', 'Empty', 'Loading'],
    render: function (state) {
      if (state === 'Loading') return U.PageSkeleton();
      if (state === 'Empty') {
        return Stack('2xl',
          U.PageHeader({ eyebrow: 'Rankings', mvp: 'mvp', title: 'Players' }),
          U.EmptyState('No players yet', 'Rankings appear once the first tournament of the season has been imported.'));
      }
      return Stack('2xl',
        U.PageHeader({ eyebrow: 'Rankings', mvp: 'mvp', title: 'Players' }),
        h('table', { class: 'table' },
          h('caption', { class: 'sr-only' }, 'Rankings'),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col', class: 'eyebrow', style: 'width:32px' }, '#'),
            h('th', { scope: 'col', class: 'eyebrow' }, 'Player'),
            h('th', { scope: 'col', class: 'eyebrow' }, 'Tour'),
            h('th', { scope: 'col', class: 'eyebrow right' }, 'Points'))),
          h('tbody', null, D.RANKED.slice(0, 20).map(function (p) {
            return h('tr', null,
              h('td', { class: 'numeral t-caption c-muted' }, String(p.rank)),
              h('td', null, U.PlayerChip({ lastName: p.lastName, countryCode: p.countryCode, seed: null }, { strong: true })),
              h('td', { class: 'numeral t-caption c-muted', style: 'text-transform:uppercase' }, p.tour),
              h('td', { class: 'numeral t-body c-primary right' }, p.points.toLocaleString('en-GB')));
          }))));
    }
  };

  /* ===================================================================== */
  /* SYSTEM                                                                 */
  /* ===================================================================== */

  MR.screens.settings = {
    states: ['Signed in', 'Saving'],
    render: function (state) {
      return h('div', { class: 'stack gap-3xl prose' },
        U.PageHeader({
          eyebrow: 'Settings', mvp: 'mvp', title: 'Language and time',
          lead: 'Two preferences, both of which change how the product reads. There is no settings page in apps/web today \u2014 the language control lives in the header and the time zone follows the browser.'
        }),
        h('div', { class: 'stack gap-md' },
          h('label', { class: 'field-label t-caption c-secondary', for: 'lang' }, 'Language'),
          h('select', { class: 'input select', id: 'lang' },
            h('option', null, 'English'), h('option', null, 'Espa\u00f1ol'), h('option', null, '\u65e5\u672c\u8a9e')),
          h('p', { class: 'hint', style: 'margin:0' },
            '427 keys, complete in all three. The build fails rather than shipping a half-translated page.')),
        h('div', { class: 'stack gap-md' },
          h('label', { class: 'field-label t-caption c-secondary', for: 'tz2' }, 'Time zone'),
          h('select', { class: 'input select', id: 'tz2' },
            h('option', null, 'America/Los_Angeles'), h('option', null, 'America/New_York'), h('option', null, 'Asia/Tokyo')),
          h('p', { class: 'hint', style: 'margin:0' },
            'Every start time and every lock is rendered in this zone, with the venue clock as a footnote when they differ.')),
        h('hr', { class: 'rule' }),
        h('div', null, U.Action('Sign out', function () { MR.go('landing'); }, 'standard')));
    }
  };

  MR.screens.notifications = {
    states: ['Not connected'],
    render: function () {
      return h('div', { class: 'stack gap-2xl prose' },
        U.PageHeader({
          eyebrow: 'Notifications', mvp: 'post', title: 'Deliberately not connected',
          lead: 'Notification composition and delivery classification are built in packages/core and have been since migration 0013. Nothing invokes them, on purpose.'
        }),
        h('div', { class: 'panel stack gap-md' },
          U.Eyebrow('The bet'),
          P('The Daily Check is a pull habit by choice. The product\u2019s wager is that \u201cI wonder what happened in my league today\u201d is a stronger reason to return than a push telling you \u2014 and that a budgeted channel nobody has operated is a way to be paged at 3am for something the launch does not need.'),
          h('hr', { class: 'rule' }),
          P('If it is ever connected: at most one message a day, and only when something actually moved. ADR-0013 is the budget; ADR-0015 is the delivery and failure classification.', 't-caption c-muted')),
        U.EmptyState('Nothing to configure yet',
          'When notifications ship, this is where you choose what is worth interrupting you for. Until then, your league page is the whole channel.'));
    }
  };

  MR.screens.errors = {
    states: ['Not found', 'Unexpected error', 'Global error'],
    render: function (state) {
      if (state === 'Not found') {
        return h('div', { class: 'stack gap-2xl prose', style: 'padding:40px 0' },
          U.PageHeader({ eyebrow: 'Not found', mvp: 'mvp', title: 'There\u2019s nothing at this address', large: true }),
          P('The tournament, player, or league you followed here doesn\u2019t exist, or the link has changed.'),
          h('div', { class: 'row wrap gap-md' },
            U.Action('Browse tournaments', function () { MR.go('tournaments'); }, 'prominent'),
            U.Action('Go to MatchRead', function () { MR.go('landing'); }, 'standard', 'quiet')),
          // No "try again": retrying a URL that does not exist is not a recovery.
          h('p', { class: 'hint', style: 'margin:0' },
            'There is no retry here on purpose \u2014 this address will not start working.'));
      }

      var global = state === 'Global error';
      return h('div', { class: 'stack gap-2xl prose', style: 'padding:40px 0' },
        U.PageHeader({
          eyebrow: 'Error', mvp: 'mvp',
          title: global ? 'MatchRead could not load' : 'This page didn\u2019t load', large: true
        }),
        P(global
          ? 'Something failed before the application could start. Your bracket and league data are not affected \u2014 nothing on this screen has touched them.'
          : 'Something on our side failed while building this page. Your bracket and league data are not affected.'),
        h('p', { class: 't-caption c-muted', style: 'margin:0' },
          'Reference ', h('code', { class: 'numeral' }, 'e-7f3a2c9d')),
        h('div', { class: 'row wrap gap-md' },
          U.Action('Try again', function () { MR.go('landing'); }, 'prominent'),
          U.Action('Go to MatchRead', function () { MR.go('landing'); }, 'standard', 'quiet')),
        h('p', { class: 'hint', style: 'margin:0' },
          global
            ? 'On the global boundary this is a raw anchor rather than a router link \u2014 the one place in the app where a hand-written anchor is correct, because the router may itself be broken.'
            : 'Quote the reference if you report this. It is the only thing that makes a support message actionable today: apps/web reports no exceptions anywhere.'));
    }
  };

  MR.screens['system-states'] = {
    states: ['Loading', 'Empty', 'Offline', 'Provider error'],
    render: function (state) {
      var body;
      if (state === 'Loading') body = U.PageSkeleton();
      else if (state === 'Empty') body = U.EmptyState('Nobody is in this field yet.', 'The moment somebody enters, this page starts moving.');
      else body = Stack('lg',
        U.SysBanner(state === 'Offline' ? 'offline' : 'provider_error'),
        U.TournamentStandings(D.STANDINGS_LIVE.slice(0, 6), true));

      return Stack('2xl',
        U.PageHeader({
          eyebrow: 'Cross-cutting', mvp: 'mvp', title: 'System states',
          lead: 'The four conditions every data-bearing screen must survive. Specified once here rather than re-specified on every screen.'
        }),
        body,
        h('p', { class: 'hint prose', style: 'margin:0' },
          state === 'Provider error'
            ? 'Until the ingestion listener exists, this is the normal state: results arrive only through the REST reconciliation sweep, so scores lag by the sweep interval instead of arriving live.'
            : state === 'Offline'
            ? 'The bracket stays editable offline and edits queue. Losing twenty minutes of entry to a dropped connection at 10:47 on lock day is the failure this design exists to prevent.'
            : 'A skeleton of the page\u2019s own shape, never a spinner. A spinner says \u201cwait\u201d; a skeleton says \u201cthis is what is arriving\u201d.'));
    }
  };

  /* ===================================================================== */
  /* OPERATOR                                                               */
  /* ===================================================================== */

  MR.screens.founder = {
    states: ['Healthy', 'Watch', 'Needs attention', 'Replay data mixed in'],
    render: function (state) {
      var health = state === 'Needs attention' ? 'bad' : state === 'Watch' ? 'watch' : 'good';
      var LABEL = { good: 'Healthy', watch: 'Watch', bad: 'Needs attention' };

      function tile(group, label, value, note, s) {
        var color = s === 'bad' ? 'var(--mr-miss)' : s === 'watch' ? 'var(--mr-line-control)' : 'var(--mr-data)';
        return h('div', { class: 'stack gap-sm', style: 'border-left:3px solid ' + color + ';padding-left:16px' },
          U.Eyebrow(group),
          h('p', { class: 't-caption c-secondary', style: 'margin:0' }, label),
          h('p', { class: 'numeral t-title1 c-primary', style: 'margin:0' }, value),
          h('p', { class: 't-caption c-muted', style: 'margin:0' }, note),
          // The colour is aria-hidden; the state word is what carries health.
          h('span', { class: 'sr-only' }, label + ': ' + LABEL[s]));
      }

      return Stack('3xl',
        h('div', { class: 'row wrap between gap-md' },
          U.PageHeader({ eyebrow: 'Last 24 hours', mvp: 'mvp', title: 'Operations' }),
          state === 'Replay data mixed in'
            ? h('span', { class: 'chip' }, 'Replay data')
            : h('span', { class: 'chip' }, 'Production')),

        state === 'Replay data mixed in'
          ? h('p', { class: 'disclosure', style: 'margin:0' },
              h('span', { class: 'disclosure-dot', 'aria-hidden': 'true' }),
              'Replay data is mixed in. A rehearsal tournament is currently in play, so the figures below are not production-only.')
          : null,

        h('div', { style: 'display:grid;gap:32px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))' },
          tile('People', 'Members', '148', '+12 in the last day', 'good'),
          tile('Playing', 'Brackets submitted', '119', 'across 14 leagues', 'good'),
          tile('Settlement', 'Last settlement pass', health === 'bad' ? 'failed' : '18m ago', health === 'bad' ? 'runbook 04' : 'on schedule', health),
          tile('Machinery', 'Provider freshness', health === 'good' ? '42s' : '11m', health === 'good' ? 'socket live' : 'REST sweep only', health === 'good' ? 'good' : 'watch'),
          tile('The Daily Check', 'Checks computed', '132', '89% of members', 'good'),
          tile('Disruption', 'Draw changes', '1', '1 in the last day', 'good'),
          tile('Readiness', 'Translation coverage', '100%', '3 locales offered', 'good'),
          tile('Readiness', 'Known blockers', health === 'bad' ? '2' : '0', health === 'bad' ? 'settlement, listener' : 'None recorded', health)),

        U.Section('Errors',
          health === 'bad'
            ? h('ul', { class: 'stack gap-sm', style: 'margin:0;padding-left:18px' },
                h('li', { class: 't-body c-secondary' }, 'settle-tournament: timed out after 30s \u2014 runbook 04'),
                h('li', { class: 't-body c-secondary' }, 'ingest-events: 3 rejected payloads \u2014 runbook 09'))
            : P('Nothing has failed in the last 24 hours.', 't-body c-muted')),

        h('div', null, U.Action('Draw changes', function () { MR.go('disruption'); }, 'standard')));
    }
  };

  MR.screens.disruption = {
    states: ['Choosing', 'Previewed', 'Applied', 'Refused', 'Draw complete'],
    render: function (state) {
      if (state === 'Draw complete') {
        return Stack('2xl',
          U.PageHeader({ eyebrow: 'Draw changes', mvp: 'mvp', title: 'This tournament is over' }),
          h('div', { class: 'panel' },
            P('The draw is complete, so a replacement would change nothing \u2014 every match has already been played and scored. The seats below are read-only.')),
          h('div', null, U.Action('Back to operations', function () { MR.go('founder'); }, 'standard')));
      }

      var applied = state === 'Applied';
      var refused = state === 'Refused';
      var previewed = state === 'Previewed' || applied;

      return Stack('3xl',
        U.PageHeader({
          eyebrow: 'Operator', mvp: 'mvp', title: 'Draw changes',
          lead: 'Replace a player who has withdrawn from a published draw. Every change is previewed first, and nothing is applied until you confirm.'
        }),

        h('div', { class: 'stack gap-lg prose' },
          h('div', { class: 'stack gap-md' },
            h('label', { class: 'field-label t-caption c-secondary', for: 'd1' }, 'Which tournament'),
            h('select', { class: 'input select', id: 'd1' }, h('option', null, 'US Open \u2014 draw published'))),
          h('div', { class: 'stack gap-md' },
            h('label', { class: 'field-label t-caption c-secondary', for: 'd2' }, 'Who has withdrawn'),
            h('select', { class: 'input select', id: 'd2' },
              h('option', null, 'Seat 8 \u00b7 ' + D.VOIDED.playerName + ' \u2014 not played yet'))),
          h('div', { class: 'stack gap-md' },
            h('label', { class: 'field-label t-caption c-secondary', for: 'd3' }, 'Who takes the seat'),
            h('input', { class: 'input', id: 'd3', placeholder: 'Surname', value: previewed ? 'Quesnel' : '' }),
            h('p', { class: 'hint', style: 'margin:0' },
              'Search by name. Only players not already in this draw can be offered a seat.')),
          h('div', { class: 'stack gap-md' },
            h('label', { class: 'field-label t-caption c-secondary', for: 'd4' }, 'Why is this happening?'),
            h('textarea', { class: 'input', id: 'd4', rows: '3', style: 'padding:12px;min-height:88px' },
              previewed ? 'Withdrew before first ball with a left wrist injury; confirmed by the tournament office at 09:14 ET.' : ''),
            h('p', { class: 'hint', style: 'margin:0' },
              'Recorded permanently against this change. Write what you would want to read in six months.'))),

        refused
          ? h('div', { class: 'panel stack gap-sm', role: 'alert', style: 'border-color:var(--mr-miss)' },
              U.Eyebrow('This cannot be applied'),
              P('That player already holds another seat in this draw. A player cannot appear twice \u2014 brackets built on a duplicated name cannot be scored.'))
          : null,

        previewed
          ? h('div', { class: 'panel stack gap-lg' },
              U.Eyebrow('What will happen'),
              h('dl', { class: 'row wrap gap-3xl', style: 'margin:0' },
                U.Field('Leaving the draw', D.VOIDED.playerName, false),
                U.Field('Taking the seat', 'Quesnel', false),
                U.Field('Brackets', 'Locked', false),
                U.Field('Members affected', '4'),
                U.Field('Brackets affected', '4'),
                U.Field('Picks voided', '4')),
              h('hr', { class: 'rule' }),
              // The consequence in the operator's language, never the mechanism.
              P('Brackets are locked and this player never played a match, so nobody could have read the result. Their affected picks become void rather than wrong: the points come off each member\u2019s ceiling instead of their score, and their standing does not fall.'))
          : null,

        applied
          ? h('div', { class: 'panel stack gap-md', role: 'status' },
              U.Eyebrow('Applied'),
              h('dl', { class: 'row wrap gap-3xl', style: 'margin:0' },
                U.Field('Leagues affected', '2'),
                U.Field('Brackets adjusted', '4'),
                U.Field('Picks voided', '4')),
              P('The next Daily Check each affected member opens explains what happened to their bracket. Affected brackets are queued for rescoring; standings update on the next settlement pass.', 't-caption c-muted'),
              P('Recorded as change dsr_9f21c4', 't-caption c-muted'))
          : null,

        h('div', { class: 'row wrap gap-md' },
          U.Action('Preview this change', function () { MR.go('disruption', 1); }, 'standard'),
          U.Action('Apply this change', function () {
            U.Dialog({
              title: 'Apply this change?',
              detail: 'This cannot be undone from here. 4 brackets change and 4 picks are voided.',
              confirmLabel: 'Apply this change', destructive: true,
              cancelLabel: 'Go back',
              onConfirm: function () { MR.go('disruption', 2); }
            });
          }, 'prominent', null, { disabled: !previewed || applied })),

        h('p', { class: 'hint prose', style: 'margin:0' },
          'No motion anywhere in this flow. An irreversible action should never feel fast.'));
    }
  };

  /* ===================================================================== */
  /* SHOWCASE                                                               */
  /* ===================================================================== */

  MR.screens.showcase = {
    states: ['Static'],
    render: function () {
      function demo(title, note, node) {
        return h('section', { class: 'stack gap-md' },
          U.Eyebrow(title),
          node,
          h('p', { class: 'hint prose', style: 'margin:0' }, note));
      }

      return Stack('4xl',
        U.PageHeader({
          eyebrow: 'Design system', mvp: 'mvp', title: 'Showcase',
          lead: 'Real components in their real states. In production this page is typed against the production projections, so if a projection changes shape the showcase stops compiling and someone has to decide what the new shape means.'
        }),

        demo('Colour \u2014 the two that mean things',
          'The read is charcoal: a claim a person made. The data is Tournament Green: verified fact in the system\u2019s own voice. Nothing else on a page is saturated, which is what makes green mean something when it appears.',
          h('div', { class: 'row wrap gap-lg' },
            ['read #15181B', 'data #0A6B42', 'miss #C93F36', 'clay', 'grass', 'hard', 'indoor'].map(function (label, i) {
              var vars = ['--mr-read', '--mr-data', '--mr-miss', '--mr-court-clay', '--mr-court-grass', '--mr-court-hard', '--mr-court-indoor'];
              return h('div', { class: 'stack gap-sm' },
                h('div', { style: 'width:92px;height:52px;border-radius:var(--r-md);background:var(' + vars[i] + ')' }),
                h('span', { class: 'eyebrow' }, label));
            }))),

        demo('Type \u2014 the ramp',
          'Nine sizes. A ramp, not a spectrum \u2014 few enough that two headings on different screens are the same size. Every number is monospaced and tabular, without exception.',
          h('div', { class: 'stack gap-sm' },
            [['t-hero', 'Hero'], ['t-display', 'Display'], ['t-title1', 'Title 1'], ['t-title2', 'Title 2'],
             ['t-title3', 'Title 3'], ['t-lead', 'Lead'], ['t-body', 'Body'], ['t-caption', 'Caption']].map(function (r) {
              return h('div', { class: 'row-base gap-lg' },
                h('span', { class: 'eyebrow', style: 'width:72px' }, r[0].slice(2)),
                h('span', { class: r[0] + ' f-display c-primary' }, r[1] + ' \u00b7 0123456789'));
            }),
            h('div', { class: 'row-base gap-lg' },
              h('span', { class: 'eyebrow', style: 'width:72px' }, 'eyebrow'),
              h('span', { class: 'eyebrow' }, 'First round')))),

        demo('Actions',
          'tone answers how loud; size answers how much room. The primary button is charcoal, never green \u2014 a green button would be telling the user the button is a verified result.',
          h('div', { class: 'row wrap gap-md' },
            U.Action('Start a league', function () {}, 'prominent'),
            U.Action('Open my bracket', function () {}, 'standard'),
            U.Action('EN', function () {}, 'compact'),
            U.Action('See all', function () {}, 'standard', 'quiet'),
            U.Action('Disabled', function () {}, 'standard', null, { disabled: true }))),

        demo('The slot \u2014 every bracket state',
          'Ink for a claim; green when it comes true; red when it does not; dashed and colourless for a void, because a void is neither a fact nor a miss.',
          h('div', { style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))' },
            [
              ['Unpicked', { chosen: null, settledWinner: null }],
              ['Picked, unsettled', { chosen: 'p-0', settledWinner: null }],
              ['Correct', { chosen: 'p-0', settledWinner: 'p-0' }],
              ['Incorrect', { chosen: 'p-0', settledWinner: 'p-1' }]
            ].map(function (c) {
              return h('div', { class: 'stack gap-sm' },
                U.Slot(D.SEATS[0], D.SEATS[1], {
                  chosen: c[1].chosen, settledWinner: c[1].settledWinner,
                  voided: null, editable: false, onChoose: function () {}, label: c[0]
                }),
                h('span', { class: 'eyebrow' }, c[0]));
            }),
            h('div', { class: 'stack gap-sm' },
              U.Slot(D.SEATS[6], D.SEATS[7], {
                chosen: 'p-7', settledWinner: null, voided: true,
                editable: false, onChoose: function () {}, label: 'Void'
              }),
              h('span', { class: 'eyebrow' }, 'Void')),
            h('div', { class: 'stack gap-sm' },
              U.Slot(null, D.SEATS[9], {
                chosen: null, settledWinner: null, voided: null,
                editable: false, onChoose: function () {}, label: 'Not yet reached'
              }),
              h('span', { class: 'eyebrow' }, 'Not yet reached / bye')))),

        demo('Standings',
          'Before the lock this table says who has committed and nothing about what they picked. That distinction is enforced in Postgres, and this is the surface it exists for.',
          h('div', { style: 'display:grid;gap:32px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))' },
            h('div', { class: 'stack gap-sm' }, h('span', { class: 'eyebrow' }, 'Before lock'),
              U.TournamentStandings(D.STANDINGS_PRE.slice(0, 4), false)),
            h('div', { class: 'stack gap-sm' }, h('span', { class: 'eyebrow' }, 'After lock'),
              U.TournamentStandings(D.STANDINGS_LIVE.slice(0, 4), true)))),

        demo('Feedback',
          'Every disclosure names its own state. A generic \u201cmay be out of date\u201d asks the reader to guess whether to wait or to worry.',
          h('div', { class: 'stack gap-md' },
            U.SettlementDisclosure('settling_now'),
            U.SettlementDisclosure('settlement_failed'),
            U.SysBanner('provider_error'),
            U.EmptyState('No leagues yet', 'Start one for a single tournament, or for a whole season.'))));
    }
  };
})();
