import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { BackButton } from "@/components/shell/BackButton";
import { CourtAtmosphere } from "@/components/shell/CourtAtmosphere";
import { LocaleSwitcher } from "@/components/shell/LocaleSwitcher";
import { NavigationProgressHost } from "@/components/shell/NavigationProgressHost";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { getLocale, t } from "@/lib/i18n";

type Props = {
  children: React.ReactNode;
  signedIn: boolean;
  email?: string | null;
  /** Full arena atmosphere (landing). Default app routes still get a light wash. */
  arena?: boolean;
};

export function AppShell({
  children,
  signedIn,
  email,
  arena = false,
}: Props) {
  const locale = getLocale();

  return (
    <div className={arena ? "shell shell--arena" : "shell"}>
      <CourtAtmosphere />
      <NavigationProgressHost />
      <OfflineBanner message={t("offline.banner")} />
      <header className="shell-header">
        <div className="shell-header-inner">
          <BackButton />
          <Link href="/" className="wordmark">
            <span className="wordmark-mark" aria-hidden />
            MatchRead
          </Link>
          <div className="shell-spacer" />
          <nav className="shell-nav" aria-label="Primary">
            {signedIn ? (
              <>
                <Link
                  href="/leagues"
                  className="act act--prominent act--standard-size"
                >
                  {t("nav.leagues")}
                </Link>
                <Link href="/tournaments" className="act act--quiet">
                  Calendar
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="act act--standard act--standard-size"
                  >
                    {t("nav.signOut")}
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/sign-in" className="act act--quiet">
                  {t("nav.signIn")}
                </Link>
                <Link
                  href="/sign-in?next=%2Fleagues%2Fnew"
                  className="act act--prominent act--prominent-size"
                >
                  {t("cta.startLeague")}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {email && signedIn ? (
        <div className="session-chip" aria-live="polite">
          <span className="live-dot" aria-hidden />
          {t("nav.signedInAs")} {email}
        </div>
      ) : null}
      <main className="shell-main">{children}</main>
      <footer className="shell-footer">
        <LocaleSwitcher current={locale} label={t("locale.label")} />
      </footer>
    </div>
  );
}
