/**
 * Daily Check pulse — one headline, one detail, optional beats.
 * Numbers must come from standings/snapshots the caller already loaded;
 * never invent deltas that could contradict the table.
 *
 * Copy is phrased through `say` (fix list P2-9). Core stays language-free:
 * English is the default (`PULSE_EN`), and the web passes its catalogue.
 */

import type { BracketHealth, BiggestMiss } from "./engagement";

export type PulseEmotion = "good" | "bad" | "flat";

export type PulseBeat = {
  emotion: PulseEmotion;
  headline: string;
  detail: string;
};

export type PulseAction = {
  label: string;
  href: string;
};

export type PulseKind =
  | "draw_pending"
  | "awaiting_entries"
  | "no_data"
  | "live"
  | "quiet"
  | "champion_out"
  | "final"
  | "picks_voided";

/** Kinds whose headline is this member's submitted, settled bracket. */
const PERSONAL_DAILY_CHECK_KINDS: ReadonlySet<PulseKind> = new Set([
  "live",
  "quiet",
  "champion_out",
  "final",
  "picks_voided",
]);

/**
 * Daily Check is a personal fact: this viewer submitted, and settlement
 * produced a standing. Pending-draw / missing-entry / sample copy is not.
 */
export function isPersonalDailyCheck(input: {
  youSubmitted: boolean;
  kind: PulseKind;
}): boolean {
  return input.youSubmitted && PERSONAL_DAILY_CHECK_KINDS.has(input.kind);
}

export type DailyCheck = {
  kind: PulseKind;
  frame: string;
  emotion: PulseEmotion;
  headline: string;
  detail: string;
  action: PulseAction | null;
  beats: PulseBeat[];
  eventName: string;
};

export type StandingPulseRow = {
  position: number;
  previousPosition: number | null;
  /** Positive = moved up the table (rank improved). */
  positionDelta: number | null;
  score: number;
  previousScore: number | null;
  scoreDelta: number | null;
  upside: number;
  championAlive: boolean | null;
  voidedPicks: number;
  championRef: string | null;
  championName: string | null;
};

/** English copy. The web catalogue mirrors these keys under `pulse.*`. */
export const PULSE_EN = {
  "frame.today": "Today",
  "frame.morning": "This morning",
  "frame.afternoon": "Live now",
  "frame.evening": "Tonight",
  "frame.between": "Between tournaments",
  "action.viewBracket": "View my bracket",
  "action.openBracket": "Open my bracket",
  "action.invite": "Invite friends",
  "action.result": "See the full result",
  "action.tournament": "Open tournament",
  "health.elite": "Elite",
  "health.surviving": "Surviving",
  "health.hanging_on": "Hanging On",
  "health.in_trouble": "In Trouble",
  "beat.health": "Bracket health: {health}.",
  "beat.perfectAlive.one": "{n} perfect pick still alive.",
  "beat.perfectAlive.other": "{n} perfect picks still alive.",
  "beat.healthDerived": "Derived from your ceiling and champion status.",
  "beat.perfectRemaining.one": "{n} perfect pick remaining.",
  "beat.perfectRemaining.other": "{n} perfect picks remaining.",
  "beat.perfectBrackets.one": "{n} bracket is still perfect in the league.",
  "beat.perfectBrackets.other": "{n} brackets are still perfect in the league.",
  "beat.stillOnCourt": "Still on court.",
  "beat.biggestMiss": "Biggest miss: {name}.",
  "beat.cost.one": "Cost {n} point.",
  "beat.cost.other": "Cost {n} points.",
  "draw.headline": "Your league is ready.",
  "draw.detail":
    "Invite your friends now. The bracket opens the moment the official {event} draw is released.",
  "draw.members.one": "{n} member in the league.",
  "draw.members.other": "{n} members in the league.",
  "draw.membersDetail": "The draw lands first. You will want to be here for it.",
  "empty.headline": "Nothing to report yet.",
  "empty.detail":
    "No brackets have been entered for {event}. The moment somebody enters, this page starts moving.",
  "awaiting.missing.one": "{n} bracket is still missing.",
  "awaiting.missing.other": "{n} brackets are still missing.",
  "awaiting.detail": "{submitted} of {members} are in. Nudge the stragglers before the draw locks.",
  "awaiting.youIn": "Your bracket is in.",
  "awaiting.youOut": "Your bracket is not in yet.",
  "awaiting.youInDetail": "You can still edit until the lock.",
  "awaiting.youOutDetail": "Fill it in before {event} locks — after that the field is the field.",
  "final.championWon": "Called {name} to win it. They won it.",
  "final.championWas": "Your champion was {name}.",
  "final.championRecorded": "Champion pick recorded.",
  "final.headline": "You finished {position} of {field}.",
  "final.detail": "The next tournament resets everything.",
  "final.score": "Score {score}.",
  "final.season": "{position} in the season.",
  "final.seasonPoints": "{points} points banked.",
  "final.seasonLive": "Season table is live.",
  "voided.headline.one": "{n} pick was voided.",
  "voided.headline.other": "{n} picks were voided.",
  "voided.detail":
    "Not wrong — void. Nobody could read a match that never happened, so those picks came off your ceiling instead of your score.",
  "voided.position": "You are {position} in your league.",
  "voided.remaining": "Your remaining picks are still on court.",
  "move.up.one": "Up {n} place.",
  "move.up.other": "Up {n} places.",
  "move.down.one": "Down {n} place.",
  "move.down.other": "Down {n} places.",
  "move.position": "You are {position}.",
  "champion.otherPicks": "Your other picks are still on court.",
  "champion.headline": "Your champion is out.",
  "champion.detail":
    "Your ceiling stopped moving. Everything still to play for is in the rounds below.",
  "quiet.headline": "A quiet day in your league.",
  "quiet.detail": "Nothing moved. The next round changes that.",
  "quiet.score": "Score {score}.",
  "quiet.scoreUpside": "Score {score} · {upside} still to play for.",
  "live.position": "You are {position} in your league.",
  "live.scoreDelta": "{delta} on the score.",
  "live.score": "Score {score}.",
  "live.gap": "{leader} is {gap} points ahead.",
  "live.gapDetail": "They have {leaderUpside} left to play for. You have {upside}.",
  "live.canWin": "You can still win this.",
  "live.ceiling": "{ceiling} points is your ceiling from here.",
  "live.held": "You held your place.",
  "settling.headline": "Standings are waiting on settlement.",
  "settling.detail": "Brackets are in for {event}. Standings move when the settlement job runs.",
} as const;

export type PulseCopyKey = keyof typeof PULSE_EN;
export type PulseSay = (
  key: PulseCopyKey,
  vars?: Record<string, string | number>
) => string;

/** Fills `{name}` placeholders; an unknown placeholder is left as is. */
export function fillCopy(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (all, name: string) =>
    vars[name] === undefined ? all : String(vars[name])
  );
}

const sayEnglish: PulseSay = (key, vars) => fillCopy(PULSE_EN[key], vars);

type PluralBase =
  | "beat.perfectAlive"
  | "beat.perfectRemaining"
  | "beat.perfectBrackets"
  | "beat.cost"
  | "draw.members"
  | "awaiting.missing"
  | "voided.headline"
  | "move.up"
  | "move.down";

/** Picks the `.one` or `.other` key and passes `n`. */
function plural(say: PulseSay, base: PluralBase, n: number): string {
  return say(`${base}.${n === 1 ? "one" : "other"}` as PulseCopyKey, { n });
}

const HEALTH_KEY: Record<BracketHealth, PulseCopyKey> = {
  Elite: "health.elite",
  Surviving: "health.surviving",
  "Hanging On": "health.hanging_on",
  "In Trouble": "health.in_trouble",
};

export type PulseInput = {
  eventName: string;
  leagueSlug: string;
  tournamentRef: string | null;
  memberCount: number;
  submittedCount: number;
  /** Whether the viewing member has submitted an entry. */
  youSubmitted: boolean;
  hasDraw: boolean;
  locked: boolean;
  /** True when official final exists and snapshots are graded. */
  eventComplete: boolean;
  you: StandingPulseRow | null;
  leader: { score: number; upside: number; label: string } | null;
  fieldSize: number;
  seasonPosition: number | null;
  seasonPoints: number | null;
  /** Hour 0–23 in the viewer's zone (caller supplies). */
  hour?: number;
  /** Optional Tier 1 engagement facts — only when caller computed them. */
  bracketHealth?: BracketHealth | null;
  biggestMiss?: (BiggestMiss & { playerName?: string | null }) | null;
  perfectPicksRemaining?: number | null;
  perfectBracketCount?: number | null;
  /** Phrases one message in the viewer's language. Defaults to English. */
  say?: PulseSay;
  /** Ordinal in the viewer's language. Defaults to English (`ordinal`). */
  ordinal?: (n: number) => string;
  /** Number formatting in the viewer's language. Defaults to en-GB. */
  formatNumber?: (n: number) => string;
};

const ORDINAL = [
  "",
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
  "11th",
  "12th",
  "13th",
  "14th",
  "15th",
  "16th",
];

export function ordinal(n: number): string {
  if (n >= 1 && n < ORDINAL.length) return ORDINAL[n];
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function frameForHour(say: PulseSay, hour: number | undefined): string {
  if (hour == null) return say("frame.today");
  if (hour < 12) return say("frame.morning");
  if (hour < 17) return say("frame.afternoon");
  return say("frame.evening");
}

function bracketHref(leagueSlug: string, tournamentRef: string | null): string {
  if (!tournamentRef) return `/leagues/${leagueSlug}`;
  return `/leagues/${leagueSlug}/t/${tournamentRef}/bracket`;
}

function tournamentHref(
  leagueSlug: string,
  tournamentRef: string | null
): string {
  if (!tournamentRef) return `/leagues/${leagueSlug}`;
  return `/leagues/${leagueSlug}/t/${tournamentRef}`;
}

function resultHref(leagueSlug: string, tournamentRef: string | null): string {
  if (!tournamentRef) return `/leagues/${leagueSlug}`;
  return `/leagues/${leagueSlug}/t/${tournamentRef}/result`;
}

function engagementBeats(input: PulseInput, say: PulseSay): PulseBeat[] {
  const beats: PulseBeat[] = [];

  if (input.bracketHealth) {
    const healthEmotion: PulseEmotion =
      input.bracketHealth === "Elite" || input.bracketHealth === "Surviving"
        ? "good"
        : input.bracketHealth === "In Trouble"
          ? "bad"
          : "flat";
    beats.push({
      emotion: healthEmotion,
      headline: say("beat.health", { health: say(HEALTH_KEY[input.bracketHealth]) }),
      detail:
        input.perfectPicksRemaining != null
          ? plural(say, "beat.perfectAlive", input.perfectPicksRemaining)
          : say("beat.healthDerived"),
    });
  } else if (input.perfectPicksRemaining != null) {
    beats.push({
      emotion: "flat",
      headline: plural(say, "beat.perfectRemaining", input.perfectPicksRemaining),
      detail:
        input.perfectBracketCount != null
          ? plural(say, "beat.perfectBrackets", input.perfectBracketCount)
          : say("beat.stillOnCourt"),
    });
  }

  if (input.biggestMiss) {
    const name = input.biggestMiss.playerName ?? input.biggestMiss.playerRef;
    beats.push({
      emotion: "bad",
      headline: say("beat.biggestMiss", { name }),
      detail: plural(say, "beat.cost", input.biggestMiss.weight),
    });
  }

  return beats;
}

function withEngagement(
  check: DailyCheck,
  input: PulseInput,
  say: PulseSay
): DailyCheck {
  // Finished event: placement is the story. Live health / perfect-remaining /
  // biggest-miss beats contradict a celebration (or a quiet final).
  if (input.eventComplete || check.kind === "final") {
    return check;
  }
  const extra = engagementBeats(input, say);
  if (extra.length === 0) return check;
  return { ...check, beats: [...check.beats, ...extra] };
}

/**
 * Compose the Daily Check from league + standings facts.
 * Priority mirrors the wireframe family, implemented incrementally.
 */
export function computeDailyCheck(input: PulseInput): DailyCheck {
  const {
    eventName,
    leagueSlug,
    tournamentRef,
    memberCount,
    submittedCount,
    youSubmitted,
    hasDraw,
    locked,
    eventComplete,
    you,
    leader,
    fieldSize,
    seasonPosition,
    seasonPoints,
  } = input;
  const say = input.say ?? sayEnglish;
  const nth = input.ordinal ?? ordinal;
  const num = input.formatNumber ?? ((n: number) => n.toLocaleString("en-GB"));
  const done = (check: DailyCheck) => withEngagement(check, input, say);
  const frame = frameForHour(say, input.hour);
  const openBracket = {
    label: say(you?.score != null && locked ? "action.viewBracket" : "action.openBracket"),
    href: bracketHref(leagueSlug, tournamentRef),
  };

  if (!hasDraw) {
    return done({
      kind: "draw_pending",
      frame: say("frame.between"),
      emotion: "flat",
      headline: say("draw.headline"),
      detail: say("draw.detail", { event: eventName }),
      action: {
        label: say("action.invite"),
        href: `/leagues/${leagueSlug}?invite=1`,
      },
      beats: [
        {
          emotion: "flat",
          headline: plural(say, "draw.members", memberCount),
          detail: say("draw.membersDetail"),
        },
      ],
      eventName,
    });
  }

  if (submittedCount === 0) {
    return done({
      kind: "no_data",
      frame,
      emotion: "flat",
      headline: say("empty.headline"),
      detail: say("empty.detail", { event: eventName }),
      action: openBracket,
      beats: [],
      eventName,
    });
  }

  if (!locked && submittedCount < memberCount) {
    const missing = memberCount - submittedCount;
    return done({
      kind: "awaiting_entries",
      frame,
      emotion: "flat",
      headline: plural(say, "awaiting.missing", missing),
      detail: say("awaiting.detail", { submitted: submittedCount, members: memberCount }),
      action: openBracket,
      beats: [
        {
          emotion: "flat",
          headline: say(youSubmitted ? "awaiting.youIn" : "awaiting.youOut"),
          detail: youSubmitted
            ? say("awaiting.youInDetail")
            : say("awaiting.youOutDetail", { event: eventName }),
        },
      ],
      eventName,
    });
  }

  if (eventComplete && you) {
    const championLine =
      you.championName && you.championAlive === true
        ? say("final.championWon", { name: you.championName })
        : you.championName
          ? say("final.championWas", { name: you.championName })
          : say("final.championRecorded");
    return done({
      kind: "final",
      frame: say("frame.evening"),
      emotion: you.position === 1 ? "good" : "flat",
      headline: say("final.headline", { position: nth(you.position), field: fieldSize }),
      detail: say("final.detail"),
      action: {
        label: say("action.result"),
        href: resultHref(leagueSlug, tournamentRef),
      },
      beats: [
        {
          emotion: you.championAlive === true ? "good" : "flat",
          headline: championLine,
          detail: say("final.score", { score: you.score }),
        },
        ...(seasonPosition != null
          ? [
              {
                emotion: "flat" as const,
                headline: say("final.season", { position: nth(seasonPosition) }),
                detail:
                  seasonPoints != null
                    ? say("final.seasonPoints", { points: num(seasonPoints) })
                    : say("final.seasonLive"),
              },
            ]
          : []),
      ],
      eventName,
    });
  }

  if (you && you.voidedPicks > 0) {
    return done({
      kind: "picks_voided",
      frame,
      emotion: "flat",
      headline: plural(say, "voided.headline", you.voidedPicks),
      detail: say("voided.detail"),
      action: {
        label: say("action.viewBracket"),
        href: bracketHref(leagueSlug, tournamentRef),
      },
      beats: [
        {
          emotion: "flat",
          headline: say("voided.position", { position: nth(you.position) }),
          detail: say("voided.remaining"),
        },
      ],
      eventName,
    });
  }

  if (you && you.championAlive === false) {
    const move = Math.abs(you.positionDelta ?? 0);
    const moveBeat =
      you.positionDelta != null && you.positionDelta !== 0
        ? {
            emotion: "bad" as const,
            headline: plural(say, you.positionDelta > 0 ? "move.up" : "move.down", move),
            detail: say("move.position", { position: nth(you.position) }),
          }
        : {
            emotion: "flat" as const,
            headline: say("move.position", { position: nth(you.position) }),
            detail: say("champion.otherPicks"),
          };
    return done({
      kind: "champion_out",
      frame,
      emotion: "bad",
      headline: say("champion.headline"),
      detail: say("champion.detail"),
      action: {
        label: say("action.viewBracket"),
        href: bracketHref(leagueSlug, tournamentRef),
      },
      beats: [moveBeat],
      eventName,
    });
  }

  if (you) {
    const delta = you.positionDelta;
    const scoreDelta = you.scoreDelta;
    const quiet =
      (delta == null || delta === 0) &&
      (scoreDelta == null || scoreDelta === 0);

    if (quiet) {
      return done({
        kind: "quiet",
        frame,
        emotion: "flat",
        headline: say("quiet.headline"),
        detail: say("quiet.detail"),
        action: null,
        beats: [
          {
            emotion: "flat",
            headline: say("move.position", { position: nth(you.position) }),
            detail:
              you.upside > 0
                ? say("quiet.scoreUpside", { score: you.score, upside: you.upside })
                : say("quiet.score", { score: you.score }),
          },
        ],
        eventName,
      });
    }

    const move = Math.abs(delta ?? 0);
    const gap =
      leader && leader.score > you.score ? leader.score - you.score : null;

    const beats: PulseBeat[] = [
      {
        emotion: "flat",
        headline: say("live.position", { position: nth(you.position) }),
        detail:
          scoreDelta != null && scoreDelta !== 0
            ? say("live.scoreDelta", { delta: `${scoreDelta > 0 ? "+" : ""}${scoreDelta}` })
            : say("live.score", { score: you.score }),
      },
    ];
    if (gap != null && leader) {
      beats.push({
        emotion: "bad",
        headline: say("live.gap", { leader: leader.label, gap }),
        detail: say("live.gapDetail", { leaderUpside: leader.upside, upside: you.upside }),
      });
    } else if (you.upside > 0) {
      beats.push({
        emotion: "good",
        headline: say("live.canWin"),
        detail: say("live.ceiling", { ceiling: you.score + you.upside }),
      });
    }

    return done({
      kind: "live",
      frame,
      emotion: (delta ?? 0) >= 0 ? "good" : "bad",
      headline:
        delta === 0 || delta == null
          ? say("live.held")
          : plural(say, (delta ?? 0) > 0 ? "move.up" : "move.down", move),
      detail: say("live.position", { position: nth(you.position) }),
      action: {
        label: say("action.viewBracket"),
        href: bracketHref(leagueSlug, tournamentRef),
      },
      beats,
      eventName,
    });
  }

  // Locked / submitted field but this member has no snapshot yet
  return done({
    kind: "awaiting_entries",
    frame,
    emotion: "flat",
    headline: say("settling.headline"),
    detail: say("settling.detail", { event: eventName }),
    action: {
      label: say("action.tournament"),
      href: tournamentHref(leagueSlug, tournamentRef),
    },
    beats: [],
    eventName,
  });
}
