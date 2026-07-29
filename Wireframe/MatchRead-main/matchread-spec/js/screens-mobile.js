/* =========================================================================
   screens-mobile.js — the daily-picks product.
   -------------------------------------------------------------------------
   These screens are NOT part of the US Open web launch. They are here so the
   two products can be told apart, and so nobody builds one by accident while
   reading a spec for the other.

   They are rendered dark-first and inside a phone frame, deliberately: mobile
   is dark-first in packages/tokens (`surface.mobile`), web is light-first, and
   that divergence is the only platform-dependent object in the token file. A
   dark phone on a white page is the fastest way to say "different platform,
   different product".

   Everything here is classified Visual Exploration or Future Feature. Nothing
   here is on the 38-day critical path.
   ========================================================================= */

(function () {
  'use strict';

  var h = MR.h, U = MR.ui, D = MR.data;

  /** The mobile ground. From `surface.mobile` in packages/tokens. */
  var M = {
    canvas: '#04070F', raised: '#111D33', sunken: '#0B1424',
    line: '#1A2942', text: '#FFFFFF', secondary: '#EEF3FB', muted: '#7F91AE',
    read: '#F2B23E', data: '#2FD3C0', miss: '#F0564C'
  };

  function phone(children, caption) {
    return h('div', { class: 'stack gap-md', style: 'align-items:center' },
      h('div', {
        style: 'width:340px;max-width:100%;border:1px solid var(--mr-line-strong);border-radius:36px;' +
               'padding:10px;background:' + M.canvas
      },
        h('div', {
          style: 'border-radius:28px;overflow:hidden;background:' + M.canvas + ';color:' + M.text +
                 ';font-family:var(--mr-font-body);min-height:560px;display:flex;flex-direction:column'
        }, children)),
      caption ? h('p', { class: 'eyebrow' }, caption) : null);
  }

  function mHeader(title, sub) {
    return h('div', { style: 'padding:22px 20px 12px' },
      h('p', { style: 'margin:0;font-family:var(--mr-font-numeral);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:' + M.muted }, sub),
      h('h2', { style: 'margin:8px 0 0;font-family:var(--mr-font-display);font-size:26px;letter-spacing:-.03em;color:' + M.text }, title));
  }

  /**
   * The court. Every match card is two player baselines split by a dashed net;
   * picking one lights that baseline amber. This is the mobile product's
   * signature element and it has no web equivalent — the web signature is the
   * draw sheet.
   */
  function MatchCard(opts) {
    function baseline(seat, picked, result) {
      var color = M.secondary;
      var rule = 'transparent';
      if (result === 'correct') { color = M.data; rule = M.data; }
      else if (result === 'incorrect') { color = M.miss; rule = M.miss; }
      else if (picked) { color = M.read; rule = M.read; }

      return h('div', {
        style: 'display:flex;align-items:center;gap:10px;padding:14px 16px;min-height:44px;' +
               'border-left:2px solid ' + rule + ';cursor:pointer'
      },
        h('span', {
          style: 'font-family:var(--mr-font-numeral);font-size:12px;width:18px;color:' + M.muted
        }, seat.seed ? String(seat.seed) : ''),
        h('span', { style: 'font-size:15px;color:' + color + ';' + (picked || result ? 'font-weight:500;' : '') }, seat.lastName),
        h('span', {
          style: 'margin-left:auto;font-family:var(--mr-font-numeral);font-size:11px;text-transform:uppercase;color:' + M.muted
        }, seat.countryCode));
    }

    return h('div', {
      style: 'border:1px solid ' + M.line + ';border-radius:18px;background:' + M.raised + ';overflow:hidden'
    },
      h('div', {
        style: 'display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid ' + M.line +
               ';font-family:var(--mr-font-numeral);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + M.muted
      },
        opts.status === 'live'
          ? h('span', { style: 'width:6px;height:6px;border-radius:99px;background:' + M.data })
          : null,
        opts.label),
      baseline(opts.a, opts.picked === 'a', opts.result === 'a' ? 'correct' : (opts.result && opts.picked === 'a' ? 'incorrect' : null)),
      // The net. The only divider in the mobile app is the tramline — two
      // hairlines 4pt apart, borrowed from doubles court markings.
      h('div', { style: 'margin:0 16px;border-top:1px dashed ' + M.line }),
      h('div', { style: 'margin:3px 16px 0;border-top:1px dashed ' + M.line }),
      baseline(opts.b, opts.picked === 'b', opts.result === 'b' ? 'correct' : (opts.result && opts.picked === 'b' ? 'incorrect' : null)));
  }

  function note(text) {
    return h('p', { class: 'hint prose', style: 'margin:0' }, text);
  }

  /* --------------------------------------------------------------- today -- */

  MR.screens.today = {
    states: ['Upcoming', 'Live', 'Completed', 'Postponed', 'Empty'],
    render: function (state) {
      var s = D.SEATS;
      var cards;

      if (state === 'Empty') {
        cards = h('div', { style: 'padding:40px 20px;text-align:center' },
          h('p', { style: 'margin:0;font-family:var(--mr-font-display);font-size:18px;color:' + M.text }, 'No matches today'),
          h('p', { style: 'margin:8px 0 0;font-size:14px;color:' + M.muted },
            'The tour is between events. Tomorrow\u2019s slate lands overnight.'));
      } else {
        cards = h('div', { style: 'display:flex;flex-direction:column;gap:12px;padding:4px 20px 24px' },
          MatchCard({ label: state === 'Live' ? 'Live \u00b7 Court 7' : 'Round of 32 \u00b7 14:00',
            status: state === 'Live' ? 'live' : null, a: s[0], b: s[3], picked: 'a',
            result: state === 'Completed' ? 'a' : null }),
          MatchCard({ label: state === 'Postponed' ? 'Postponed \u2014 rain' : 'Round of 32 \u00b7 16:30',
            a: s[8], b: s[11], picked: state === 'Upcoming' ? null : 'b',
            result: state === 'Completed' ? 'a' : null }),
          MatchCard({ label: 'Round of 32 \u00b7 19:00', a: s[16], b: s[21], picked: null }));
      }

      return h('div', { class: 'stack gap-2xl' },
        U.PageHeader({
          eyebrow: 'Mobile \u00b7 not on web', mvp: 'explor', title: 'Today\u2019s matches',
          lead: 'The mobile product\u2019s spine. Every card is a court: two baselines split by a net, and picking one lights that baseline. Deliberately cut from the US Open web launch \u2014 see the spec drawer for why.'
        }),
        phone([
          mHeader('Today', 'US Open \u00b7 Day 4'),
          cards
        ], 'apps/mobile/app/(tabs)/matches.tsx'),
        note('Rendered dark because mobile is dark-first in packages/tokens \u2014 `surface` is the only platform-dependent object in the token file, and the amber/teal accents here are the mobile app\u2019s current palette rather than the Phase 3 web identity. Migrating mobile onto Tournament Green is a later, individually-verifiable change, not part of this launch.'));
    }
  };

  /* -------------------------------------------------------- match detail -- */

  MR.screens['match-detail'] = {
    states: ['No pick', 'Pick selected', 'Pick submitted', 'Locked', 'Correct', 'Incorrect'],
    render: function (state) {
      var s = D.SEATS;
      var revealed = state !== 'No pick';
      var picked = state === 'No pick' ? null : 'a';
      var result = state === 'Correct' ? 'a' : state === 'Incorrect' ? 'b' : null;

      function meter(label, left, right) {
        return h('div', { style: 'padding:0 20px 14px' },
          h('p', { style: 'margin:0 0 6px;font-family:var(--mr-font-numeral);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + M.muted }, label),
          h('div', { style: 'display:flex;height:4px;border-radius:99px;overflow:hidden;background:' + M.line },
            h('div', { style: 'width:' + left + '%;background:' + M.data }),
            h('div', { style: 'flex:1' })),
          h('div', { style: 'display:flex;justify-content:space-between;margin-top:6px;font-family:var(--mr-font-numeral);font-size:11px;color:' + M.muted },
            h('span', null, left + '%'), h('span', null, right + '%')));
      }

      return h('div', { class: 'stack gap-2xl' },
        U.PageHeader({
          eyebrow: 'Mobile \u00b7 not on web', mvp: 'explor', title: 'Match detail',
          lead: 'Objective statistics beside human editorial, and then one decision: who wins. Winner only, never a score.'
        }),
        phone([
          mHeader('Round of 32', 'US Open \u00b7 Court 7 \u00b7 14:00'),
          h('div', { style: 'padding:4px 20px 16px' },
            MatchCard({ label: state === 'Locked' ? 'Locked at first serve' : 'Pick the winner',
              a: s[0], b: s[3], picked: picked, result: result })),
          meter('Serve hold, last 12 months', 88, 12),
          meter('Hard court win rate, 2026', 74, 26),
          h('div', { style: 'margin:0 20px 16px;padding:14px 16px;border:1px solid ' + M.line + ';border-radius:14px;background:' + M.sunken },
            h('p', { style: 'margin:0;font-family:var(--mr-font-numeral);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + M.muted }, 'The read'),
            h('p', { style: 'margin:8px 0 0;font-size:14px;line-height:22px;color:' + M.secondary },
              'Aldecoa has not dropped serve on a hard court since June. Duvernay returns better than anyone in this quarter, but has played four sets more this week.')),
          h('div', { style: 'margin:0 20px 24px;padding:14px 16px;border:1px solid ' + M.line + ';border-radius:14px' },
            h('p', { style: 'margin:0;font-family:var(--mr-font-numeral);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + M.muted }, 'The community'),
            revealed
              ? h('p', { style: 'margin:8px 0 0;font-family:var(--mr-font-numeral);font-size:20px;color:' + M.text }, '71% \u00b7 29%')
              : h('p', { style: 'margin:8px 0 0;font-size:14px;line-height:22px;color:' + M.muted },
                  'Hidden until you pick. Seeing the crowd first turns a scouting habit into a poll.'))
        ], 'apps/mobile/app/match/[id].tsx'),
        note('The community split being hidden until you pick is enforced in RLS and in the RPC, not in this component. It is one of three product decisions the database owns rather than the interface \u2014 alongside the pick lock and comments opening only after a match finishes.'));
    }
  };

  /* ------------------------------------------------------------ match iq -- */

  MR.screens['match-iq'] = {
    states: ['Populated', 'Empty'],
    render: function (state) {
      var rows = [
        ['Aldecoa d. Duvernay', 'correct', '+14'],
        ['Halvorsen d. Gadea', 'incorrect', '\u221229'],
        ['Marchetti d. Norrbom', 'correct', '+8'],
        ['Pellerin d. Quiroga', 'correct', '+21']
      ];

      return h('div', { class: 'stack gap-2xl' },
        U.PageHeader({
          eyebrow: 'Mobile \u00b7 not on web', mvp: 'explor', title: 'Prediction history \u00b7 Match IQ',
          lead: 'The permanent record of a daily picker. Cut from the web launch: no US Open web user will have one, and showing a stranger\u2019s starting rating next to their bracket score teaches nobody anything.'
        }),
        phone([
          mHeader('Match IQ', 'Season 2026'),
          h('div', { style: 'padding:0 20px 20px' },
            h('p', { style: 'margin:0;font-family:var(--mr-font-numeral);font-size:44px;letter-spacing:-.03em;color:' + M.read }, '1,486'),
            h('p', { style: 'margin:4px 0 0;font-size:13px;color:' + M.muted }, '+52 this fortnight \u00b7 412 picks graded')),
          state === 'Empty'
            ? h('div', { style: 'padding:30px 20px;text-align:center' },
                h('p', { style: 'margin:0;font-size:14px;color:' + M.muted },
                  'Your rating starts moving with your first graded pick.'))
            : h('div', { style: 'padding:0 20px 24px' },
                h('p', { style: 'margin:0 0 10px;font-family:var(--mr-font-numeral);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + M.muted }, 'Yesterday'),
                rows.map(function (r) {
                  return h('div', {
                    style: 'display:flex;align-items:center;gap:10px;padding:12px 0;border-top:1px solid ' + M.line
                  },
                    h('span', {
                      style: 'width:6px;height:6px;border-radius:99px;background:' + (r[1] === 'correct' ? M.data : M.miss)
                    }),
                    h('span', { style: 'font-size:14px;color:' + M.secondary }, r[0]),
                    h('span', {
                      style: 'margin-left:auto;font-family:var(--mr-font-numeral);font-size:13px;color:' + (r[1] === 'correct' ? M.data : M.miss)
                    }, r[2]));
                }))
        ], 'apps/mobile/app/(tabs)/profile.tsx'),
        note('Rating scores difficulty, not volume: correct \u2192 +K\u00b7(1\u2212p), incorrect \u2192 \u2212K\u00b7p, where p is the engine probability of the picked side. Expected value at the model\u2019s own price is exactly zero, so no strategy farms rating. That maths lives in packages/core and is the most-tested code in the repository.'));
    }
  };

  /* -------------------------------------------------------- user profile -- */

  MR.screens['user-profile'] = {
    states: ['Not built on web'],
    render: function () {
      return h('div', { class: 'stack gap-2xl prose' },
        U.PageHeader({
          eyebrow: 'Not on web', mvp: 'post', title: 'User profile',
          lead: 'On web, a member\u2019s identity surface is a standings row and a result artifact. For a bracket league that is enough, and it is all that ships for the US Open.'
        }),
        h('div', { class: 'panel stack gap-md' },
          U.Eyebrow('A naming trap worth stating once'),
          h('p', { class: 't-body c-secondary', style: 'margin:0' },
            'On web, ', h('strong', null, 'player'), ' means a tennis player and ', h('strong', null, 'member'),
            ' means a person in a league. /players is a rankings page about professional tennis players \u2014 it is not a user directory, and it must never become one by accident. The route table reflects that distinction and so should every component name.')),
        U.EmptyState('No profile page',
          'Members appear in the standings of the leagues they belong to, and on the result artifact when a tournament finishes. Anything more is post-launch.'));
    }
  };
})();
