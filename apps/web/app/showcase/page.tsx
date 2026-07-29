import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";

export default async function ShowcasePage() {
  const user = await getSessionUser();
  return (
    <AppShell signedIn={Boolean(user)} email={user?.email}>
      <div className="stack gap-2xl">
        <div className="stack gap-lg">
          <p className="eyebrow">Showcase</p>
          <h1 className="t-page-title">Component showcase</h1>
          <p className="t-lead">
            Live design-system gallery ships with product components. For now,
            open the wireframe spec.
          </p>
        </div>
        <Link href="/" className="act act--standard act--standard-size">
          Back to landing
        </Link>
        <p className="stub-note">
          Full interactive screens: Wireframe/MatchRead-main/matchread-spec/
        </p>
      </div>
    </AppShell>
  );
}
