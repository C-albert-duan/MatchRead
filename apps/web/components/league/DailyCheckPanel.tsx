import Link from "next/link";
import type { DailyCheck } from "@matchread/core";

type Props = {
  check: DailyCheck;
};

export function DailyCheckPanel({ check }: Props) {
  return (
    <section
      className="daily-check focus-band"
      aria-labelledby="daily-check"
      data-emotion={check.emotion}
    >
      <div className="stack gap-xl">
        <div className="daily-check-kicker">
          <span className="daily-check-live">
            <span className="live-dot" aria-hidden />
            Live
          </span>
          <p className="eyebrow">Daily Check</p>
          <span className="daily-check-frame">
            {check.frame} · {check.eventName}
          </span>
        </div>
        <h2 id="daily-check" className="daily-check-headline">
          {check.headline}
        </h2>
        <p className="t-lead">{check.detail}</p>
      </div>

      {check.action ? (
        <div className="page-actions">
          <Link
            href={check.action.href}
            className="act act--prominent act--prominent-size"
          >
            {check.action.label}
          </Link>
        </div>
      ) : null}

      {check.beats.length > 0 ? (
        <ul className="beats">
          {check.beats.map((b, i) => (
            <li key={`${b.headline}-${i}`} className="beat">
              <span
                aria-hidden="true"
                className={`beat-dot beat-dot--${b.emotion}`}
              />
              <span style={{ minWidth: 0 }}>
                <span
                  className={
                    b.emotion === "good"
                      ? "beat-head beat-head--good"
                      : b.emotion === "bad"
                        ? "beat-head beat-head--bad"
                        : "beat-head"
                  }
                >
                  {b.headline}
                </span>{" "}
                <span className="t-caption">{b.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
