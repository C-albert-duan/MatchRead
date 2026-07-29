/**
 * Daily Check pulse — one headline, one detail, optional beats.
 * Numbers must come from standings/snapshots the caller already loaded;
 * never invent deltas that could contradict the table.
 */

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

function frameForHour(hour: number | undefined): string {
  if (hour == null) return "Today";
  if (hour < 12) return "This morning";
  if (hour < 17) return "Live now";
  return "Tonight";
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
  const frame = frameForHour(input.hour);
  const openBracket = {
    label: you?.score != null && locked ? "View my bracket" : "Open my bracket",
    href: bracketHref(leagueSlug, tournamentRef),
  };

  if (!hasDraw) {
    return {
      kind: "draw_pending",
      frame: "Between tournaments",
      emotion: "flat",
      headline: "Your league is ready.",
      detail: `Invite your friends now. The bracket opens the moment the official ${eventName} draw is released.`,
      action: {
        label: "Invite friends",
        href: `/leagues/${leagueSlug}?invite=1`,
      },
      beats: [
        {
          emotion: "flat",
          headline: `${memberCount} ${memberCount === 1 ? "member" : "members"} in the league.`,
          detail: "The draw lands first. You will want to be here for it.",
        },
      ],
      eventName,
    };
  }

  if (submittedCount === 0) {
    return {
      kind: "no_data",
      frame,
      emotion: "flat",
      headline: "Nothing to report yet.",
      detail: `No brackets have been entered for ${eventName}. The moment somebody enters, this page starts moving.`,
      action: openBracket,
      beats: [],
      eventName,
    };
  }

  if (!locked && submittedCount < memberCount) {
    const missing = memberCount - submittedCount;
    return {
      kind: "awaiting_entries",
      frame,
      emotion: "flat",
      headline:
        missing === 1
          ? "1 bracket is still missing."
          : `${missing} brackets are still missing.`,
      detail: `${submittedCount} of ${memberCount} are in. Nudge the stragglers before the draw locks.`,
      action: openBracket,
      beats: [
        {
          emotion: "flat",
          headline: youSubmitted
            ? "Your bracket is in."
            : "Your bracket is not in yet.",
          detail: youSubmitted
            ? "You can still edit until the lock."
            : `Fill it in before ${eventName} locks — after that the field is the field.`,
        },
      ],
      eventName,
    };
  }

  if (eventComplete && you) {
    const championLine =
      you.championName && you.championAlive === true
        ? `Called ${you.championName} to win it. They won it.`
        : you.championName
          ? `Your champion was ${you.championName}.`
          : "Champion pick recorded.";
    return {
      kind: "final",
      frame: "Tonight",
      emotion: you.position === 1 ? "good" : "flat",
      headline: `You finished ${ordinal(you.position)} of ${fieldSize}.`,
      detail: "The next tournament resets everything.",
      action: {
        label: "See the full result",
        href: resultHref(leagueSlug, tournamentRef),
      },
      beats: [
        {
          emotion: you.championAlive === true ? "good" : "flat",
          headline: championLine,
          detail: `Score ${you.score}.`,
        },
        ...(seasonPosition != null
          ? [
              {
                emotion: "flat" as const,
                headline: `${ordinal(seasonPosition)} in the season.`,
                detail:
                  seasonPoints != null
                    ? `${seasonPoints.toLocaleString("en-GB")} points banked.`
                    : "Season table is live.",
              },
            ]
          : []),
      ],
      eventName,
    };
  }

  if (you && you.voidedPicks > 0) {
    return {
      kind: "picks_voided",
      frame,
      emotion: "flat",
      headline:
        you.voidedPicks === 1
          ? "1 pick was voided."
          : `${you.voidedPicks} picks were voided.`,
      detail:
        "Not wrong — void. Nobody could read a match that never happened, so those picks came off your ceiling instead of your score.",
      action: {
        label: "View my bracket",
        href: bracketHref(leagueSlug, tournamentRef),
      },
      beats: [
        {
          emotion: "flat",
          headline: `You are ${ordinal(you.position)} in your league.`,
          detail: "Your remaining picks are still on court.",
        },
      ],
      eventName,
    };
  }

  if (you && you.championAlive === false) {
    const move = Math.abs(you.positionDelta ?? 0);
    const moveBeat =
      you.positionDelta != null && you.positionDelta !== 0
        ? {
            emotion: "bad" as const,
            headline:
              you.positionDelta > 0
                ? `Up ${move} ${move === 1 ? "place" : "places"}.`
                : `Down ${move} ${move === 1 ? "place" : "places"}.`,
            detail: `You are ${ordinal(you.position)}.`,
          }
        : {
            emotion: "flat" as const,
            headline: `You are ${ordinal(you.position)}.`,
            detail: "Your other picks are still on court.",
          };
    return {
      kind: "champion_out",
      frame,
      emotion: "bad",
      headline: "Your champion is out.",
      detail:
        "Your ceiling stopped moving. Everything still to play for is in the rounds below.",
      action: {
        label: "View my bracket",
        href: bracketHref(leagueSlug, tournamentRef),
      },
      beats: [moveBeat],
      eventName,
    };
  }

  if (you) {
    const delta = you.positionDelta;
    const scoreDelta = you.scoreDelta;
    const quiet =
      (delta == null || delta === 0) &&
      (scoreDelta == null || scoreDelta === 0);

    if (quiet) {
      return {
        kind: "quiet",
        frame,
        emotion: "flat",
        headline: "A quiet day in your league.",
        detail: "Nothing moved. The next round changes that.",
        action: null,
        beats: [
          {
            emotion: "flat",
            headline: `You are ${ordinal(you.position)}.`,
            detail: `Score ${you.score}${you.upside > 0 ? ` · ${you.upside} still to play for` : ""}.`,
          },
        ],
        eventName,
      };
    }

    const move = Math.abs(delta ?? 0);
    const moveWord = (delta ?? 0) > 0 ? "Up" : "Down";
    const places = move === 1 ? "place" : "places";
    const gap =
      leader && leader.score > you.score ? leader.score - you.score : null;

    const beats: PulseBeat[] = [
      {
        emotion: "flat",
        headline: `You are ${ordinal(you.position)} in your league.`,
        detail:
          scoreDelta != null && scoreDelta !== 0
            ? `${scoreDelta > 0 ? "+" : ""}${scoreDelta} on the score.`
            : `Score ${you.score}.`,
      },
    ];
    if (gap != null && leader) {
      beats.push({
        emotion: "bad",
        headline: `${leader.label} is ${gap} points ahead.`,
        detail: `They have ${leader.upside} left to play for. You have ${you.upside}.`,
      });
    } else if (you.upside > 0) {
      beats.push({
        emotion: "good",
        headline: "You can still win this.",
        detail: `${you.score + you.upside} points is your ceiling from here.`,
      });
    }

    return {
      kind: "live",
      frame,
      emotion: (delta ?? 0) >= 0 ? "good" : "bad",
      headline:
        delta === 0 || delta == null
          ? "You held your place."
          : `${moveWord} ${move} ${places}.`,
      detail: `You are ${ordinal(you.position)} in your league.`,
      action: {
        label: "View my bracket",
        href: bracketHref(leagueSlug, tournamentRef),
      },
      beats,
      eventName,
    };
  }

  // Locked / submitted field but this member has no snapshot yet
  return {
    kind: "awaiting_entries",
    frame,
    emotion: "flat",
    headline: "Standings are waiting on settlement.",
    detail: `Brackets are in for ${eventName}. Run settlement (or wait for the job) to move the table.`,
    action: {
      label: "Open tournament",
      href: tournamentHref(leagueSlug, tournamentRef),
    },
    beats: [],
    eventName,
  };
}
