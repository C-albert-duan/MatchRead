import Link from "next/link";
import type { DailyCheck } from "@matchread/core";
import { t, type MessageKey } from "@/lib/i18n";

type Props = {
  check: DailyCheck;
};

const FRAME_KEYS: Record<string, MessageKey> = {
  Today: "daily.frame.today",
  "This morning": "daily.frame.morning",
  "Live now": "daily.frame.live",
  Tonight: "daily.frame.tonight",
  "Between tournaments": "daily.frame.between",
};

const CTA_KEYS: Record<string, MessageKey> = {
  "Invite friends": "daily.cta.invite",
  "Open my bracket": "daily.cta.openBracket",
  "View my bracket": "daily.cta.viewBracket",
  "See the full result": "daily.cta.seeResult",
  "Open tournament": "daily.cta.openTournament",
};

/** Known English frame strings map to translated chrome; unknown values pass through untranslated. */
function localizeFrame(frame: string): string {
  const key = FRAME_KEYS[frame];
  return key ? t(key) : frame;
}

/** Known English CTA labels translate; complex/dynamic labels pass through untranslated for now. */
function localizeCta(label: string): string {
  const key = CTA_KEYS[label];
  return key ? t(key) : label;
}

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
            {t("daily.live")}
          </span>
          <p className="eyebrow">{t("daily.title")}</p>
          <span className="daily-check-frame">
            {localizeFrame(check.frame)} · {check.eventName}
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
            {localizeCta(check.action.label)}
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
