import { tournamentRefFrom } from "@/lib/live/view";
import { createClient } from "@/lib/supabase/server";
import { getLiveTournamentState } from "@/server/repositories/live";

function closed(tournamentRef: string) {
  return Response.json({ tournamentRef, matches: [], live: false });
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const tournamentRef = tournamentRefFrom(body);
  if (!tournamentRef) return Response.json({ error: "tournament ref required" }, { status: 400 });
  try {
    const { data, error } = await createClient().rpc("live_overlay_open");
    if (error || data !== true) return closed(tournamentRef);
  } catch {
    return closed(tournamentRef);
  }
  try {
    const state = await getLiveTournamentState(tournamentRef);
    if (!state) return Response.json({ error: "unknown tournament" }, { status: 404 });
    return Response.json({ ...state, live: true });
  } catch {
    return Response.json({ error: "live read failed" }, { status: 500 });
  }
}
