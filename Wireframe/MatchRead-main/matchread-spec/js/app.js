/* =========================================================================
   app.js — routing, the state switcher, the spec drawer and the index.
   -------------------------------------------------------------------------
   Everything in this file is SCAFFOLDING. None of it is product and none of it
   should be implemented: it is the apparatus that lets an engineer walk every
   screen through every state and read the specification beside it.
   ========================================================================= */

(function () {
  'use strict';

  var h = MR.h, U = MR.ui;

  var current = { id: 'index', state: 0, specId: null };
  var drawer = { open: false, tab: 'overview' };

  /* --------------------------------------------------------------- index -- */

  var GROUP_ORDER = ['Entry', 'Leagues', 'Tournament', 'Public', 'System', 'Operator', 'Daily picks (not on web)'];

  var indexFilter = 'all';

  function IndexScreen() {
    var counts = { mvp: 0, post: 0, explor: 0 };
    MR.registry.forEach(function (s) {
      if (counts[s.mvp] !== undefined) counts[s.mvp]++;
    });

    function filterBtn(key, label) {
      return h('button', {
        class: 'statebtn', 'aria-pressed': indexFilter === key ? 'true' : 'false',
        onClick: function () { indexFilter = key; render(); }
      }, label);
    }

    var groups = {};
    MR.registry.forEach(function (s) {
      if (indexFilter !== 'all' && s.mvp !== indexFilter) return;
      (groups[s.group] = groups[s.group] || []).push(s);
    });

    return h('div', { class: 'stack gap-3xl' },
      U.PageHeader({
        eyebrow: 'Visual product specification', mvp: 'mvp',
        title: 'MatchRead \u2014 US Open 2026 web launch', large: true,
        lead: 'Every screen, every state, every interaction, and what each one costs in engineering. Click any screen to open it; the Spec button on any screen opens its inventory entry, its interaction specification and its engineer mapping.'
      }),

      h('div', { class: 'panel stack gap-md' },
        U.Eyebrow('How to read this'),
        h('ul', { class: 't-body c-secondary', style: 'margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px' },
          h('li', null, 'Every screen carries exactly one classification badge. None is unclassified.'),
          h('li', null, 'The grey rail beneath the header on every screen switches that screen through its states. That is the specification of the states \u2014 not a demo toggle.'),
          h('li', null, 'The charcoal Spec drawer is scaffolding. Nothing in it, and nothing styled like it, should be built.'),
          h('li', null, 'Terminology, routes and copy are taken from the repository at migration ',
            h('code', { class: 'numeral' }, '0030_replacement_search.sql'), '. Where this specification adds something, it is marked Needs Engineering.'))),

      h('div', { class: 'idx-filters' },
        filterBtn('all', 'All ' + MR.registry.length),
        filterBtn('mvp', 'Launch MVP ' + counts.mvp),
        filterBtn('post', 'Post launch ' + counts.post),
        filterBtn('explor', 'Visual exploration ' + counts.explor)),

      GROUP_ORDER.filter(function (g) { return groups[g]; }).map(function (g) {
        return U.Section(g,
          h('table', { class: 'idx-table' },
            h('thead', null, h('tr', null,
              h('th', { scope: 'col', class: 'eyebrow' }, 'Screen'),
              h('th', { scope: 'col', class: 'eyebrow' }, 'Route'),
              h('th', { scope: 'col', class: 'eyebrow' }, 'States'),
              h('th', { scope: 'col', class: 'eyebrow' }, 'Status'),
              h('th', { scope: 'col', class: 'eyebrow' }, 'Class'))),
            h('tbody', null, groups[g].map(function (s) {
              return h('tr', null,
                h('td', null, h('a', {
                  class: 'idx-name', href: '#/' + s.id,
                  onClick: function (e) { e.preventDefault(); MR.go(s.id); }
                }, s.name)),
                h('td', null, h('span', { class: 'idx-route' }, s.route)),
                h('td', null, h('span', { class: 'numeral t-caption c-muted' },
                  String((MR.screens[s.id] && MR.screens[s.id].states.length) || s.states.length))),
                h('td', null, h('span', { class: 'st st--' + s.mapping.status }, MR.STATUS_LABEL[s.mapping.status])),
                h('td', null, U.MvpBadge(s.mvp)));
            }))));
      })
    );
  }

  /* -------------------------------------------------------- state switcher */

  function StateRail(screen, spec) {
    if (!screen || screen.states.length <= 1) return null;
    return h('div', { class: 'staterail' },
      h('span', { class: 'staterail-label' }, 'State'),
      h('div', { class: 'stategroup' },
        screen.states.map(function (label, i) {
          return h('button', {
            class: 'statebtn', 'aria-pressed': current.state === i ? 'true' : 'false',
            onClick: function () { current.state = i; render(); }
          }, label);
        })),
      h('span', { class: 'staterail-label push' },
        (spec && spec.route) ? spec.route : ''));
  }

  /* ---------------------------------------------------------- spec drawer */

  function kv(label, value) {
    return [h('dt', null, label), h('dd', null, value)];
  }

  function OverviewTab(s) {
    return h('div', null,
      h('h3', null, 'Purpose'), h('p', null, s.purpose),
      h('h3', null, 'Classification'),
      h('p', null, h('span', { class: 'st st--' + s.mapping.status }, MR.STATUS_LABEL[s.mapping.status])),
      h('dl', { class: 'spec-kv' },
        kv('Route', h('code', null, s.route)),
        kv('MVP', { mvp: 'Launch MVP', post: 'Post launch', explor: 'Visual exploration' }[s.mvp])),
      h('h3', null, 'Entry points'),
      h('ul', null, s.entry.map(function (e) { return h('li', null, e); })),
      h('h3', null, 'Exit points'),
      h('ul', null, s.exit.map(function (e) { return h('li', null, e); })),
      h('h3', null, 'Required data'),
      h('ul', null, s.data.map(function (e) { return h('li', null, e); })),
      h('h3', null, 'States'),
      h('ul', null, s.states.map(function (e) { return h('li', null, e); })));
  }

  function InteractionsTab(s) {
    return h('div', null,
      h('h3', null, s.interactions.length + ' interactive elements'),
      s.interactions.map(function (i) {
        return h('div', { class: 'spec-int' },
          h('p', { class: 'spec-int-name' },
            i.name, ' ',
            h('span', { class: 'st st--' + i.status }, MR.STATUS_LABEL[i.status])),
          h('dl', { class: 'spec-int-grid' },
            kv('Action', i.action),
            kv('Behaviour', i.behaviour),
            kv('Destination', i.destination),
            kv('Data', i.data),
            kv('Disabled', i.disabled),
            kv('Loading', i.loading),
            kv('Empty', i.empty),
            kv('Success', i.success),
            kv('Failure', i.failure),
            kv('Motion', i.motion)));
      }));
  }

  function EngineerTab(s) {
    var m = s.mapping;
    return h('div', null,
      h('h3', null, 'Implementation status'),
      h('p', null, h('span', { class: 'st st--' + m.status }, MR.STATUS_LABEL[m.status])),
      h('h3', null, 'Mapping'),
      h('dl', { class: 'spec-kv' },
        kv('Route', h('code', null, m.route)),
        kv('Components', h('code', null, m.component)),
        kv('Backend', m.backend),
        kv('Database', h('code', null, m.database)),
        kv('API', m.api)),
      h('h3', null, 'Notes for the engineer'),
      h('p', null, m.notes));
  }

  function SpecDrawer(s) {
    if (!s) return null;

    function tab(key, label) {
      return h('button', {
        role: 'tab', 'aria-selected': drawer.tab === key ? 'true' : 'false',
        onClick: function () { drawer.tab = key; render(); }
      }, label);
    }

    var body =
      drawer.tab === 'interactions' ? InteractionsTab(s) :
      drawer.tab === 'engineer' ? EngineerTab(s) : OverviewTab(s);

    return h('aside', {
      class: 'spec-drawer', 'data-open': drawer.open ? 'true' : 'false',
      'aria-label': 'Specification', 'aria-hidden': drawer.open ? 'false' : 'true'
    },
      h('div', { class: 'spec-drawer-head' },
        h('p', { class: 'spec-drawer-title' }, s.name),
        h('button', { class: 'spec-close', onClick: function () { drawer.open = false; render(); } }, 'Close')),
      h('div', { class: 'spec-tabs', role: 'tablist' },
        tab('overview', 'Screen'), tab('interactions', 'Interactions'), tab('engineer', 'Engineer')),
      h('div', { class: 'spec-body' }, body));
  }

  function Dock(s) {
    return h('div', { class: 'spec-dock' },
      h('button', { onClick: function () { MR.go('index'); } }, 'Index'),
      s ? h('button', {
        'aria-pressed': drawer.open ? 'true' : 'false',
        onClick: function () { drawer.open = !drawer.open; render(); }
      }, 'Spec') : null);
  }

  /* -------------------------------------------------------------- routing */

  /** Re-render in place, for scaffolding controls that are not routes. */
  MR.rerender = function () { render(); };

  MR.go = function (id, state) {
    // A registry entry that is a STATE of another screen rather than a screen of
    // its own routes to its host. `check-email` is a state of /sign-in and
    // `bracket-locked` is the same route as the bracket after the lock — both
    // deserve their own specification entry and neither is a separate page.
    var spec = MR.registryById[id];
    if (spec && spec.alias && !MR.screens[id]) {
      current.specId = id;
      id = spec.alias.id;
      state = spec.alias.state;
    } else {
      current.specId = null;
    }

    current.id = id;
    current.state = state || 0;
    drawer.open = false;

    // location.hash rather than history.replaceState: replaceState is rejected
    // on file:// URLs, and this folder has to open from a double-click with no
    // server. The hashchange handler is a no-op when the id already matches.
    try {
      if (location.hash !== '#/' + id) location.hash = '#/' + id;
    } catch (e) { /* deep-linking is a convenience, never a requirement */ }

    render();
    // Guarded: scrolling to the top of a new screen is a courtesy, and it must
    // never be the thing that takes the page down.
    try { window.scrollTo(0, 0); } catch (e) { /* no-op */ }
  };

  function render() {
    var root = document.getElementById('root');
    // The spec shown is the aliased entry when one is active, so /sign-in opened
    // as "Check your email" reads that entry rather than the sign-in one.
    var spec = MR.registryById[current.specId || current.id] || null;
    var screen = MR.screens[current.id];

    var content;
    if (current.id === 'index' || !screen) {
      content = IndexScreen();
    } else {
      var stateLabel = screen.states[current.state] || screen.states[0];
      content = MR.frag(
        StateRail(screen, spec),
        screen.render(stateLabel)
      );
    }

    var signedOut = screen && screen.signedOut
      ? screen.signedOut(screen.states[current.state])
      : false;

    MR.mount(root, MR.frag(
      U.Shell(content, { signedIn: !signedOut, active: activeNav(current.id) }),
      Dock(spec),
      SpecDrawer(spec)
    ));
  }

  function activeNav(id) {
    if (id === 'tournaments' || id === 'tournament-entry') return 'tournaments';
    if (id === 'players') return 'players';
    if (['leagues', 'league-home', 'league-standings', 'between', 'bracket', 'result', 'create-league'].indexOf(id) >= 0) return 'leagues';
    return null;
  }

  /* ----------------------------------------------------------------- boot */

  window.addEventListener('hashchange', function () {
    var id = location.hash.replace('#/', '') || 'index';
    if (id !== current.id) MR.go(id);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.open) { drawer.open = false; render(); }
    // A spec browser is walked, not clicked. Left/right move through the states
    // of the current screen when focus is not in a control.
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].indexOf(tag) >= 0) return;
    var screen = MR.screens[current.id];
    if (!screen) return;
    if (e.key === 'ArrowRight' && current.state < screen.states.length - 1) { current.state++; render(); }
    if (e.key === 'ArrowLeft' && current.state > 0) { current.state--; render(); }
  });

  var initial = location.hash.replace('#/', '') || 'index';
  if (initial !== 'index' && (MR.screens[initial] || MR.registryById[initial])) {
    MR.go(initial);
  } else {
    current.id = 'index';
    render();
  }
})();
