import Link from "next/link";
import type { DailyCheck } from "@matchread/core";

type Props = {
  check: DailyCheck;
};

export function DailyCheckPanel({ check }: Props) {
  return (
    <section className="daily-check stack gap-xl" aria-labelledby="daily-check">
      <div className="daily-check-lead">
        <span
          aria-hidden="true"
          className={`check-rule check-rule--${check.emotion}`}
        />
        <div className="stack gap-md" style={{ minWidth: 0 }}>
          <p className="eyebrow">
            {check.frame} · {check.eventName}
          </p>
          <h2 id="daily-check" className="daily-check-headline">
            {check.headline}
          </h2>
          <p className="t-lead">{check.detail}</p>
        </div>
      </div>

      {check.action ? (
        <div>
          <Link
            href={check.action.href}
            className="act act--standard act--standard-size"
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
