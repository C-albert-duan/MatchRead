export type RapidApiClientOptions = {
  key: string;
  host?: string;
};

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
  tour?: "atp" | "wta";
  players: Record<string, string>;
  matches: Record<string, string>;
};

export type IngestResultRow = {
  match_key: string;
  winner_ref: string | null;
  voided: boolean;
};

export declare function createClient(opts: RapidApiClientOptions): {
  host: string;
  get: (path: string, attempt?: number) => Promise<any>;
};

export declare function getTournamentResults(
  client: { get: (path: string) => Promise<any> },
  tour: "atp" | "wta",
  providerTournamentId: string | number
): Promise<{
  singles: ProviderMatchResult[];
  doubles: ProviderMatchResult[];
  raw: unknown;
}>;

export declare function mapResultsToIngest(
  matches: ProviderMatchResult[],
  mapping: ReconcileMapping
): {
  results: IngestResultRow[];
  skipped: { id: string; reason: string }[];
};

export declare function backoffMs(attempt: number): number;
