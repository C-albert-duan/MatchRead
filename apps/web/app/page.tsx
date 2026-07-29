import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";

const STEPS = [
  [
    "Start a league",
    "Name it, pick a tournament or a whole season, and you are the commissioner.",
  ],
  [
    "Share one link",
    "Drop it in the group chat. People join in two taps.",
  ],
  [
    "Fill in a bracket",
    "When the draw lands, everyone picks. Nobody sees anyone else’s until it locks.",
  ],
  [
    "Check it tomorrow",
    "Standings move as matches finish. That is the part people come back for.",
  ],
] as const;

const CALENDAR = [
  { name: "Roland Garros", surface: "clay" as const, when: "May 2026" },
  { name: "Wimbledon", surface: "grass" as const, when: "Jun 2026" },
  { name: "US Open", surface: "hard" as const, when: "Aug 2026 · draw pending" },
];

const US_OPEN_MAX = 512;

export default async function HomePage() {
  const user = await getSessionUser();
  const signedIn = Boolean(user);

  return (
    <AppShell signedIn={signedIn} email={user?.email}>
      <div className="stack gap-4xl">
        <div className="stack gap-lg" style={{ padding: "8px 0" }}>
          <p className="eyebrow">Tennis leagues</p>
          <h1 className="t-hero">
            Follow the tennis season with your people.
          </h1>
          <p className="t-lead">
            Start a league, share one link, and fill in a bracket together. One
            tournament, or a whole year — the league carries on between them. A
            full US Open bracket tops out at {US_OPEN_MAX}.
          </p>
          <div className="row wrap gap-md" style={{ marginTop: 8 }}>
            {signedIn ? (
              <Link
                href="/leagues"
                className="act act--prominent act--prominent-size"
              >
                Go to my leagues
              </Link>
            ) : (
              <Link
                href="/sign-in?next=%2Fleagues%2Fnew"
                className="act act--prominent act--prominent-size"
              >
                Start a league
              </Link>
            )}
            <Link
              href="/showcase"
              className="act act--standard act--standard-size"
            >
              See what it looks like
            </Link>
          </div>
        </div>

        <section className="section" aria-labelledby="calendar-heading">
          <h2 id="calendar-heading" className="section-title">
            On the calendar
          </h2>
          <ul className="calendar">
            {CALENDAR.map((t) => (
              <li key={t.name}>
                <Link href="/tournaments" className="trow">
                  <span
                    className={`court-hairline court-${t.surface}`}
                    aria-hidden
                  />
                  <span className="trow-name">{t.name}</span>
                  <span className="trow-meta">{t.when}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="section" aria-labelledby="how-heading">
          <h2 id="how-heading" className="section-title">
            How it works
          </h2>
          <ol className="steps">
            {STEPS.map((step, i) => (
              <li key={step[0]} className="stack gap-sm">
                <span className="eyebrow">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="t-title3">{step[0]}</h3>
                <p className="t-body">{step[1]}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
