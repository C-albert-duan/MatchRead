import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";

export default async function NewLeaguePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Fleagues%2Fnew");
  }

  return (
    <AppShell signedIn email={user.email}>
      <div className="stack gap-2xl" style={{ maxWidth: 520 }}>
        <div className="stack gap-lg">
          <p className="eyebrow">New league</p>
          <h1 className="t-page-title">Start a league</h1>
          <p className="t-lead">
            Four decisions — name, format, visibility, tournament. The create
            form ships in Phase 2.
          </p>
        </div>
        <Link href="/leagues" className="act act--standard act--standard-size">
          Back to my leagues
        </Link>
      </div>
    </AppShell>
  );
}
