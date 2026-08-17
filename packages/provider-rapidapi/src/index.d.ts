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
  fixtures?: unknown[]
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
