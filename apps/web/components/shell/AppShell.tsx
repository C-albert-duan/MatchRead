import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { BackButton } from "@/components/shell/BackButton";
import { LocaleSwitcher } from "@/components/shell/LocaleSwitcher";
import { ShellHeader } from "@/components/shell/ShellHeader";
import { NavigationProgressHost } from "@/components/shell/NavigationProgressHost";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { DisplayNameBootstrap } from "@/components/shell/DisplayNameBootstrap";
import { LocaleProvider } from "@/components/shell/LocaleProvider";
import { Mark } from "@/components/shell/Mark";
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
    <LocaleProvider locale={locale}>
      <div className={arena ? "shell shell--arena" : "shell"}>
        <NavigationProgressHost />
        <OfflineBanner message={t("offline.banner")} />
        {signedIn ? <DisplayNameBootstrap /> : null}
        <ShellHeader>
          <div className="shell-header-inner">
            <BackButton label={t("nav.back")} />
            <Link href="/" className="wordmark">
              <Mark className="wordmark-mark" />
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
                    {t("nav.calendar")}
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
                    href="/tournaments"
                    className="act act--prominent act--standard-size"
                  >
                    {t("nav.calendar")}
                  </Link>
                  <Link href="/sign-in" className="act act--quiet">
                    {t("nav.signIn")}
                  </Link>
                </>
              )}
            </nav>
          </div>
        </ShellHeader>
        {email && signedIn ? (
          <div className="session-chip" aria-live="polite">
            <span className="live-dot" aria-hidden />
            {t("nav.signedInAs")} {email}
          </div>
        ) : null}
        <main className="shell-main">{children}</main>
        <footer className="shell-footer">
          <p className="eyebrow eyebrow--plain">{t("landing.footer.mark")}</p>
          <LocaleSwitcher current={locale} label={t("locale.label")} />
        </footer>
      </div>
    </LocaleProvider>
  );
}
