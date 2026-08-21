export type RapidApiClientOptions = {
  key: string;
  host?: string;
};

export type Tour = "atp" | "wta";

export type ProviderMatchResult = {
  id: string | number;
  match_winner?: number | null;
  player1Id?: number | null;
  player2Id?: number | null;
  result?: string | null;
  result_type?: string | null;
  roundId?: number | null;
  tournamentId?: number | null;
};

export type ReconcileMapping = {
  tournament_id: string;
  provider_tournament_id: string;
  tour?: Tour;
  players: Record<string, string>;
  matches: Record<string, string>;
};

export type IngestResultRow = {
  match_key: string;
  winner_ref: string | null;
  voided: boolean;
};

export type CalendarQueryOptions = {
  since?: string;
  pageSize?: number;
  pageNo?: number;
  filter?: string;
};

export type ProviderCalendarTournament = {
  id?: string | number;
  name?: string;
  date?: string;
  start?: string;
  [key: string]: unknown;
};

export declare function createClient(opts: RapidApiClientOptions): {
  host: string;
  get: (path: string, attempt?: number) => Promise<any>;
};

export declare function normalizeTour(tour: string | null | undefined): Tour;

export declare function getTournamentCalendar(
  client: { get: (path: string) => Promise<any> },
  tour: Tour,
  year: number | string,
  opts?: CalendarQueryOptions
): Promise<{
  tour: Tour;
  year: number;
  tournaments: ProviderCalendarTournament[];
  raw: unknown;
}>;

export declare function getDualTourCalendar(
  client: { get: (path: string) => Promise<any> },
  year: number | string,
  opts?: CalendarQueryOptions
): Promise<{
  atp: Awaited<ReturnType<typeof getTournamentCalendar>>;
  wta: Awaited<ReturnType<typeof getTournamentCalendar>>;
}>;

export declare function getTournamentInfo(
  client: { get: (path: string) => Promise<any> },
  tour: Tour,
  providerTournamentId: string | number
): Promise<{ tour: Tour; info: unknown; raw: unknown }>;

export declare function getTournamentFixtures(
  client: { get: (path: string) => Promise<any> },
  tour: Tour,
  providerTournamentId: string | number,
  opts?: { include?: string; filter?: string; pageSize?: number }
): Promise<{ tour: Tour; fixtures: unknown[]; raw: unknown }>;

export declare function parseFixtureInstant(
  row: Record<string, unknown> | null | undefined
): { scheduled_at: string; has_time: boolean } | null;

export declare function fixtureRoundLabel(
  row: Record<string, unknown> | null | undefined
): string;

export declare function isQualifyingRound(
  row: Record<string, unknown> | null | undefined
): boolean;

export declare function isMainDrawFirstRound(
  row: Record<string, unknown> | null | undefined
): boolean;

export declare function firstMainDrawBall(
  fixtures: unknown[]
): { scheduled_at: string; has_time: true } | null;

export declare function playerLastName(full: string | null | undefined): string;

export type FirstRoundPlayer = {
  id: string;
  last_name: string;
  country_code: string;
  seed: number | null;
};

export type NamedFirstRoundPair = {
  id: number;
  p1: FirstRoundPlayer;
  p2: FirstRoundPlayer;
  instant: { scheduled_at: string; has_time: boolean } | null;
};

export declare function namedFirstRoundPairs(
  fixtures: unknown[]
): NamedFirstRoundPair[];

export declare function expectedFirstRoundMatches(
  drawSize: number
): number | null;

export declare function inferDrawSizeFromFirstRound(
  pairCount: number
): 32 | 128 | null;

export type BuiltDraw = {
  ok: true;
  drawSize: number;
  seats: Array<{
    position: number;
    player_ref: string;
    last_name: string;
    seed: number | null;
    country_code: string;
    is_bye: boolean;
    seat_kind?: "player" | "bye" | "tbd";
    entry_status?: "wc" | "pr" | null;
    provider_player_id: string | null;
  }>;
  players: Record<string, string>;
  matches: Record<string, string>;
  schedule: Array<{
    match_key: string;
    scheduled_at: string;
    has_time: boolean;
  }>;
  results: Array<{
    match_key: string;
    winner_ref: string | null;
    voided: boolean;
  }>;
  stats: {
    firstRound: number;
    verifiedPlayers: number;
    byes: number;
    mappedPlayers?: number;
    tbd?: number;
  };
};

export type OfficialDrawSeat = {
  position: number;
  player_ref: string;
  last_name: string;
  given_name?: string | null;
  seed: number | null;
  country_code: string;
  is_bye: boolean;
  seat_kind: "player" | "bye" | "tbd";
  entry_status: "wc" | "pr" | null;
  provider_player_id: string | null;
};

export declare function overlayOfficialDraw(
  officialSeats: OfficialDrawSeat[] | Array<Record<string, unknown>>,
  fixtures: unknown[],
  opts?: { prefix?: string; results?: unknown[] }
): BuiltDraw | { ok: false; reason: string };

export declare function parseOfficialDraw(
  raw: unknown,
  opts?: { prefix?: string; expectedDrawSize?: number }
):
  | { ok: true; drawSize: number; seats: OfficialDrawSeat[]; source: string }
  | { ok: false; reason: string };

export declare function drawNameCandidates(event: {
  api_name?: string;
  name?: string;
  ref?: string;
}): string[];

export declare function drawYear(event: { starts_on?: string | null }): number;

export declare function getTournamentDraw(
  client: { get: (path: string) => Promise<any> },
  tour: Tour,
  tournamentName: string,
  year: number | string
): Promise<{ tour: Tour; name: string; year: number; raw: unknown }>;

export declare function getTournamentSeeds(
  client: { get: (path: string) => Promise<any> },
  tour: Tour,
  tournamentName: string,
  year: number | string
): Promise<{ tour: Tour; name: string; year: number; raw: unknown }>;

export declare function fetchOfficialSeats(
  client: { get: (path: string) => Promise<any> },
  event: {
    ref?: string;
    tour?: string;
    name?: string;
    api_name?: string;
    starts_on?: string | null;
    draw_size?: number;
  }
): Promise<
  | { ok: true; drawSize: number; seats: OfficialDrawSeat[]; source: string }
  | { ok: false; reason: string }
>;

export declare function resolveOfficialSeats(
  client: { get: (path: string) => Promise<any> },
  event: {
    ref?: string;
    tour?: string;
    name?: string;
    api_name?: string;
    starts_on?: string | null;
    draw_size?: number;
  },
  fixtures?: unknown[],
  opts?: { allowFixtureDraw?: boolean }
): Promise<
  | { ok: true; drawSize: number; seats: OfficialDrawSeat[]; source: string }
  | { ok: false; reason: string; firstRound?: string; pairs?: number }
>;

export declare function getLiveEvents(client: {
  get: (path: string) => Promise<any>;
}): Promise<{ events: unknown[]; raw: unknown }>;

export declare function getWsToken(client: {
  get: (path: string) => Promise<any>;
}): Promise<{ token: string | null; raw: unknown }>;

export declare function parseMatchId(matchId: string | null | undefined): {
  player1Id: string;
  player2Id: string;
  tournamentId: string;
  roundId: string;
} | null;

export declare function liveEventsForTournament(
  events: unknown,
  providerTournamentId: string | number
): unknown[];

export declare function isFinishedLiveStatus(status: unknown): boolean;

export declare function mapLiveFinishedToIngest(
  events: unknown,
  mapping: ReconcileMapping
): {
  results: IngestResultRow[];
  skipped: { id: string; reason: string }[];
};

export declare function buildDrawFromFirstRound(
  fixtures: unknown[],
  opts: { prefix: string; drawSize?: number }
): BuiltDraw | { ok: false; reason: string; pairs: number };

export declare function getTournamentResults(
  client: { get: (path: string) => Promise<any> },
  tour: Tour,
  providerTournamentId: string | number
): Promise<{
  singles: ProviderMatchResult[];
  doubles: ProviderMatchResult[];
  raw: unknown;
}>;

export declare function resolveNationalBankOpenWeek(dual: {
  atp: { tournaments: ProviderCalendarTournament[] };
  wta: { tournaments: ProviderCalendarTournament[] };
}): {
  montreal: {
    tour: "atp";
    provider_tournament_id: string;
    name: string;
    starts_on: string | null;
  } | null;
  toronto: {
    tour: "wta";
    provider_tournament_id: string;
    name: string;
    starts_on: string | null;
  } | null;
};

export declare function mapResultsToIngest(
  matches: ProviderMatchResult[],
  mapping: ReconcileMapping
): {
  results: IngestResultRow[];
  skipped: { id: string; reason: string }[];
};

export declare function backoffMs(attempt: number): number;

export declare function validateOfficialSeats(seats: unknown[]):
  | { ok: true; drawSize: number }
  | { ok: false; reason: string };

export declare function hashDrawSeats(seats: unknown[]): Promise<string>;

export declare function diffDrawSeats(
  prevSeats: unknown[],
  nextSeats: unknown[]
): Array<{
  position: number;
  change_kind: string;
  old_provider_player_id: string | null;
  new_provider_player_id: string | null;
  old_kind: string;
  new_kind: string;
}>;

export declare function drawPollIntervalMs(input?: {
  now?: Date;
  lock_at?: string | null;
  starts_on?: string | null;
  hasDraw?: boolean;
  tbdCount?: number;
}): number;

export declare function shouldPollDraw(input?: {
  now?: Date;
  lock_at?: string | null;
  starts_on?: string | null;
  hasDraw?: boolean;
  tbdCount?: number;
  draw_checked_at?: string | null;
}): boolean;

export declare function parentMatchKey(
  round: number,
  indexInRound: number
): {
  round: number;
  indexInRound: number;
  side: "a" | "b";
  key: string;
};

export declare function advanceWinnerToParent(
  round: number,
  indexInRound: number,
  winnerPlayerId: string
): {
  round: number;
  indexInRound: number;
  side: "a" | "b";
  key: string;
  winnerPlayerId: string;
  sideColumn: "side_a_player_id" | "side_b_player_id";
} | null;

export declare function bindResultsByPlayerPair(
  rows: ProviderMatchResult[],
  matchSides: Array<{
    match_key: string;
    round: number;
    index_in_round: number;
    side_a_provider_id: string | null;
    side_b_provider_id: string | null;
    provider_match_id?: string | null;
  }>,
  players?: Record<string, string>
): {
  results: Array<{
    match_key: string;
    winner_ref: string | null;
    winner_provider_id: string | null;
    voided: boolean;
  }>;
  skipped: { id: string; reason: string }[];
  bindings: Array<{ match_key: string; provider_match_id: string }>;
};

export declare function normalizePairKey(
  playerA: string,
  playerB: string
): string;

export declare function resolveLiveEvent(
  fixture: {
    player1Id: string;
    player2Id: string;
    providerTournamentId?: string;
    scheduledDate?: string | null;
  },
  liveEvents?: unknown[],
  apis?: { eventGet?: (q: object) => Promise<unknown> }
): Promise<{
  pair_key: string;
  socket_event_id: string | null;
  status: "mapped" | "not_found" | "ambiguous" | "stale";
  confidence: "high" | "medium" | "low";
  method: string | null;
  expires_at: string;
}>;

export declare function getExtendEvent(
  client: { get: (path: string) => Promise<any> },
  query: { player1?: string; player2?: string; date?: string }
): Promise<unknown>;

export declare function createLiveSessionState(): {
  state: string;
  desiredEventIds: Set<string>;
  joinedEventIds: Set<string>;
  lastRestSyncAt: string | null;
  lastSocketMessageAt: string | null;
  reconnectCount: number;
  allowJoin: boolean;
};

export declare function onSocketDisconnect(session: {
  state: string;
  allowJoin: boolean;
  joinedEventIds: Set<string>;
  reconnectCount: number;
}): unknown;

export declare function reconcileThenResume(
  session: { state: string; allowJoin: boolean; lastRestSyncAt: string | null },
  restSweep: () => Promise<void>
): Promise<unknown>;

export declare function subscriptionDiff(session: {
  allowJoin: boolean;
  desiredEventIds: Set<string>;
  joinedEventIds: Set<string>;
}): { toJoin: string[]; toLeave: string[] };

export declare function isSilentSubscription(
  session: {
    joinedEventIds: Set<string>;
    lastSocketMessageAt: string | null;
    lastRestSyncAt: string | null;
  },
  silentMs?: number,
  now?: number
): boolean;

export declare const LiveConnectionState: Record<string, string>;

export declare function parseSeedOrEntry(raw: unknown): {
  seed: number | null;
  entry: "wc" | "pr" | "q" | "ll" | null;
};

export declare const PUBLIC_TIERS: readonly string[];
export declare const ALL_TIERS: readonly string[];
export declare class UnknownProviderValue extends Error {
  field: string;
  raw: unknown;
  constructor(field: string, raw: unknown);
}
export declare function parseTour(
  tour: string | null | undefined
): "atp" | "wta" | null;
export declare function requireTour(
  tour: string | null | undefined
): "atp" | "wta";
export declare function normalizeTier(
  category: string | null | undefined,
  type?: string | null | undefined,
  tierLabel?: string | null | undefined
): { tier: string; alert?: string };
export declare function defaultTournamentSpanDays(
  tier: string | null | undefined
): number;
export declare function isBracketProduct(
  tour: string | null | undefined,
  tier: string | null | undefined,
  override?: "force_on" | "force_off" | null
): boolean;
export declare function normalizeSurface(
  raw: unknown
): "hard" | "clay" | "grass" | "carpet" | null;
export declare function normalizeEnvironment(
  raw: unknown
): "outdoor" | "indoor" | null;
export declare function auxiliaryLastName(
  full: string | null | undefined
): string;
export declare function canonicalizeDisplayName(
  full: string | null | undefined,
  opts?: { familyNameFirst?: boolean }
): { displayName: string; lastName: string; fallback: boolean };
export declare function canAdvanceWinner(
  outcome: string | null | undefined,
  winnerId: string | null | undefined
): boolean;
export declare function assertDrawBelongsToTournament(
  draw: {
    providerTournamentId?: string | null;
    provider_id?: string | null;
    tour?: string | null;
    providerSeasonId?: string | null;
  },
  tournament: {
    provider_id?: string | null;
    providerTournamentId?: string | null;
    tour?: string | null;
    provider_season_id?: string | null;
  }
): void;
export declare function evaluateDrawIntegrity(input: {
  seats: unknown[];
  tournament?: {
    tour?: string;
    provider_id?: string;
    surface?: string | null;
    bracket_eligible?: boolean | null;
    draw_checked_at?: string | null;
  };
  drawTour?: string | null;
  drawProviderId?: string | null;
  source?: string | null;
  sourceSnapshotId?: string | null;
}): {
  safeToPublish: boolean;
  blockingErrors: { code: string; message: string; seat?: number }[];
  warnings: { code: string; message: string; seat?: number }[];
  checkedAt: string;
  sourceSnapshotId?: string | null;
};

