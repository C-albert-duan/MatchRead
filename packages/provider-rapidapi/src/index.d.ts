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
): 32 | 64 | 128 | null;

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
    provider_player_id: string;
  }>;
  players: Record<string, string>;
  matches: Record<string, string>;
  schedule: Array<{
    match_key: string;
    scheduled_at: string;
    has_time: boolean;
  }>;
  results: [];
  stats: { firstRound: number; verifiedPlayers: number; byes: number };
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
