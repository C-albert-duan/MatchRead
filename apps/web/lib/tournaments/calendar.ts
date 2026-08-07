import { createClient } from "@/lib/supabase/server";

export type CalendarTournament = {
  id: string;
  ref: string;
  name: string;
  surface: string;
  starts_on: string | null;
  hasDraw: boolean;
};

export function surfaceClass(surface: string | null | undefined) {
  const s = (surface ?? "").toLowerCase();
  if (s.includes("clay")) return "clay";
  if (s.includes("grass")) return "grass";
  return "hard";
}

export function formatTournamentWhen(
  row: Pick<CalendarTournament, "starts_on" | "hasDraw" | "surface">,
  labels: { drawOpen: string; drawPending: string }
) {
  const parts: string[] = [];
  if (row.surface) parts.push(row.surface);
  if (row.starts_on) parts.push(row.starts_on);
  parts.push(row.hasDraw ? labels.drawOpen : labels.drawPending);
  return parts.join(" · ");
}

/** Live tournaments from Supabase — no hardcoded calendar. */
export async function listCalendarTournaments(): Promise<CalendarTournament[]> {
  const supabase = createClient();
  const [{ data: tournaments }, { data: draws }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, ref, name, surface, starts_on")
      .order("starts_on", { ascending: true }),
    supabase.from("draws").select("tournament_id"),
  ]);

  const publishedIds = new Set((draws ?? []).map((d) => d.tournament_id));
  return (tournaments ?? []).map((row) => ({
    id: row.id,
    ref: row.ref,
    name: row.name,
    surface: row.surface ?? "hard",
    starts_on: row.starts_on,
    hasDraw: publishedIds.has(row.id),
  }));
}
