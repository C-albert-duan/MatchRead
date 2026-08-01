import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";

export default function NotFound() {
  return (
    <AppShell signedIn={false}>
      <div className="stack gap-2xl" style={{ maxWidth: 520 }}>
        <div className="stack gap-lg">
          <p className="eyebrow">Not found</p>
          <h1 className="t-page-title">This page does not exist</h1>
          <p className="t-lead">
            The link may be mistyped, or the league invite was replaced. Ask your
            commissioner for a fresh invite if you were joining a league.
          </p>
        </div>
        <div className="row wrap gap-md">
          <Link href="/" className="act act--standard act--standard-size">
            Home
          </Link>
          <Link href="/leagues" className="act act--quiet">
            My leagues
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
