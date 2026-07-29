/* =========================================================================
   data.js — realistic MatchRead mock data.
   -------------------------------------------------------------------------
   No API, no database, no network. Every shape below mirrors a projection the
   repositories in apps/web/server/repositories actually return, so a screen
   built against this data is built against the production shape.

   ## The players are invented, deliberately

   Every surname here is fictional, following the rule already established in
   apps/web/app/showcase/fixtures.ts: using real players' names and results in
   a design surface is a licensing and likeness question, not a design one, and
   a bracket does not need real people to be specified.

   Tournament names are used descriptively — the same basis the product footer
   already states on every page.
   ========================================================================= */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ prng */
  /* Deterministic, so every reload shows an engineer the same draw, the same
     results and the same standings. A prototype that reshuffles itself cannot
     be used as a reference. */
  function prng(seed) {
    // mulberry32. The obvious LCG was tried first and was wrong in a way worth
    // recording: with a small seed its first output lands in a narrow band, so
    // every "did this pick go wrong" test compared roughly the same number
    // against the same threshold and the fixture bracket graded 127/127. A
    // perfect bracket is the one bracket a visual specification must not ship,
    // because the incorrect state then never renders anywhere.
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --------------------------------------------------------------- players */

  var SURNAMES = [
    'Aldecoa', 'Brennig', 'Castellan', 'Duvernay', 'Erlandsen', 'Falkner', 'Gadea',
    'Halvorsen', 'Ivarsson', 'Jelinek', 'Kaltenbach', 'Lindqvist', 'Marchetti',
    'Norrbom', 'Okonjo', 'Pellerin', 'Quiroga', 'Ravenel', 'Sundqvist', 'Tirado',
    'Ulvestad', 'Vasquez', 'Wexler', 'Ximenes', 'Yazdani', 'Zoric', 'Ambrus',
    'Bertaud', 'Cziffra', 'Dahlberg', 'Escalante', 'Fontanet', 'Grieco', 'Hollick',
    'Iversen', 'Janvier', 'Kowalczyk', 'Lundgren', 'Maroni', 'Obradovic', 'Prieto',
    'Quiller', 'Rasmussen', 'Salvatierra', 'Thibault', 'Urquhart', 'Vestergaard',
    'Wollny', 'Xanthos', 'Yilmaz', 'Zaharia', 'Andriessen', 'Bracamonte', 'Cordoba',
    'Delacroix', 'Eberhardt', 'Ferrante', 'Gjertsen', 'Hauser', 'Ingram', 'Jansson',
    'Kiraly', 'Laurent', 'Mendoza', 'Novosel', 'Oyelaran', 'Petrosyan', 'Quintela',
    'Roussel', 'Stefanescu', 'Tanaka', 'Uribe', 'Valdes', 'Whitlock', 'Yoon',
    'Zeller', 'Arvidsson', 'Baumgartner', 'Chevalier', 'Draeger', 'Eklund',
    'Fiorentino', 'Galvan', 'Hjelm', 'Iglesias', 'Jokinen', 'Karlgren', 'Lemoine',
    'Moreau', 'Nagy', 'Ortega', 'Pieterse', 'Radulescu', 'Solberg', 'Tessier',
    'Ustinov', 'Villalba', 'Weiss', 'Yanez', 'Zylberman', 'Aitchison', 'Bergqvist',
    'Cantu', 'Dufresne', 'Enriquez', 'Foulkes', 'Guerrero', 'Haraldsen', 'Imbert',
    'Jaramillo', 'Kettunen', 'Lombardi', 'Mikkelsen', 'Nordahl', 'Olivares',
    'Paquette', 'Quesnel', 'Ricci', 'Steinlein', 'Trevino', 'Ulrich', 'Vinter',
    'Wallenberg', 'Yamashiro', 'Zubiri', 'Alarcon', 'Bouchard', 'Cavalieri',
    'Dupuis', 'Elmqvist'
  ];

  var COUNTRIES = [
    'ESP', 'FRA', 'ITA', 'USA', 'GER', 'SRB', 'GBR', 'ARG', 'AUS', 'JPN', 'CAN',
    'NED', 'POL', 'SUI', 'SWE', 'NOR', 'DEN', 'CZE', 'AUT', 'BEL', 'POR', 'BRA',
    'CHI', 'COL', 'MEX', 'RSA', 'KOR', 'CHN', 'IND', 'TUR', 'GRE', 'CRO', 'HUN',
    'FIN', 'NZL', 'UKR', 'KAZ', 'TUN', 'MAR', 'BUL'
  ];

  /* --------------------------------------------------------- the draw sheet */

  var DRAW_SIZE = 128;

  /**
   * Seeded positions in a 128 draw.
   *
   * Seeds 1 and 2 at the extremes, 3 and 4 at the quarter boundaries, and so on
   * down. Not the ITF's exact placement table — this is a visual specification,
   * and the property that matters here is that the top seeds cannot meet before
   * the late rounds, which is what makes a bracket read correctly.
   */
  function seedPositions(size, seedCount) {
    var slots = {};
    var order = [0, size - 1, size / 2, size / 2 - 1];
    for (var s = 0; s < 4 && s < seedCount; s++) slots[order[s]] = s + 1;

    // The remaining seeds spread evenly through the eighths and sixteenths.
    var block = size / seedCount;
    for (var i = 4; i < seedCount; i++) {
      var pos = Math.floor(i * block) + (i % 2 === 0 ? 1 : block - 2);
      pos = Math.max(1, Math.min(size - 2, pos));
      while (slots[pos] !== undefined) pos = (pos + 3) % size;
      slots[pos] = i + 1;
    }
    return slots;
  }

  function buildDraw() {
    var rand = prng(20260830);
    var seeds = seedPositions(DRAW_SIZE, 32);
    var seats = [];

    for (var i = 0; i < DRAW_SIZE; i++) {
      var name = SURNAMES[i % SURNAMES.length];
      // Distinguish the wrap-around duplicates rather than shipping two
      // identical names in one draw — a duplicated name is a bracket that
      // cannot be scored.
      if (i >= SURNAMES.length) name = name + '-' + String.fromCharCode(65 + Math.floor(i / SURNAMES.length));
      seats.push({
        position: i,
        ref: 'p-' + i,
        lastName: name,
        seed: seeds[i] !== undefined ? seeds[i] : null,
        countryCode: COUNTRIES[Math.floor(rand() * COUNTRIES.length)]
      });
    }
    return seats;
  }

  var SEATS = buildDraw();
  var BY_REF = {};
  SEATS.forEach(function (s) { BY_REF[s.ref] = s; });

  /** Round structure. Labels are derived from distance to the final, never hard-coded. */
  function roundLabel(playersRemaining) {
    if (playersRemaining === 2) return { column: 'Final', match: 'Final' };
    if (playersRemaining === 4) return { column: 'Semi-finals', match: 'Semi-final' };
    if (playersRemaining === 8) return { column: 'Quarter-finals', match: 'Quarter-final' };
    return { column: 'Round of ' + playersRemaining, match: 'Round of ' + playersRemaining };
  }

  var ROUNDS = [];
  (function () {
    var remaining = DRAW_SIZE;
    var index = 0;
    var matchNumber = 1;
    while (remaining >= 2) {
      var count = remaining / 2;
      var matches = [];
      for (var m = 0; m < count; m++) {
        matches.push({ round: index, indexInRound: m, matchNumber: matchNumber++ });
      }
      ROUNDS.push({
        index: index,
        playersRemaining: remaining,
        label: roundLabel(remaining),
        matches: matches
      });
      remaining = remaining / 2;
      index++;
    }
  })();

  var TOTAL_MATCHES = DRAW_SIZE - 1; // 127

  /**
   * The resolver. Called twice — once for real results, once for a member's
   * picks — so an official draw and a personal bracket cannot drift.
   *
   * `decide(round, indexInRound, a, b)` returns the ref that advances, or null
   * when that match has not been decided yet.
   */
  function resolve(decide) {
    var participants = []; // participants[round][indexInRound] = [refA, refB]
    var winners = [];      // winners[round][indexInRound] = ref | null

    participants[0] = [];
    for (var m = 0; m < DRAW_SIZE / 2; m++) {
      participants[0].push([SEATS[m * 2].ref, SEATS[m * 2 + 1].ref]);
    }

    for (var r = 0; r < ROUNDS.length; r++) {
      winners[r] = [];
      for (var i = 0; i < ROUNDS[r].matches.length; i++) {
        var pair = participants[r][i] || [null, null];
        winners[r][i] = (pair[0] && pair[1]) ? decide(r, i, pair[0], pair[1]) : null;
      }
      if (r + 1 < ROUNDS.length) {
        participants[r + 1] = [];
        for (var j = 0; j < ROUNDS[r + 1].matches.length; j++) {
          participants[r + 1].push([winners[r][j * 2] || null, winners[r][j * 2 + 1] || null]);
        }
      }
    }
    return { participants: participants, winners: winners };
  }

  /**
   * Strength: seeds win more often, and the rest is deterministic noise wide
   * enough that the official draw contains real upsets.
   *
   * The top seed is then forced to be the strongest player in the field. That
   * is a fixture decision rather than a modelling one: several pieces of copy
   * in this specification say "called the champion and the champion won it",
   * and a fixture whose narrative contradicts its own screens is worse than an
   * unrealistic one. Everything below the top seed is left to the noise.
   */
  var STRENGTH = {};
  SEATS.forEach(function (seat) {
    var base = seat.seed ? (150 - seat.seed * 2.6) : 68;
    STRENGTH[seat.ref] = base + prng(seat.position * 7919 + 13)() * 46;
  });
  STRENGTH['p-0'] = 260;

  function strength(ref) { return STRENGTH[ref] || 0; }

  /**
   * How far the official draw has progressed, per tournament phase.
   *   pre       — nothing played
   *   live      — through the Round of 16, quarter-finals in progress
   *   complete  — a champion
   */
  var PROGRESS = { pre: -1, live: 3, complete: 6 };

  function officialFor(phase) {
    var through = PROGRESS[phase];
    return resolve(function (round, index, a, b) {
      if (round > through) return null;
      return strength(a) >= strength(b) ? a : b;
    });
  }

  var OFFICIAL = {
    pre: officialFor('pre'),
    live: officialFor('live'),
    complete: officialFor('complete')
  };

  /**
   * The viewer's bracket. Right about most of it, wrong in the places that make
   * a specification useful: first-round upsets missed, a quarter-final gone,
   * and a champion called correctly all the way through.
   */
  var CHAMPION = 'p-0';

  var MY_BRACKET = resolve(function (round, index, a, b) {
    var pick = strength(a) >= strength(b) ? a : b;
    var other = pick === a ? b : a;

    // A reader who calls a champion picks that champion in every round. Flipping
    // anywhere on their path would model a reader contradicting themselves, and
    // would break the result artifact's copy, which says this bracket called the
    // winner. Every other match is fair game.
    if (pick === CHAMPION) return pick;

    var flip = prng(round * 104729 + index * 1301 + 7)();
    // Wrong on roughly one first-round match in eight, less often deeper. The
    // apparent accuracy falls away faster than these numbers suggest, because a
    // miss in the first round poisons every later round on that line of the
    // draw. That is what happens to a real bracket, and it is the reason the
    // settled screen is worth looking at at all.
    var wrongRate = [0.12, 0.10, 0.09, 0.12, 0.16, 0.0, 0.0][round];
    return flip < wrongRate ? other : pick;
  });

  /** A partially-filled bracket, for the "no pick" and "in progress" states. */
  var PARTIAL_BRACKET = (function () {
    var copy = { participants: [], winners: [] };
    MY_BRACKET.winners.forEach(function (roundWinners, r) {
      copy.winners[r] = roundWinners.map(function (w, i) {
        // First 41 of the 64 opening matches picked, nothing beyond.
        return (r === 0 && i < 41) ? w : null;
      });
    });
    copy.participants[0] = MY_BRACKET.participants[0];
    for (var r = 1; r < ROUNDS.length; r++) {
      copy.participants[r] = ROUNDS[r].matches.map(function (_, j) {
        return [copy.winners[r - 1][j * 2] || null, copy.winners[r - 1][j * 2 + 1] || null];
      });
    }
    return copy;
  })();

  /**
   * The disruption. One player leaves a published draw without playing, so the
   * picks that named them are void — not wrong. Void is neither a verified fact
   * nor a miss, so it gets neither green nor red: a dashed rule and a sentence.
   */
  var VOIDED = {
    playerRef: 'p-7',
    playerName: BY_REF['p-7'].lastName,
    // The opening match that seat sits in.
    matches: [{ round: 0, indexInRound: 3 }]
  };

  /* ------------------------------------------------------------ tournaments */

  var TOURNAMENTS = [
    { ref: 'ext-ao-2026',   name: 'Australian Open', surface: 'hard',  startsOn: '2026-01-19', drawSize: 128, weight: 2, status: 'complete' },
    { ref: 'ext-iw-2026',   name: 'Indian Wells',    surface: 'hard',  startsOn: '2026-03-11', drawSize: 96,  weight: 1, status: 'complete' },
    { ref: 'ext-mc-2026',   name: 'Monte-Carlo',     surface: 'clay',  startsOn: '2026-04-12', drawSize: 56,  weight: 1, status: 'complete' },
    { ref: 'ext-rg-2026',   name: 'Roland-Garros',   surface: 'clay',  startsOn: '2026-05-24', drawSize: 128, weight: 2, status: 'complete' },
    { ref: 'ext-wim-2026',  name: 'Wimbledon',       surface: 'grass', startsOn: '2026-06-29', drawSize: 128, weight: 2, status: 'complete' },
    { ref: 'ext-cin-2026',  name: 'Cincinnati Open', surface: 'hard',  startsOn: '2026-08-11', drawSize: 96,  weight: 1, status: 'complete' },
    { ref: 'ext-uso-2026',  name: 'US Open',         surface: 'hard',  startsOn: '2026-08-30', drawSize: 128, weight: 2, status: 'focus' }
  ];

  var US_OPEN = TOURNAMENTS[TOURNAMENTS.length - 1];

  /** The lock. One instant, and the one place in this product where being wrong
      is unrecoverable — so it always gets the day word. 11:00 ET, 30 Aug 2026. */
  var LOCKS_AT = '2026-08-30T15:00:00Z';
  var VENUE_ZONE = 'America/New_York';

  /** A fixed clock per tournament phase, so states are stable across reloads. */
  var CLOCK = {
    pre: '2026-08-28T18:40:00Z',
    live: '2026-09-04T22:15:00Z',
    complete: '2026-09-14T02:30:00Z'
  };

  /* ---------------------------------------------------------------- leagues */

  var MEMBERS = [
    { username: 'you',      displayName: 'Priya Raghunathan', isYou: true },
    { username: 'dmarch',   displayName: 'Danny March' },
    { username: 'aokafor',  displayName: 'Ada Okafor' },
    { username: 'tfoley',   displayName: 'Tom Foley' },
    { username: 'lschmidt', displayName: 'Lena Schmidt' },
    { username: 'jkuroda',  displayName: 'Jun Kuroda' },
    { username: 'rbaptiste',displayName: 'Rosa Baptiste' },
    { username: 'mgill',    displayName: 'Marcus Gill' },
    { username: 'ehalloran',displayName: 'Erin Halloran' },
    { username: 'svaldez',  displayName: 'Sofia Valdez' },
    { username: 'nbrandt',  displayName: 'Nils Brandt' },
    { username: 'ktakahara',displayName: 'Kei Takahara' }
  ];

  var SINGLE_LEAGUE = {
    slug: 'fourth-floor-slam-a1b2c3',
    name: 'Fourth Floor Slam Challenge',
    format: 'single',
    visibility: 'private',
    status: 'active',
    memberCount: 12,
    tournamentCount: 1,
    createdAt: '2026-08-19T09:12:00Z',
    commissioner: 'dmarch'
  };

  var SEASON_LEAGUE = {
    slug: 'matchread-season-7f3d21',
    name: '2026 MatchRead Tennis League',
    format: 'season',
    visibility: 'private',
    status: 'active',
    memberCount: 14,
    tournamentCount: 7,
    createdAt: '2026-01-04T10:00:00Z',
    commissioner: 'you'
  };

  /**
   * A standings row, typed as the projection `league.ts` returns. Every field
   * the production repository supplies is present, including the seven movement
   * columns migration 0018 added — a fixture missing them would let a screen be
   * designed against data the database does not have.
   */
  function row(over) {
    var base = {
      memberId: 'm-' + over.username,
      username: over.username,
      displayName: over.displayName,
      position: over.position,
      finalRank: null,
      seasonPoints: 0,
      submitted: true,
      settled: false,
      isYou: false,
      score: 0,
      previousScore: null,
      previousPosition: null,
      scoreDelta: null,
      positionDelta: null,
      upside: 0,
      championAlive: null,
      championName: null,
      aliveCount: 0,
      hasBracket: true
    };
    Object.keys(over).forEach(function (k) { base[k] = over[k]; });
    return base;
  }

  var name = {};
  MEMBERS.forEach(function (m) { name[m.username] = m.displayName; });

  /* --------------------------------------------------------------- scoring */

  /*
     Transcribed from packages/core/src/tournament/scoring.ts. Weight doubles
     each round anchored at 1, so every round is worth the same in aggregate,
     and naming the champion pays the final round's weight a second time.

       R128 1 · R64 2 · R32 4 · R16 8 · QF 16 · SF 32 · F 64 · champion 64

     A full 128 draw therefore tops out at 512. That number matters here: the
     first version of this fixture had members scoring 604 with 520 still to
     play for, which is not a rounding problem, it is a score that cannot exist.
     Every number below is now derived from a real bracket graded by this rule
     rather than chosen to look plausible.
  */
  function roundWeight(r) { return Math.pow(2, r); }
  var CHAMPION_BONUS = roundWeight(ROUNDS.length - 1);
  var MAX_SCORE = (function () {
    var t = 0;
    for (var r = 0; r < ROUNDS.length; r++) t += ROUNDS[r].matches.length * roundWeight(r);
    return t + CHAMPION_BONUS;
  })();

  /** Which players have not yet lost a decided match. */
  function aliveSet(official, through) {
    var out = {};
    SEATS.forEach(function (seat) { out[seat.ref] = true; });
    for (var r = 0; r <= through; r++) {
      for (var i = 0; i < ROUNDS[r].matches.length; i++) {
        var won = official.winners[r][i];
        if (!won) continue;
        official.participants[r][i].forEach(function (ref) {
          if (ref && ref !== won) out[ref] = false;
        });
      }
    }
    return out;
  }

  /** Grade a bracket against the official draw as far as it has been played. */
  function gradeBracket(bracket, official, through) {
    var score = 0, correct = 0, incorrect = 0;
    for (var r = 0; r <= through; r++) {
      for (var i = 0; i < ROUNDS[r].matches.length; i++) {
        var actual = official.winners[r][i], mine = bracket.winners[r][i];
        if (!actual || !mine) continue;
        if (actual === mine) { score += roundWeight(r); correct++; } else { incorrect++; }
      }
    }
    var last = ROUNDS.length - 1;
    var officialChampion = official.winners[last][0];
    var myChampion = bracket.winners[last][0];
    if (officialChampion && myChampion === officialChampion) score += CHAMPION_BONUS;

    var alive = aliveSet(official, through);
    var upside = 0;
    for (var rr = through + 1; rr < ROUNDS.length; rr++) {
      for (var j = 0; j < ROUNDS[rr].matches.length; j++) {
        var pick = bracket.winners[rr][j];
        if (pick && alive[pick]) upside += roundWeight(rr);
      }
    }
    if (myChampion && alive[myChampion]) upside += CHAMPION_BONUS;

    // "Still alive" counts the players left in the draw that this bracket is
    // still relying on — not every surviving player, which would be the
    // tournament's number rather than the member's.
    var remaining = {}, standing = 0;
    if (through + 1 < ROUNDS.length) {
      official.participants[through + 1].forEach(function (pair) {
        pair.forEach(function (ref) { if (ref && alive[ref]) remaining[ref] = true; });
      });
    }
    var relied = {};
    for (var r2 = through + 1; r2 < ROUNDS.length; r2++) {
      bracket.winners[r2].forEach(function (ref) { if (ref && remaining[ref]) relied[ref] = true; });
    }
    Object.keys(relied).forEach(function () { standing++; });

    return {
      score: score, correct: correct, incorrect: incorrect, upside: upside,
      championName: myChampion ? BY_REF[myChampion].lastName : null,
      championAlive: myChampion ? !!alive[myChampion] : null,
      aliveCount: standing
    };
  }

  /**
   * One bracket per member. `skill` scales the miss rate, so the league has a
   * shape — a couple of sharp readers, a long middle, one member who filled it
   * in during a meeting. Member 1 is the viewer and uses MY_BRACKET.
   */
  var SKILL = [0.85, 0.9, 1.0, 1.15, 1.3, 1.45, 1.6, 1.8, 2.0, 2.2, 2.5];

  function bracketForMember(index, username) {
    var skill = SKILL[index] || 1.6;
    // Ada Okafor also calls the champion, and reads a little better than the
    // viewer. That is a fixture decision with a design reason behind it: it
    // puts the viewer second. "You won" is the easy card to design, and eleven
    // of every twelve members get the other one, so the other one is the card
    // this specification should be showing by default.
    var callsChampion = username === 'aokafor';
    return resolve(function (round, i, a, b) {
      var pick = strength(a) >= strength(b) ? a : b;
      var other = pick === a ? b : a;
      if (callsChampion && pick === CHAMPION) return pick;
      var flip = prng((index + 1) * 7919 + round * 104729 + i * 1301 + 7)();
      var rate = callsChampion
        ? [0.085, 0.07, 0.06, 0.08, 0.10, 0.0, 0.0][round]
        : [0.12, 0.10, 0.09, 0.12, 0.16, 0.10, 0.08][round] * skill;
      return flip < rate ? other : pick;
    });
  }

  var MEMBER_BRACKETS = MEMBERS.map(function (m, i) {
    if (m.username === 'you') return MY_BRACKET;
    if (m.username === 'ktakahara') return null;   // never submitted
    return bracketForMember(i, m.username);
  });

  /** Rank a set of grades, highest score first, ties broken by username. */
  function rankBy(through, official) {
    var rows = [];
    MEMBERS.forEach(function (m, i) {
      var b = MEMBER_BRACKETS[i];
      if (!b) { rows.push({ member: m, grade: null }); return; }
      rows.push({ member: m, grade: gradeBracket(b, official, through) });
    });
    rows.sort(function (x, y) {
      if (!x.grade) return 1;
      if (!y.grade) return -1;
      if (y.grade.score !== x.grade.score) return y.grade.score - x.grade.score;
      return x.member.username < y.member.username ? -1 : 1;
    });
    rows.forEach(function (r, i) { r.position = i + 1; });
    return rows;
  }

  var name = {};
  MEMBERS.forEach(function (m) { name[m.username] = m.displayName; });

  /** Before the lock: who has committed, and nothing about what they picked. */
  var STANDINGS_PRE = MEMBERS.map(function (m, i) {
    return row({
      username: m.username, displayName: m.displayName, position: i + 1,
      isYou: !!m.isYou, submitted: i < 9, hasBracket: i < 10, score: 0
    });
  });

  /**
   * Mid-tournament. The Round of 16 has just finished and the quarter-finals
   * are the day ahead, so "today" is worth 4 x 16 = 64 points and yesterday's
   * movement is a multiple of 8.
   */
  var LIVE_THROUGH = PROGRESS.live;          // 3 — the Round of 16 is complete
  var STANDINGS_LIVE = (function () {
    var now  = rankBy(LIVE_THROUGH, OFFICIAL.live);
    var then = rankBy(LIVE_THROUGH - 1, OFFICIAL.live);
    var wasAt = {};
    then.forEach(function (r) { wasAt[r.member.username] = r; });

    return now.map(function (r) {
      var m = r.member, g = r.grade, before = wasAt[m.username];
      if (!g) {
        return row({
          username: m.username, displayName: m.displayName, position: r.position,
          isYou: !!m.isYou, submitted: false, hasBracket: false,
          score: 0, previousScore: 0, previousPosition: r.position,
          scoreDelta: 0, positionDelta: 0, upside: 0,
          championAlive: null, championName: null, aliveCount: 0
        });
      }
      return row({
        username: m.username, displayName: m.displayName, position: r.position,
        isYou: !!m.isYou,
        score: g.score,
        previousScore: before.grade.score,
        previousPosition: before.position,
        scoreDelta: g.score - before.grade.score,
        positionDelta: before.position - r.position,
        upside: g.upside,
        championAlive: g.championAlive,
        championName: g.championName,
        aliveCount: g.aliveCount
      });
    });
  })();

  /** Finished. Final ranks are frozen and the league is settled. */
  var STANDINGS_COMPLETE = (function () {
    var final = rankBy(ROUNDS.length - 1, OFFICIAL.complete);
    return final.map(function (r) {
      var m = r.member, g = r.grade;
      return row({
        username: m.username, displayName: m.displayName, position: r.position,
        isYou: !!m.isYou, settled: true, finalRank: r.position,
        submitted: !!g, hasBracket: !!g,
        score: g ? g.score : 0,
        previousScore: null, previousPosition: null,
        scoreDelta: null, positionDelta: null,
        upside: 0,
        championAlive: g ? g.championAlive : null,
        championName: g ? g.championName : null,
        aliveCount: 0
      });
    });
  })();

  var YOUR_RESULT = (function () {
    var g = gradeBracket(MY_BRACKET, OFFICIAL.complete, ROUNDS.length - 1);
    var mine = null;
    STANDINGS_COMPLETE.forEach(function (r) { if (r.isYou) mine = r; });
    return {
      score: g.score,
      max: MAX_SCORE,
      percent: Math.round((g.score / MAX_SCORE) * 100),
      correct: g.correct,
      total: g.correct + g.incorrect,
      position: mine ? mine.position : null,
      of: MEMBERS.length,
      championName: g.championName,
      calledChampion: g.championName === BY_REF[OFFICIAL.complete.winners[ROUNDS.length - 1][0]].lastName
    };
  })();

  /*
     Season points are NOT a sum of tournament scores. Per
     packages/core/src/tournament/season.ts, each event contributes

         round(1000 x score / maxPossible x weight)

     on a fixed 0-1000 scale, so a perfect bracket is worth 1000 at Geneva and
     1000 at Flushing Meadows and the season is not just a table of who entered
     the biggest draws. The bound here is therefore played x 1000, and a strong
     reader across mixed tiers lands somewhere north of 500 an event.
  */
  var SEASON_STANDINGS = [
    { position: 1, displayName: name.you,       username: 'you',       isYou: true, played: 6, wins: 2, points: 3184 },
    { position: 2, displayName: name.aokafor,   username: 'aokafor',   played: 6, wins: 2, points: 3102 },
    { position: 3, displayName: name.jkuroda,   username: 'jkuroda',   played: 6, wins: 1, points: 2946 },
    { position: 4, displayName: name.dmarch,    username: 'dmarch',    played: 6, wins: 1, points: 2810 },
    { position: 5, displayName: name.lschmidt,  username: 'lschmidt',  played: 5, wins: 0, points: 2402 },
    { position: 6, displayName: name.rbaptiste, username: 'rbaptiste', played: 6, wins: 0, points: 2388 },
    { position: 7, displayName: name.tfoley,    username: 'tfoley',    played: 5, wins: 0, points: 2140 },
    { position: 8, displayName: name.mgill,     username: 'mgill',     played: 4, wins: 0, points: 1704 }
  ];;;

  /*
     Numbers the Daily Check quotes, derived rather than written. A check that
     says "up 1 place" beside a standings table showing a drop is the exact
     failure the three-check design exists to avoid: this panel is the product's
     voice, and it is only worth anything if it is never wrong.
  */
  var YOU_LIVE = (function () {
    var mine = null;
    STANDINGS_LIVE.forEach(function (r) { if (r.isYou) mine = r; });
    return mine;
  })();
  var LEADER_LIVE = STANDINGS_LIVE[0];

  var ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th',
                 '9th', '10th', '11th', '12th'];

  /** Points available on the round now in progress. */
  var TODAY_POINTS = ROUNDS[LIVE_THROUGH + 1]
    ? ROUNDS[LIVE_THROUGH + 1].matches.length * roundWeight(LIVE_THROUGH + 1)
    : 0;
  var TODAY_MATCHES = ROUNDS[LIVE_THROUGH + 1] ? ROUNDS[LIVE_THROUGH + 1].matches.length : 0;

  var MOVE = Math.abs(YOU_LIVE.positionDelta);
  var MOVE_WORD = YOU_LIVE.positionDelta > 0 ? 'Up' : 'Down';
  var PLACES = MOVE === 1 ? 'place' : 'places';
  var GAP = LEADER_LIVE.score - YOU_LIVE.score;

  /* ------------------------------------------------------- the daily check */
  /*
     Frames and beats are copied from packages/i18n/src/messages/en.ts and
     composed exactly as packages/core/src/league/pulse.ts composes them: one
     headline, one detail, then the rest as beats. Nothing here is new copy.
  */

  var CHECKS = {
    draw_pending: {
      frame: 'Between tournaments',
      emotion: 'flat',
      headline: 'Your league is ready.',
      detail: 'Invite your friends now. The bracket opens the moment the official US Open draw is released.',
      action: { label: 'Copy invite link', href: '#/league' },
      beats: [
        { emotion: 'flat', headline: '3 members joined since the last draw.', detail: 'The draw lands first. You will want to be here for it.' },
        { emotion: 'flat', headline: 'US Open in 2 days.', detail: 'The draw lands first. You will want to be here for it.' }
      ]
    },
    awaiting_entries: {
      frame: 'This morning',
      emotion: 'flat',
      headline: '3 brackets are still missing.',
      detail: '9 of 12 are in. Nudge the stragglers before the draw locks.',
      action: { label: 'Open my bracket', href: '#/bracket' },
      beats: [
        { emotion: 'bad',  headline: 'The draw locks in 4 hours.', detail: 'Last chance to change your mind.' },
        { emotion: 'flat', headline: 'Your bracket is not in yet.', detail: 'Fill it in before the US Open draw locks — after that the field is the field.' }
      ]
    },
    live_morning: {
      frame: 'This morning',
      emotion: 'good',
      headline: MOVE === 0
        ? 'You held your place overnight.'
        : MOVE_WORD + ' ' + MOVE + ' ' + PLACES + ' overnight.',
      detail: 'You are ' + ORDINAL[YOU_LIVE.position] + ' in your league.',
      action: { label: 'View my bracket', href: '#/bracket' },
      beats: [
        { emotion: 'flat', headline: TODAY_POINTS + ' points on the line today.', detail: 'Across ' + TODAY_MATCHES + ' matches you have a pick in.' },
        { emotion: 'good', headline: 'Aldecoa is still standing.', detail: 'Your bracket lives or dies with them.' },
        { emotion: 'bad',  headline: LEADER_LIVE.displayName + ' is ' + GAP + ' points ahead.', detail: 'They have ' + LEADER_LIVE.upside + ' left to play for. You have ' + YOU_LIVE.upside + '.' }
      ]
    },
    live_now: {
      frame: 'Live now',
      emotion: 'good',
      headline: '2 of your picks are on court.',
      detail: 'Your standing moves the moment this finishes.',
      action: { label: 'View my bracket', href: '#/bracket' },
      beats: [
        { emotion: 'flat', headline: 'Aldecoa plays the Quarter-final.', detail: 'Your whole bracket is behind them. Everything you can still win runs through this one.' },
        { emotion: 'flat', headline: 'You are level with Jun Kuroda.', detail: 'Whoever moves first takes it.' }
      ]
    },
    live_evening: {
      frame: 'Tonight',
      emotion: 'good',
      headline: '+22 today.',
      detail: '3 of your picks came through, 1 did not.',
      action: { label: 'View my bracket', href: '#/bracket' },
      beats: [
        { emotion: 'good', headline: 'You can still win this.', detail: (YOU_LIVE.score + YOU_LIVE.upside) + ' points is your ceiling from here. You are ' + ORDINAL[YOU_LIVE.position] + ' now.' },
        { emotion: 'flat', headline: 'One of your picks plays tomorrow.', detail: roundWeight(LIVE_THROUGH + 1) + ' points on the line. Come back and watch it happen.' }
      ]
    },
    quiet: {
      frame: 'Tonight',
      emotion: 'flat',
      headline: 'A quiet day in your league.',
      detail: 'Nothing moved. The next round changes that.',
      action: null,
      beats: [
        { emotion: 'flat', headline: 'None of your picks play today.', detail: 'A rest day. Your bracket is exactly where you left it, and tomorrow it moves again.' }
      ]
    },
    champion_out: {
      frame: 'Tonight',
      emotion: 'bad',
      // The un-named variant of this key, deliberately. The named one would
      // contradict the settled fixture, where the champion goes all the way.
      headline: 'Your champion is out.',
      detail: 'Your ceiling stopped moving. Everything still to play for is in the rounds below.',
      action: { label: 'View my bracket', href: '#/bracket' },
      beats: [
        { emotion: 'bad',  headline: 'Down 2 places overnight.', detail: 'You are 4th. Your picks are still on court.' },
        { emotion: 'flat', headline: '3 of your picks are still in.', detail: 'Every round they survive is points.' }
      ]
    },
    bracket_stale: {
      frame: 'This morning',
      emotion: 'bad',
      headline: 'Halvorsen is out of the draw.',
      detail: 'Your bracket still names them. Change it before the US Open draw locks — after that it cannot be fixed.',
      action: { label: 'Open my bracket', href: '#/bracket' },
      beats: [
        { emotion: 'flat', headline: 'The draw locks in 6 hours.', detail: 'Last chance to change your mind.' }
      ]
    },
    picks_voided: {
      frame: 'This morning',
      emotion: 'flat',
      headline: 'Halvorsen withdrew without playing.',
      detail: 'Not wrong — void. Nobody could read a match that never happened, so 1 pick came off your ceiling instead of your score.',
      action: { label: 'View my bracket', href: '#/bracket' },
      beats: [
        { emotion: 'flat', headline: 'You are ' + ORDINAL[YOU_LIVE.position] + ' in your league.', detail: 'Your picks are still on court.' }
      ]
    },
    final: {
      frame: 'Tonight',
      emotion: 'good',
      headline: 'You finished 2nd of 12.',
      detail: 'The next tournament resets everything.',
      action: { label: 'See the full result', href: '#/result' },
      beats: [
        { emotion: 'good', headline: 'Called Aldecoa to win it. Aldecoa won it.', detail: 'Backed the champion from the first round.' },
        { emotion: 'flat', headline: '1st of 14 in the season.', detail: '3,184 points banked. Every tournament moves it.' }
      ]
    },
    no_data: {
      frame: 'This morning',
      emotion: 'flat',
      headline: 'Nothing to report yet.',
      detail: 'No brackets have been entered for US Open. The moment somebody enters, this page starts moving.',
      action: { label: 'Open my bracket', href: '#/bracket' },
      beats: []
    }
  };

  /* -------------------------------------------------------------- rankings */

  var RANKED = SEATS.filter(function (s) { return s.seed; })
    .sort(function (a, b) { return a.seed - b.seed; })
    .map(function (s, i) {
      return {
        ref: s.ref, lastName: s.lastName, countryCode: s.countryCode,
        rank: i + 1, points: 9800 - i * 245, tour: i % 5 === 0 ? 'wta' : 'atp'
      };
    });

  /* ---------------------------------------------------------------- export */

  MR.data = {
    DRAW_SIZE: DRAW_SIZE,
    SEATS: SEATS,
    BY_REF: BY_REF,
    ROUNDS: ROUNDS,
    TOTAL_MATCHES: TOTAL_MATCHES,
    OFFICIAL: OFFICIAL,
    MY_BRACKET: MY_BRACKET,
    MEMBER_BRACKETS: MEMBER_BRACKETS,
    YOUR_RESULT: YOUR_RESULT,
    MAX_SCORE: MAX_SCORE,
    roundWeight: roundWeight,
    gradeBracket: gradeBracket,
    aliveSet: aliveSet,
    PARTIAL_BRACKET: PARTIAL_BRACKET,
    VOIDED: VOIDED,
    TOURNAMENTS: TOURNAMENTS,
    US_OPEN: US_OPEN,
    LOCKS_AT: LOCKS_AT,
    VENUE_ZONE: VENUE_ZONE,
    CLOCK: CLOCK,
    MEMBERS: MEMBERS,
    SINGLE_LEAGUE: SINGLE_LEAGUE,
    SEASON_LEAGUE: SEASON_LEAGUE,
    STANDINGS_PRE: STANDINGS_PRE,
    STANDINGS_LIVE: STANDINGS_LIVE,
    STANDINGS_COMPLETE: STANDINGS_COMPLETE,
    SEASON_STANDINGS: SEASON_STANDINGS,
    CHECKS: CHECKS,
    RANKED: RANKED,
    resolve: resolve,
    roundLabel: roundLabel
  };
})();
