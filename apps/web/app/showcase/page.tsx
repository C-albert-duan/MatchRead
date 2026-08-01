import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { ShowcaseBracket128 } from "@/components/bracket/ShowcaseBracket128";
import { getSessionUser } from "@/lib/auth";

export default async function ShowcasePage() {
  const user = await getSessionUser();
  return (
    <AppShell signedIn={Boolean(user)} email={user?.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">Showcase</p>
            <h1 className="t-page-title">128-draw smoke</h1>
            <p className="t-lead">
              Performance check for a full draw. Product screens live on league
              routes.
            </p>
          </div>
          <div className="page-actions">
            <Link href="/" className="act act--standard act--standard-size">
              Landing
            </Link>
            <Link href="/leagues" className="act act--quiet">
              My leagues
            </Link>
          </div>
        </header>
        <div className="focus-band">
          <ShowcaseBracket128 />
        </div>
      </div>
    </AppShell>
  );
}
