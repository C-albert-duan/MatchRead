import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { CreateLeagueForm } from "@/components/league/CreateLeagueForm";
import { getSessionUser } from "@/lib/auth";
import { listCalendarTournaments } from "@/lib/tournaments/calendar";
import { t } from "@/lib/i18n";

export default async function NewLeaguePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Fleagues%2Fnew");
  }

  const rows = await listCalendarTournaments();
  const tournaments = rows.map((row) => ({
    value: row.name,
    ref: row.ref,
    label: row.hasDraw
      ? `${row.name} — ${t("calendar.drawOpen")}`
      : `${row.name} — ${t("calendar.drawPending")}`,
  }));

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <CreateLeagueForm tournaments={tournaments} />
      </div>
    </AppShell>
  );
}
