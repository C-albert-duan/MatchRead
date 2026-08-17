/** Re-export the Node provider for Edge (Deno bundles relative imports). */
export {
  buildDrawFromFirstRound,
  createClient,
  fetchOfficialSeats,
  getDualTourCalendar,
  getLiveEvents,
  getTournamentCalendar,
  getTournamentFixtures,
  getTournamentResults,
  mapLiveFinishedToIngest,
  mapResultsToIngest,
  namedFirstRoundPairs,
  overlayOfficialDraw,
  resolveOfficialSeats,
} from "../../../packages/provider-rapidapi/src/index.js";
