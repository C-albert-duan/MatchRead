import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";

export default async function LeaguesPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Fleagues");
  }

  return (
    <AppShell signedIn email={user.email}>
      <div className="stack gap-2xl">
        <div className="stack gap-lg">
          <p className="eyebrow">Leagues</p>
          <h1 className="t-page-title">My leagues</h1>
          <p className="t-lead">
            You are signed in. League create / invite / join lands in Phase 2.
          </p>
        </div>
        <div className="row wrap gap-md">
          <Link
            href="/leagues/new"
            className="act act--prominent act--prominent-size"
          >
            Start a league
          </Link>
          <Link href="/" className="act act--standard act--standard-size">
            Back to landing
          </Link>
        </div>
        <p className="stub-note">
          Empty state and league cards ship with Phase 2 schema + RLS.
        </p>
      </div>
    </AppShell>
  );
}
