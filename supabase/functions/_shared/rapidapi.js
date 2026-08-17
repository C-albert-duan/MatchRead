/** Re-export the Node provider for Edge (Deno bundles relative imports). */
export {
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
  resolveOfficialSeats,
} from "../../../packages/provider-rapidapi/src/index.js";
