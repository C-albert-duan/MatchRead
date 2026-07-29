import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";

export default async function TournamentsPage() {
  const user = await getSessionUser();
  return (
    <AppShell signedIn={Boolean(user)} email={user?.email}>
      <div className="stack gap-2xl">
        <div className="stack gap-lg">
          <p className="eyebrow">Tournaments</p>
          <h1 className="t-page-title">Tournament calendar</h1>
          <p className="t-lead">
            Reference list of events. Data import comes with the provider
            wiring.
          </p>
        </div>
        <Link href="/" className="act act--standard act--standard-size">
          Back to landing
        </Link>
      </div>
    </AppShell>
  );
}
