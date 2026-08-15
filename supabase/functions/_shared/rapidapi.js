/** Re-export the Node provider for Edge (Deno bundles relative imports). */
export {
  CIN_2026_OFFICIAL,
  buildDrawFromFirstRound,
  createClient,
  fetchOfficialSeats,
  getLiveEvents,
  getTournamentFixtures,
  getTournamentResults,
  mapLiveFinishedToIngest,
  mapResultsToIngest,
  namedFirstRoundPairs,
  overlayOfficialDraw,
} from "../../../packages/provider-rapidapi/src/index.js";
