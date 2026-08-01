import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { getSessionUser } from "@/lib/auth";
import { t } from "@/lib/i18n";

const CALENDAR = [
  { name: "Roland Garros", surface: "clay" as const, when: "May 2026" },
  { name: "Wimbledon", surface: "grass" as const, when: "Jun 2026" },
  { name: "US Open", surface: "hard" as const, when: "Aug 2026 · draw pending" },
];

const HOW_STEPS = [
  ["landing.how.1.title", "landing.how.1.body"],
  ["landing.how.2.title", "landing.how.2.body"],
  ["landing.how.3.title", "landing.how.3.body"],
  ["landing.how.4.title", "landing.how.4.body"],
] as const;

export default async function HomePage() {
  const user = await getSessionUser();
  const signedIn = Boolean(user);

  return (
    <AppShell signedIn={signedIn} email={user?.email} arena>
      <div className="page">
        <header className="page-header page-header--landing">
          <p className="eyebrow">{t("landing.eyebrow")}</p>
          <h1 className="t-hero">MatchRead</h1>
          <p className="t-lead">
            Your league. One bracket. The Daily Check every morning — what
            happened today, and did you move?
          </p>
          <div className="page-actions">
            {signedIn ? (
              <Link
                href="/leagues"
                className="act act--prominent act--prominent-size"
              >
                {t("landing.cta.leagues")}
              </Link>
            ) : (
              <Link
                href="/sign-in?next=%2Fleagues%2Fnew"
                className="act act--prominent act--prominent-size"
              >
                {t("landing.cta.start")}
              </Link>
            )}
            <Link href="/showcase" className="act act--quiet">
              {t("landing.cta.showcase")}
            </Link>
          </div>
        </header>

        <section className="section" aria-labelledby="calendar-heading">
          <h2 id="calendar-heading" className="section-title">
            {t("landing.calendar.title")}
          </h2>
          <p className="section-lede">
            The events your league can gather around. Brackets open when the
            draw is published.
          </p>
          <ul className="calendar">
            {CALENDAR.map((event) => (
              <li key={event.name}>
                <Link href="/tournaments" className="trow">
                  <span
                    className={`court-hairline court-${event.surface}`}
                    aria-hidden
                  />
                  <span className="trow-name">{event.name}</span>
                  <span className="trow-meta">{event.when}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="section" aria-labelledby="how-heading">
          <h2 id="how-heading" className="section-title">
            {t("landing.how.title")}
          </h2>
          <p className="section-lede">
            Create a league, share a link, fill brackets together, return for
            the Daily Check.
          </p>
          <ol className="steps">
            {HOW_STEPS.map((step, i) => (
              <li key={step[0]} className="stack gap-sm">
                <span className="eyebrow">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="t-title3">{t(step[0])}</h3>
                <p className="t-body">{t(step[1])}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
