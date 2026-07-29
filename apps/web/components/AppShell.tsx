import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { OfflineBanner } from "@/components/OfflineBanner";
import { getLocale, t } from "@/lib/i18n";

type Props = {
  children: React.ReactNode;
  signedIn: boolean;
  /** Optional email shown when signed in */
  email?: string | null;
};

export function AppShell({ children, signedIn, email }: Props) {
  const locale = getLocale();

  return (
    <div className="shell">
      <OfflineBanner message={t("offline.banner")} />
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
                  {t("nav.leagues")}
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
                <Link
                  href="/sign-in"
                  className="act act--standard act--standard-size"
                >
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
