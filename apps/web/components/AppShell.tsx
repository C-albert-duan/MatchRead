import Link from "next/link";
import { signOut } from "@/app/actions/auth";

type Props = {
  children: React.ReactNode;
  signedIn: boolean;
  /** Optional email shown when signed in */
  email?: string | null;
};

export function AppShell({ children, signedIn, email }: Props) {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-inner">
          <Link href="/" className="wordmark">
            MatchRead
          </Link>
          <div className="shell-spacer" />
          <nav className="shell-nav" aria-label="Primary">
            {signedIn ? (
              <>
                <Link
                  href="/leagues"
                  className="act act--standard act--standard-size"
                >
                  Leagues
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="act act--standard act--standard-size"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="act act--standard act--standard-size"
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-in?next=%2Fleagues%2Fnew"
                  className="act act--prominent act--prominent-size"
                >
                  Start a league
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {email && signedIn ? (
        <div className="session-chip" aria-live="polite">
          Signed in as {email}
        </div>
      ) : null}
      <main className="shell-main">{children}</main>
    </div>
  );
}
