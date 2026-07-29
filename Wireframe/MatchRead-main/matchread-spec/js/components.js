/* =========================================================================
   components.js — the design system.
   -------------------------------------------------------------------------
   The brief's highest-leverage instruction: build the prototype using the
   component hierarchy the production application should use. A Match Card that
   appears on six screens is implemented ONCE, here, and imported six times.

   Every component below names the .tsx file it specifies. Where a component
   does not exist in apps/web yet, it says so and the spec entry classifies it
   as Needs Engineering.
   ========================================================================= */

(function () {
  'use strict';

  var h = MR.h;
  var D = MR.data;

  /* ==================================================================== */
  /* PRIMITIVES                        apps/web/components/shared/primitives.tsx */
  /* ==================================================================== */

  /**
   * Eyebrow — a small, letterspaced, monospaced label naming what a block of
   * data is. Borrowed from the printed draw sheet where "FIRST ROUND" sits
   * above a column of names. This is how the product separates sections:
   * instead of a border, a card, or a background.
   */
  function Eyebrow(text, id) {
    return h('p', { class: 'eyebrow', id: id || null }, text);
  }

  /**
   * Field — a labelled value. The label is prose, the value is numeric and
   * monospaced. `<dl>` so a screen reader announces "Draw size, 128" as a pair.
   */
  function Field(label, value, numeral) {
    return h('div', { class: 'stack gap-xs' },
      h('dt', { class: 'eyebrow' }, label),
      h('dd', { class: (numeral === false ? '' : 'numeral ') + 't-title3 c-primary', style: 'margin:0' }, value)
    );
  }

  function FieldList(fields) {
    return h('dl', { class: 'row wrap gap-3xl', style: 'margin:0' }, fields);
  }

  /**
   * EmptyState — an empty screen is an invitation to act, not an apology. It
   * names what is missing and what happens next, and it never says "no data".
   */
  function EmptyState(title, detail, action) {
    return h('div', { class: 'empty' },
      h('p', { class: 'f-display t-title2 c-primary', style: 'margin:0' }, title),
      h('p', { class: 't-body c-muted prose', style: 'margin:8px auto 0' }, detail),
      action ? h('div', { style: 'margin-top:20px' }, action) : null
    );
  }

  /**
   * SettlementDisclosure — never show stale standings as current without saying
   * so. Wording is per state rather than a generic "may be out of date", because
   * "we are still counting" and "the last attempt failed" ask different things
   * of the reader. Sourced from `draw_settlement_health` (migration 0012).
   */
  var SETTLEMENT_COPY = {
    not_yet_settled: 'Results have not been scored yet. Standings appear once play begins.',
    settling_now: 'Scoring in progress. These standings are still moving.',
    partially_settled: 'Some brackets are not scored yet. These standings are incomplete.',
    settlement_failed: 'The last scoring run did not finish. These standings may be out of date.'
  };

  function SettlementDisclosure(state) {
    if (!state || state === 'current') return null;
    var urgent = state === 'settlement_failed' || state === 'partially_settled';
    return h('p', {
      // role=status, not alert: information a user should receive, not an
      // interruption that should cut across what they are doing.
      role: 'status',
      class: ['disclosure', urgent ? 'disclosure--urgent' : ''],
      style: 'margin:0'
    },
      h('span', { class: 'disclosure-dot', 'aria-hidden': 'true' }),
      SETTLEMENT_COPY[state]
    );
  }

  /**
   * Country — a three-letter code set in the numeral face. Deliberately not a
   * flag emoji: flag rendering is inconsistent across platforms, and a code is
   * what a draw sheet actually prints.
   */
  function Country(code) {
    return h('span', {
      class: 'numeral t-caption c-muted', style: 'text-transform:uppercase',
      'aria-label': 'Country: ' + code
    }, code);
  }

  /* -------------------------------------------------------------- time ---- */
  /* Formatted against an explicit zone. There is no default zone anywhere in
     this product, because a default is how a surface silently renders UTC to
     somebody in Sydney — and the failure it causes is a member in California
     reading a New York lock time and missing the tournament. */

  var DAY_MS = 86400000;

  function clock(iso, zone) {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: zone
    });
  }

  function dayName(iso, zone) {
    return new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: zone
    });
  }

  function dayOffset(iso, nowIso, zone) {
    var f = function (d) { return new Date(d).toLocaleDateString('en-CA', { timeZone: zone }); };
    var a = new Date(f(iso) + 'T00:00:00Z').getTime();
    var b = new Date(f(nowIso) + 'T00:00:00Z').getTime();
    return Math.round((a - b) / DAY_MS);
  }

  /** LocalTime — an instant, in the viewer's own clock. */
  function LocalTime(iso, zone, nowIso, venueZone) {
    var offset = dayOffset(iso, nowIso, zone);
    var t = clock(iso, zone);
    var primary =
      offset === 0 ? 'Today ' + t :
      offset === 1 ? 'Tomorrow ' + t :
      offset === -1 ? 'Yesterday ' + t :
      dayName(iso, zone) + ', ' + t;

    var venue = null;
    if (venueZone && venueZone !== zone && clock(iso, venueZone) !== t) {
      venue = clock(iso, venueZone) + ' at the venue';
    }

    return h('time', { datetime: iso, class: 'numeral' },
      primary,
      venue ? h('span', { class: 't-caption c-muted', style: 'margin-left:8px' }, '· ' + venue) : null
    );
  }

  /** LocalDeadline — a lock. Always gets the day word, never a bare clock time. */
  function LocalDeadline(iso, zone, nowIso) {
    var offset = dayOffset(iso, nowIso, zone);
    var t = clock(iso, zone);
    var text =
      offset === 0 ? 'Today ' + t :
      offset === 1 ? 'Tomorrow ' + t :
      dayName(iso, zone) + ', ' + t;
    return h('time', { datetime: iso, class: 'numeral' }, text);
  }

  /** Countdown, said the way a person would say it. */
  function countdown(toIso, fromIso) {
    var ms = new Date(toIso) - new Date(fromIso);
    if (ms <= 0) return null;
    var mins = Math.round(ms / 60000);
    if (mins < 60) return mins + (mins === 1 ? ' minute' : ' minutes');
    var hours = Math.round(mins / 60);
    if (hours < 48) return hours + (hours === 1 ? ' hour' : ' hours');
    var days = Math.round(hours / 24);
    return days + (days === 1 ? ' day' : ' days');
  }

  /* ==================================================================== */
  /* ACTIONS                             apps/web/components/shared/actions.tsx */
  /* ==================================================================== */
  /*
     tone answers "how loud", size answers "how much room". Kept separate
     because folding them into one `variant` prop is how a design system ends up
     with `primarySmallInverted` and nobody able to say what the difference is.

       prominent — the one thing this screen exists to make you do. Max one.
       standard  — a real action that is not the point of the screen.
       compact   — an action inside a dense row or a header.

     Every size keeps the 44px target. Only the padding shrinks.
  */

  var IMPLIED = { prominent: 'prominent', standard: 'standard', compact: 'standard' };

  function actionClass(size, tone, extra) {
    size = size || 'standard';
    return ['act', 'act--' + size + '-size', 'act--' + (tone || IMPLIED[size]), extra].filter(Boolean).join(' ');
  }

  /** A navigation action. A link, because the result is a different URL. */
  function ActionLink(label, href, size, tone) {
    return h('a', { class: actionClass(size, tone), href: href || '#' }, label);
  }

  /** A state-changing action. A button, because nothing navigates. */
  function Action(label, onClick, size, tone, opts) {
    opts = opts || {};
    return h('button', {
      type: 'button',
      class: actionClass(size, tone, opts.class),
      disabled: opts.disabled || false,
      'aria-disabled': opts.disabled ? 'true' : null,
      onClick: opts.disabled ? null : onClick
    }, label);
  }

  /* ==================================================================== */
  /* THE MVP BADGE                                       spec layer, not product */
  /* ==================================================================== */

  var MVP_LABEL = { mvp: 'Launch MVP', post: 'Post launch', explor: 'Visual exploration' };

  function MvpBadge(kind) {
    return h('span', { class: 'mvp mvp--' + kind }, MVP_LABEL[kind]);
  }

  /* ==================================================================== */
  /* PLAYER CHIP                                       new — Needs Engineering */
  /* ==================================================================== */
  /*
     The seed / surname / country triple. It appears in the bracket, the draw
     list, the rankings table and the operator seat list — four places that each
     hand-rolled it in apps/web today. Extracting it is in KNOWN_WEAKNESSES; the
     prototype does it once so the shape of the fix is visible.
  */
  function PlayerChip(seat, opts) {
    opts = opts || {};
    if (!seat) return h('span', { class: 'c-muted t-caption' }, '—');
    return h('span', { class: 'row gap-sm', style: 'min-width:0' },
      seat.seed
        ? h('span', { class: 'numeral name-seed' },
            h('span', { 'aria-hidden': 'true' }, String(seat.seed)),
            h('span', { class: 'sr-only' }, 'Seed ' + seat.seed))
        : h('span', { class: 'numeral name-seed', 'aria-hidden': 'true' }),
      h('span', { class: 't-body ' + (opts.strong ? 'c-primary f-medium' : 'c-secondary') }, seat.lastName),
      seat.countryCode ? Country(seat.countryCode) : null
    );
  }

  /* ==================================================================== */
  /* THE BRACKET                    apps/web/components/leagues/BracketEditor.tsx */
  /* ==================================================================== */
  /*
     MatchRead's signature screen, and the reason it is a tournament tree and
     not a table: rounds are columns, each slot holds two names, and picking one
     sends it forward.

     ## Colour is meaning, and it arrives late

     A slot you have picked is set in ink. It does not turn green for being
     chosen, because choosing is a claim and not a result. When the tournament
     rules on it, it turns green or red. That moment — colour arriving on a name
     you committed to days ago — is the emotional payload of the whole product,
     and spending green on the act of clicking would spend it before it means
     anything.

     ## Three empty states, because they are three different facts

       bye      a real seat with no player
       em dash  a position nobody has reached yet
       unpicked an occupied slot with no commitment
  */

  /** One name inside a slot. */
  function Name(seat, ctx) {
    // A position nobody has reached yet. The dash is decoration; the words are
    // what a screen reader gets.
    if (!seat) {
      return h('span', { class: 'name name--empty' },
        h('span', { class: 'name-text', 'aria-hidden': 'true' }, '—'),
        h('span', { class: 'sr-only' }, 'Not yet played'));
    }
    if (seat.bye) {
      return h('span', { class: 'name name--bye' }, h('span', { class: 'name-text' }, 'Bye'));
    }

    var isChosen = ctx.chosen === seat.ref;
    var modifier = '';
    var state = null;

    if (ctx.voided && isChosen) {
      // Void outranks every other state, including a settled result: a player
      // can win round one and withdraw before round two, and in that case the
      // later slot is void while the earlier one is not. Checking void first is
      // what stops a member being shown "incorrect" for a match struck from the
      // draw.
      modifier = 'name--voided';
      state = 'Void';
    } else if (ctx.settledWinner && isChosen) {
      var correct = ctx.settledWinner === seat.ref;
      modifier = correct ? 'name--correct' : 'name--incorrect';
      state = correct ? 'Correct' : 'Incorrect';
    } else if (isChosen) {
      modifier = 'name--chosen';
      // "Still alive" rather than "picked": aria-checked already says it is the
      // pick, and what the reader does not know is whether the tournament has
      // had its say.
      state = ctx.settledWinner ? null : 'Still alive';
    }

    var content = [
      seat.seed
        ? h('span', { class: 'numeral name-seed' },
            h('span', { 'aria-hidden': 'true' }, String(seat.seed)),
            h('span', { class: 'sr-only' }, 'Seed ' + seat.seed))
        : h('span', { class: 'numeral name-seed', 'aria-hidden': 'true' }),
      h('span', { class: 'name-text' }, seat.lastName),
      seat.countryCode
        ? h('span', { class: 'numeral name-country', 'aria-label': 'Country: ' + seat.countryCode }, seat.countryCode)
        : null,
      state ? h('span', { class: 'sr-only' }, state) : null
    ];

    if (!ctx.editable) {
      return h('span', { class: 'name ' + modifier }, content);
    }

    return h('button', {
      type: 'button',
      role: 'radio',
      // aria-checked, not aria-pressed. These two names are one choice, not two
      // toggles — the single most important fact about the control is that
      // choosing one un-chooses the other.
      'aria-checked': isChosen ? 'true' : 'false',
      class: 'name ' + modifier,
      onClick: function () { ctx.onChoose(seat.ref); }
    }, content);
  }

  /** A slot — two names, one choice. A radiogroup, which is what that is. */
  function Slot(a, b, ctx) {
    return h('div', {
      role: ctx.editable ? 'radiogroup' : 'group',
      // The group's own name carries the void, so a screen reader user is told
      // the slot is void when they enter it rather than only when they reach
      // the affected option.
      'aria-label': ctx.voided ? ctx.label + '. Not wrong — void.' : ctx.label,
      class: ['slot', ctx.voided ? 'slot--void' : ''].join(' ')
    },
      Name(a, ctx),
      h('div', { class: 'slot-divider', 'aria-hidden': 'true' }),
      Name(b, ctx),
      ctx.voided
        // The explanation lives inside the slot, not in a legend somewhere else.
        // Dashed and colourless: green is a verified fact and red is a miss, and
        // a void is neither. Spending either would say something untrue.
        ? h('p', { class: 'slot-note' },
            h('span', { class: 'c-secondary' }, 'Not wrong — void.'), ' ',
            D.VOIDED.playerName + ' left the draw without playing this match. ' +
            'This pick scores nothing, and it cost you nothing. The points came off your ceiling instead of your score.')
        : null
    );
  }

  /**
   * BracketGrid — the whole draw.
   *
   * Horizontally scrollable rather than scaled down: a draw sheet is a wide
   * object, and shrinking names to fit a phone would make the signature screen
   * the least readable one in the product. The scroll container is a focusable,
   * named region, because a 128 draw is wider than any viewport and reaching
   * round six must not require a trackpad.
   */
  function BracketGrid(opts) {
    var bracket = opts.bracket;
    var official = opts.official;
    var editable = !!opts.editable;
    var onChoose = opts.onChoose || function () {};
    var fromRound = opts.fromRound || 0;

    var columns = D.ROUNDS.slice(fromRound).map(function (round) {
      var slots = round.matches.map(function (match, i) {
        var pair = bracket.participants[round.index][i] || [null, null];
        var a = pair[0] ? D.BY_REF[pair[0]] : null;
        var b = pair[1] ? D.BY_REF[pair[1]] : null;

        var voided = D.VOIDED.matches.some(function (v) {
          return v.round === round.index && v.indexInRound === i;
        }) && opts.showVoid;

        return Slot(a, b, {
          chosen: bracket.winners[round.index][i] || null,
          settledWinner: official ? (official.winners[round.index][i] || null) : null,
          voided: voided,
          editable: editable && !opts.locked,
          onChoose: function (ref) { onChoose(round.index, i, ref); },
          label: round.label.match + ', match ' + match.matchNumber
        });
      });

      return h('div', { class: 'bracket-col' },
        // Rounds are headings, not styled paragraphs: a column title is a
        // landmark a screen reader user navigates by.
        h('h3', { class: 'eyebrow bracket-col-head' }, round.label.column),
        h('div', { class: 'bracket-col-body' }, slots)
      );
    });

    return h('div', {
      class: 'bracket-region',
      tabindex: '0',
      role: 'region',
      'aria-label': 'Bracket, scrollable. Use the arrow keys to move across the rounds.'
    }, h('div', { class: 'bracket-grid' }, columns));
  }

  /* ==================================================================== */
  /* STANDINGS                    apps/web/components/leagues/StandingsTable.tsx */
  /* ==================================================================== */

  /**
   * Movement — day-over-day change, as a chip beside a score.
   *
   * Renders NOTHING when there is no previous data. That is the whole design:
   * null means "we have not seen yesterday", which is a different claim from
   * "nothing changed", and showing "+0" on the first morning of a tournament
   * would be the product asserting something it does not know.
   */
  function Movement(scoreDelta, positionDelta) {
    var moved = (positionDelta || 0) !== 0;
    var scored = (scoreDelta || 0) > 0;
    if (!moved && !scored) return null;
    var places = Math.abs(positionDelta || 0);

    return h('span', { class: 'row-base gap-sm', style: 'justify-content:flex-end' },
      scored ? h('span', { class: 'numeral t-caption c-data' }, '+' + scoreDelta) : null,
      moved ? h('span', { class: 'numeral t-caption ' + (positionDelta > 0 ? 'c-data' : 'c-miss') },
        h('span', { 'aria-hidden': 'true' }, (positionDelta > 0 ? '▲' : '▼') + places),
        h('span', { class: 'sr-only' }, (positionDelta > 0 ? 'Up ' : 'Down ') + places + (places === 1 ? ' place' : ' places'))
      ) : null
    );
  }

  /**
   * TournamentStandings.
   *
   * Before the lock this table says who has committed and nothing about what
   * they picked. That distinction is enforced in Postgres — commitment lives on
   * the entry, picks live on the bracket — and this is the surface it exists for.
   */
  function TournamentStandings(rows, locked) {
    if (!rows.length) return h('p', { class: 't-body c-muted' }, 'Nobody is in this field yet.');

    return h('table', { class: 'table' },
      h('caption', { class: 'sr-only' }, 'Standings'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', class: 'eyebrow', style: 'width:24px' },
          h('span', { 'aria-hidden': 'true' }, '#'),
          h('span', { class: 'sr-only' }, 'Position')),
        h('th', { scope: 'col', class: 'eyebrow' }, 'Member'),
        // An empty <th> before the lock was an unnamed column in a table a
        // screen reader navigates by header. There is no movement to report
        // before anything has been played, so the column is not rendered at all
        // rather than rendered blank.
        locked ? h('th', { scope: 'col', class: 'eyebrow right' }, 'Today') : null,
        h('th', { scope: 'col', class: 'eyebrow right' }, locked ? 'Score' : 'Status')
      )),
      h('tbody', null, rows.map(function (r) {
        return h('tr', { class: r.isYou ? 'is-you' : null },
          h('td', { class: 'numeral t-caption c-muted' }, locked ? String(r.position) : ''),
          h('td', { class: 't-body c-primary' },
            h('span', { class: r.isYou ? 'f-medium' : null }, r.displayName),
            r.isYou ? h('span', { class: 't-caption c-muted', style: 'margin-left:8px' }, 'you') : null,
            // The champion is the single fact that decides whether a bracket
            // still has a future, so it sits beside the name rather than in a
            // column nobody scans.
            locked && r.championAlive === false
              ? h('span', { class: 't-caption c-miss', style: 'margin-left:12px' }, 'champion out') : null
          ),
          locked ? h('td', { class: 'right' }, Movement(r.scoreDelta, r.positionDelta)) : null,
          h('td', { class: 'right' },
            locked
              ? h('span', { class: 'numeral t-body c-primary' }, String(r.score))
              : h('span', { class: 't-caption ' + (r.submitted ? 'c-data' : 'c-muted') },
                  r.submitted ? 'In' : 'Not yet')
          )
        );
      }))
    );
  }

  function SeasonStandings(rows) {
    if (!rows.length) return h('p', { class: 't-body c-muted' }, 'The season table fills in as events finish.');
    return h('table', { class: 'table' },
      h('caption', { class: 'sr-only' }, 'Season standings'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', class: 'eyebrow', style: 'width:24px' },
          h('span', { 'aria-hidden': 'true' }, '#'), h('span', { class: 'sr-only' }, 'Position')),
        h('th', { scope: 'col', class: 'eyebrow' }, 'Member'),
        h('th', { scope: 'col', class: 'eyebrow right' }, 'Played'),
        h('th', { scope: 'col', class: 'eyebrow right' }, 'Wins'),
        h('th', { scope: 'col', class: 'eyebrow right' }, 'Points')
      )),
      h('tbody', null, rows.map(function (r) {
        return h('tr', { class: r.isYou ? 'is-you' : null },
          h('td', { class: 'numeral t-caption c-muted' }, String(r.position)),
          h('td', { class: 't-body c-primary' },
            h('span', { class: r.isYou ? 'f-medium' : null }, r.displayName),
            r.isYou ? h('span', { class: 't-caption c-muted', style: 'margin-left:8px' }, 'you') : null),
          h('td', { class: 'numeral t-caption c-muted right' }, String(r.played)),
          h('td', { class: 'numeral t-caption c-muted right' }, String(r.wins)),
          h('td', { class: 'numeral t-body c-primary right' }, r.points.toLocaleString('en-GB'))
        );
      }))
    );
  }

  /* ==================================================================== */
  /* THE DAILY CHECK                  apps/web/components/leagues/DailyCheck.tsx */
  /* ==================================================================== */
  /*
     The sentence this product is built around is "I wonder what happened in my
     league today". The check is the computed answer, not a slogan — one
     headline, one detail, then the beats that expand on it.

     A hairline in the day's colour rather than a badge or an icon: the
     emotional register should be felt before it is read.
  */

  function DailyCheckPanel(check, eventName, onAction) {
    return h('section', { 'aria-labelledby': 'daily-check', class: 'stack gap-xl' },
      h('div', { class: 'row-top gap-lg' },
        h('span', { 'aria-hidden': 'true', class: 'check-rule check-rule--' + check.emotion }),
        h('div', { style: 'min-width:0' },
          // The frame names which lens this is. Rendering the directive's brief
          // verbatim would put an identical sentence at the top of every
          // member's page; three words say which check this is and the headline
          // stays personal.
          Eyebrow(check.frame + ' · ' + eventName),
          h('h2', { id: 'daily-check', class: 'f-display t-display c-primary', style: 'margin:8px 0 0' }, check.headline),
          h('p', { class: 't-lead c-secondary prose', style: 'margin:12px 0 0' }, check.detail)
        )
      ),
      check.action
        ? h('div', null, Action(check.action.label, function () { if (onAction) onAction(check.action); }, 'standard'))
        : null,
      check.beats && check.beats.length
        ? h('ul', { class: 'beats', style: 'margin:0;padding:0;list-style:none' },
            check.beats.map(function (b) {
              return h('li', { class: 'beat' },
                h('span', { 'aria-hidden': 'true', class: 'beat-dot beat-dot--' + b.emotion }),
                h('span', { style: 'min-width:0' },
                  h('span', { class: 't-body ' + (b.emotion === 'good' ? 'c-data' : b.emotion === 'bad' ? 'c-miss' : 'c-primary') }, b.headline),
                  ' ',
                  h('span', { class: 't-body c-muted' }, b.detail))
              );
            }))
        : null
    );
  }

  /* ==================================================================== */
  /* TOURNAMENT ROW              apps/web/components/leagues/TournamentRow.tsx */
  /* ==================================================================== */
  /*
     The one licensed use of a court colour: a 3px hairline. A season league
     shows seven of these stacked and the colour makes the shape of a tennis
     year legible at a glance without a single extra word.
  */

  var PHASE_COPY = {
    noDraw: 'Draw not out yet',
    notInField: 'Not in this field',
    fillBracket: 'Fill in your bracket',
    bracketIn: 'Your bracket is in',
    locked: 'Locked — play starts',
    playing: 'In progress',
    complete: 'Final'
  };

  var SURFACE_LABEL = { clay: 'Clay', grass: 'Grass', hard: 'Hard', carpet: 'Carpet', indoor: 'Indoor' };

  function TournamentRow(tournament, opts) {
    opts = opts || {};
    var cta = PHASE_COPY[opts.phase || 'noDraw'];
    var urgent = opts.phase === 'fillBracket' || opts.phase === 'playing';

    return h('li', { class: 'trow' },
      h('a', { class: 'trow-link', href: opts.href || '#', onClick: opts.onClick || null },
        h('span', { 'aria-hidden': 'true', class: 'court-hairline court-' + tournament.surface }),
        opts.position ? h('span', { class: 'numeral t-caption c-muted', style: 'width:16px;flex-shrink:0' }, String(opts.position)) : null,
        h('span', { class: 'stack gap-xs', style: 'min-width:0' },
          h('span', { class: 't-body c-primary', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, tournament.name),
          h('span', { class: 'row wrap gap-sm t-caption c-muted' },
            h('span', null, SURFACE_LABEL[tournament.surface]),
            h('span', { 'aria-hidden': 'true' }, '·'),
            h('time', { class: 'numeral', datetime: tournament.startsOn },
              new Date(tournament.startsOn + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })),
            tournament.weight !== 1 ? h('span', { 'aria-hidden': 'true' }, '·') : null,
            tournament.weight !== 1 ? h('span', { class: 'numeral' }, '×' + tournament.weight) : null
          )
        ),
        h('span', { class: 'stack gap-xs push', style: 'flex-shrink:0;align-items:flex-end;text-align:right' },
          h('span', { class: 't-caption ' + (urgent ? 'f-medium c-data' : 'c-muted') }, cta),
          opts.fieldSize
            ? h('span', { class: 'numeral t-caption c-muted' }, opts.submitted + ' of ' + opts.fieldSize + ' in')
            : null
        )
      )
    );
  }

  /* ==================================================================== */
  /* LEAGUE CARD                              apps/web/app/leagues/page.tsx */
  /* ==================================================================== */

  function LeagueCard(league, opts) {
    opts = opts || {};
    return h('li', { class: 'trow' },
      h('a', { class: 'trow-link', href: opts.href || '#', onClick: opts.onClick || null },
        h('span', { class: 'stack gap-xs', style: 'min-width:0' },
          h('span', { class: 't-body c-primary f-medium' }, league.name),
          h('span', { class: 'row wrap gap-sm t-caption c-muted' },
            h('span', null, league.format === 'season' ? 'Season league' : 'Single tournament'),
            h('span', { 'aria-hidden': 'true' }, '·'),
            h('span', { class: 'numeral' }, String(league.memberCount)),
            h('span', null, league.memberCount === 1 ? 'member' : 'members'),
            h('span', { 'aria-hidden': 'true' }, '·'),
            h('span', { class: 'numeral' }, String(league.tournamentCount)),
            h('span', null, league.tournamentCount === 1 ? 'tournament' : 'tournaments'),
            league.visibility === 'private' ? h('span', { 'aria-hidden': 'true' }, '·') : null,
            league.visibility === 'private' ? h('span', null, 'Private') : null
          )
        ),
        opts.note ? h('span', { class: 't-caption c-muted push' }, opts.note) : null
      )
    );
  }

  /* ==================================================================== */
  /* COPY INVITE                       apps/web/components/leagues/CopyInvite.tsx */
  /* ==================================================================== */
  /*
     `invite.copyFailed` exists because the clipboard can be denied — insecure
     context, permissions policy, an embedded webview — and a control that does
     nothing and reports nothing is indistinguishable from a broken one.
  */

  function CopyInvite(url) {
    var state = { value: 'idle' };
    var host = h('div', { class: 'stack gap-md' });

    function render() {
      MR.mount(host, MR.frag(
        h('div', { class: 'row wrap gap-md' },
          h('code', {
            class: 'numeral t-caption c-secondary',
            style: 'flex:1;min-width:220px;border:1px solid var(--mr-line);border-radius:var(--r-md);padding:12px 14px;background:var(--mr-sunken);overflow-x:auto;white-space:nowrap'
          }, url),
          Action(state.value === 'copied' ? 'Copied' : 'Copy link', function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(function () {
                state.value = 'copied'; render();
                setTimeout(function () { state.value = 'idle'; render(); }, 2200);
              }).catch(function () { state.value = 'failed'; render(); });
            } else {
              state.value = 'failed'; render();
            }
          }, 'standard')
        ),
        state.value === 'failed'
          ? h('p', { class: 'err', role: 'alert', style: 'margin:0' },
              'Could not copy. Select the link above and copy it by hand.')
          : null
      ));
    }
    render();
    return host;
  }

  /* ==================================================================== */
  /* RESULT ARTIFACT           apps/web/components/leagues/ResultArtifact.tsx */
  /* ==================================================================== */
  /*
     The shareable object. Under the league route rather than a token-addressed
     public page — a deliberate privacy decision recorded in KNOWN_WEAKNESSES:
     the URL is shareable WITHIN the league and not outside it, because a
     public token needs a read path that bypasses RLS and every one of those is
     a way for a private league's standings to leave the league.
  */

  function ResultArtifact(a) {
    return h('div', { class: 'artifact stack gap-2xl' },
      h('div', { class: 'row-base between wrap gap-md' },
        h('span', { class: 'artifact-mark' }, 'MatchRead',
          h('span', { class: 'eyebrow' }, 'Tennis brackets')),
        h('time', { class: 'numeral t-caption c-muted', datetime: a.finishedOn }, 'Finished ' + a.finishedLabel)
      ),
      h('div', null,
        Eyebrow(a.tournamentName),
        h('h2', { class: 'f-display t-title1 c-primary', style: 'margin:8px 0 0' }, a.headline)
      ),
      h('dl', { class: 'row wrap gap-3xl', style: 'margin:0' },
        Field('Placement', a.placement),
        Field('Score', String(a.score)),
        Field('Champion pick', a.championName, false)
      ),
      h('p', { class: 't-body c-secondary', style: 'margin:0' }, a.championLine),
      h('hr', { class: 'rule' }),
      h('p', { class: 't-caption c-muted', style: 'margin:0' }, a.scoreLine)
    );
  }

  /* ==================================================================== */
  /* FEEDBACK STATES                                                        */
  /* ==================================================================== */

  function Skeleton(w, hgt, extra) {
    return h('div', { class: 'skel ' + (extra || ''), style: 'width:' + w + ';height:' + hgt });
  }

  /** The loading shape of a page, not a spinner. A spinner says "wait"; a
      skeleton says "this is what is arriving", which is the calmer claim. */
  function PageSkeleton() {
    return h('div', { class: 'stack gap-3xl' },
      h('div', { class: 'stack gap-md' }, Skeleton('120px', '11px'), Skeleton('62%', '38px'), Skeleton('44%', '20px')),
      h('div', { class: 'stack gap-sm' },
        Skeleton('100%', '48px'), Skeleton('100%', '48px'), Skeleton('100%', '48px'), Skeleton('100%', '48px'))
    );
  }

  var SYS_COPY = {
    offline: {
      cls: 'offline',
      text: 'You are offline. This is the last data MatchRead had. Your bracket edits are queued and will save when the connection returns.'
    },
    provider_error: {
      cls: 'provider',
      text: 'Live scores are not arriving from the data provider. Results shown are from the last successful reconciliation sweep.'
    }
  };

  function SysBanner(kind) {
    var copy = SYS_COPY[kind];
    if (!copy) return null;
    return h('p', { role: 'status', class: 'sysbanner sysbanner--' + copy.cls, style: 'margin:0 0 24px' },
      h('span', { class: 'disclosure-dot', 'aria-hidden': 'true' }), copy.text);
  }

  /* ==================================================================== */
  /* DIALOG + TOAST                                                         */
  /* ==================================================================== */

  function Dialog(opts) {
    var scrim = h('div', { class: 'scrim', role: 'presentation', onClick: function (e) { if (e.target === scrim) close(); } });
    function close() { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); }

    var dialog = h('div', {
      class: 'dialog stack gap-lg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-title'
    },
      h('h2', { id: 'dlg-title', class: 'f-display t-title2 c-primary', style: 'margin:0' }, opts.title),
      h('p', { class: 't-body c-secondary', style: 'margin:0' }, opts.detail),
      h('div', { class: 'row wrap gap-md', style: 'margin-top:8px' },
        Action(opts.confirmLabel, function () { close(); if (opts.onConfirm) opts.onConfirm(); }, 'standard',
          opts.destructive ? 'standard' : 'prominent', { class: opts.destructive ? 'act--danger' : '' }),
        Action(opts.cancelLabel || 'Go back', close, 'standard', 'quiet')
      )
    );
    scrim.appendChild(dialog);
    document.body.appendChild(scrim);
    setTimeout(function () { dialog.querySelector('button').focus(); }, 30);
    return close;
  }

  function toast(message) {
    var dock = document.getElementById('toast-dock');
    var node = h('div', { class: 'toast', role: 'status' }, message);
    MR.mount(dock, node);
    setTimeout(function () { if (node.parentNode === dock) MR.mount(dock, null); }, 2600);
  }

  /* ==================================================================== */
  /* THE SHELL                       apps/web/components/layout/AppShell.tsx */
  /* ==================================================================== */
  /*
     A Server Component in production, taking the session as a prop rather than
     reading it, so the whole shell stays server-rendered and only the sign-out
     control ships JavaScript.

     There is no hamburger. Two destinations do not justify a drawer, and a
     drawer would mean shipping a state machine and a focus trap to every page
     for the privilege of hiding two links.
  */

  function Shell(content, opts) {
    opts = opts || {};
    var signedIn = opts.signedIn !== false;

    function nav(label, route) {
      return h('a', {
        class: 'navlink', href: '#/' + route,
        'aria-current': opts.active === route ? 'page' : null
      }, label);
    }

    return h('div', { class: 'shell' },
      h('a', { href: '#main', class: 'skip-link' }, 'Skip to content'),
      h('header', { class: 'shell-header' },
        h('div', { class: 'shell-header-inner' },
          h('a', { class: 'wordmark', href: '#/' },
            'MatchRead', h('span', { class: 'eyebrow descriptor' }, 'Tennis brackets')),
          h('nav', { 'aria-label': 'Main', class: 'shell-nav' },
            nav('Tournaments', 'tournaments'),
            nav('Players', 'players'),
            signedIn ? nav('Leagues', 'leagues') : null,
            // Placed before the session control on purpose: a user who has
            // landed in a language they cannot read needs to reach this before
            // anything else, and it must not be behind a sign-in.
            h('button', {
              class: actionClass('compact', 'standard'),
              'aria-label': 'Change language',
              onClick: function () { MR.go('settings'); }
            }, 'EN'),
            signedIn
              ? h('button', { class: actionClass('compact', 'quiet'), onClick: function () { MR.go('landing'); } }, 'Sign out')
              : ActionLink('Sign in', '#/sign-in', 'standard')
          )
        )
      ),
      h('main', { id: 'main', class: 'shell-main' }, content),
      h('footer', { class: 'shell-footer' },
        h('div', { class: 'shell-footer-inner' },
          h('p', { class: 't-caption c-muted', style: 'margin:0' }, 'Free to play. No entry fees, no wagering.'),
          h('p', { class: 't-caption c-muted push', style: 'margin:0' },
            'Tournament names are used descriptively. MatchRead is not affiliated with any tournament organiser.')
        )
      )
    );
  }

  /** A page header — eyebrow, title, meta row, and the MVP badge. */
  function PageHeader(opts) {
    return h('header', { class: 'stack gap-md' },
      h('div', { class: 'row wrap between gap-md' },
        Eyebrow(opts.eyebrow),
        MvpBadge(opts.mvp)
      ),
      h('h1', { class: 'f-display ' + (opts.large ? 't-display' : 't-title1') + ' c-primary', style: 'margin:0' }, opts.title),
      opts.meta ? h('p', { class: 'row wrap gap-md t-caption c-muted', style: 'margin:0' }, opts.meta) : null,
      opts.lead ? h('p', { class: 't-lead c-secondary prose', style: 'margin:4px 0 0' }, opts.lead) : null
    );
  }

  function Section(headingText, content, aside) {
    var id = 'sec-' + Math.random().toString(36).slice(2, 8);
    return h('section', { 'aria-labelledby': id, class: 'stack gap-lg' },
      h('div', { class: 'row-base between gap-md' },
        h('h2', { class: 'eyebrow', id: id }, headingText),
        aside || null),
      content
    );
  }

  /* ---------------------------------------------------------------- export */

  MR.ui = {
    Eyebrow: Eyebrow, Field: Field, FieldList: FieldList, EmptyState: EmptyState,
    SettlementDisclosure: SettlementDisclosure, Country: Country,
    LocalTime: LocalTime, LocalDeadline: LocalDeadline, countdown: countdown,
    ActionLink: ActionLink, Action: Action, actionClass: actionClass,
    MvpBadge: MvpBadge, PlayerChip: PlayerChip,
    Slot: Slot, BracketGrid: BracketGrid,
    TournamentStandings: TournamentStandings, SeasonStandings: SeasonStandings, Movement: Movement,
    DailyCheckPanel: DailyCheckPanel, TournamentRow: TournamentRow, LeagueCard: LeagueCard,
    CopyInvite: CopyInvite, ResultArtifact: ResultArtifact,
    Skeleton: Skeleton, PageSkeleton: PageSkeleton, SysBanner: SysBanner,
    Dialog: Dialog, toast: toast, Shell: Shell, PageHeader: PageHeader, Section: Section,
    SURFACE_LABEL: SURFACE_LABEL, PHASE_COPY: PHASE_COPY
  };
})();
