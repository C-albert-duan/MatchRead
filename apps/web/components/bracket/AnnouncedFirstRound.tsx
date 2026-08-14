"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBracketPicks } from "@/app/actions/brackets";
import { useT, useTf } from "@/components/shell/LocaleProvider";
import { track } from "@/lib/telemetry";
import type { BracketPicks } from "@matchread/core";

export type AnnouncedMatchup = {
  match_key: string;
  player1_ref: string;
  player1_last_name: string;
  player1_seed: number | null;
  player2_ref: string;
  player2_last_name: string;
  player2_seed: number | null;
  scheduled_at: string | null;
  has_time: boolean;
};

type Props = {
  matchups: AnnouncedMatchup[];
  expectedFirst?: number;
  picks?: BracketPicks;
  locked?: boolean;
  /** League editor — omit on the public calendar page. */
  leagueId?: string;
  leagueSlug?: string;
  tournamentId?: string;
  tournamentRef?: string;
  venueTz?: string;
  locale?: string;
  /** Public page: click a named side → sign-in / enter. No anon save. */
  enterHref?: string;
};

function seedLabel(seed: number | null) {
  return seed ? ` (${seed})` : "";
}

export function AnnouncedFirstRound({
  matchups,
  expectedFirst = 32,
  picks: initialPicks = {},
  locked = false,
  leagueId,
  leagueSlug,
  tournamentId,
  tournamentRef,
  venueTz = "UTC",
  locale = "en",
  enterHref,
}: Props) {
  const t = useT();
  const tf = useTf();
  const router = useRouter();
  const editable = Boolean(leagueId && leagueSlug && tournamentId && tournamentRef) && !locked;
  const gateToEnter = Boolean(enterHref) && !editable && !locked;
  const [picks, setPicks] = useState<BracketPicks>(initialPicks);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function pick(matchKey: string, winnerRef: string) {
    if (gateToEnter && enterHref) {
      track("pick_started", { source: "announced" });
      router.push(enterHref);
      return;
    }
    if (!editable || !leagueId || !leagueSlug || !tournamentId || !tournamentRef) {
      return;
    }
    const next = { ...picks, [matchKey]: winnerRef };
    setPicks(next);
    startTransition(async () => {
      const result = await saveBracketPicks({
        leagueId,
        tournamentId,
        picks: next,
        leagueSlug,
        tournamentRef,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(t("bracket.saved"));
    });
  }

  const made = matchups.filter((m) => picks[m.match_key]).length;

  return (
    <section className="section" aria-labelledby="announced-first">
      <h2 id="announced-first" className="section-title">
        {t("tournament.announced.title")}
      </h2>
      <p className="t-body">
        {tf("tournament.announced.body", {
          have: matchups.length,
          need: expectedFirst,
        })}
      </p>
      {editable ? (
        <p className="t-caption">
          {made} / {matchups.length}
          {pending ? ` · ${t("bracket.saving")}` : message ? ` · ${message}` : ""}
        </p>
      ) : null}
      <ul className="league-list">
        {matchups.map((m) => {
          const winner = picks[m.match_key];
          const when =
            m.scheduled_at && m.has_time
              ? new Date(m.scheduled_at).toLocaleString(locale, {
                  timeZone: venueTz,
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : null;
          return (
            <li key={m.match_key} className="league-card">
              <div className="row wrap gap-md between">
                <div className="stack gap-sm">
                  {when ? <p className="t-caption numeral">{when}</p> : null}
                  <div className="row wrap gap-md">
                    <Side
                      name={`${m.player1_last_name}${seedLabel(m.player1_seed)}`}
                      selected={winner === m.player1_ref}
                      disabled={!editable && !gateToEnter}
                      onClick={() => pick(m.match_key, m.player1_ref)}
                    />
                    <span className="t-caption">vs</span>
                    <Side
                      name={`${m.player2_last_name}${seedLabel(m.player2_seed)}`}
                      selected={winner === m.player2_ref}
                      disabled={!editable && !gateToEnter}
                      onClick={() => pick(m.match_key, m.player2_ref)}
                    />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Side({
  name,
  selected,
  disabled,
  onClick,
}: {
  name: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  if (disabled) {
    return (
      <span className={selected ? "t-body" : "t-caption"} data-selected={selected || undefined}>
        {name}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={selected ? "act act--prominent act--standard-size" : "act act--standard act--standard-size"}
      aria-pressed={selected}
      onClick={onClick}
    >
      {name}
    </button>
  );
}
