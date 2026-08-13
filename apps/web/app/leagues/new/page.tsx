import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { CreateLeagueForm } from "@/components/league/CreateLeagueForm";
import { getSessionUser } from "@/lib/auth";
import {
  calendarStatus,
  calendarStatusMessageKey,
  listCalendarTournaments,
} from "@/lib/tournaments/calendar";
import { t } from "@/lib/i18n";

export default async function NewLeaguePage({
  searchParams,
}: {
  searchParams?: { tournament?: string };
}) {
  const user = await getSessionUser();
  if (!user) {
    const next = searchParams?.tournament
      ? `/leagues/new?tournament=${encodeURIComponent(searchParams.tournament)}`
      : "/leagues/new";
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  const rows = await listCalendarTournaments();
  const tournaments = rows.map((row) => {
    const tour =
      row.tour === "wta" ? t("tour.wta") : t("tour.atp");
    const status = t(calendarStatusMessageKey(calendarStatus(row)));
    return {
      value: row.name,
      ref: row.ref,
      label: `${tour} · ${row.name} — ${status}`,
    };
  });

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <CreateLeagueForm
          tournaments={tournaments}
          defaultTournamentRef={searchParams?.tournament}
        />
      </div>
    </AppShell>
  );
}
