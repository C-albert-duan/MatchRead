"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  applyByeAdvances,
  countPicksMade,
  isBracketComplete,
  totalMatches,
  type BracketConfidence,
  type BracketPicks,
  type DrawSeat,
  type OfficialResults,
} from "@matchread/core";
import {
  adminLockTournament,
  saveBracketPicks,
  submitBracket,
} from "@/app/actions/brackets";
import { BracketFind } from "@/components/bracket/BracketFind";
import { BracketGrid } from "@/components/bracket/BracketGrid";
import { useLocale, useT, useTf } from "@/components/shell/LocaleProvider";
import type { MatchScheduleRow } from "@/lib/tournaments/format";

type Props = {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
  drawSize: number;
  seats: DrawSeat[];
  initialPicks: BracketPicks;
  initialConfidence: BracketConfidence;
  submittedAt: string | null;
  locked: boolean;
  isCommissioner: boolean;
  officialResults?: OfficialResults;
  schedule?: Record<string, MatchScheduleRow>;
  venueTz?: string;
  /** Soft upgrade CTA after submit while still alone. */
  showSoloInvite?: boolean;
};

type SaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "failed"
  | "offline";

const SAVE_DELAY_MS = 1200;

export function BracketEditor({
  leagueId,
  leagueSlug,
  tournamentId,
  tournamentRef,
  drawSize,
  seats,
  initialPicks,
  initialConfidence,
  submittedAt,
  locked,
  isCommissioner,
  officialResults = {},
  schedule = {},
  venueTz = "UTC",
  showSoloInvite = false,
}: Props) {
  const [picks, setPicks] = useState<BracketPicks>(() =>
    applyByeAdvances(seats, initialPicks, drawSize)
  );
  const [confidence, setConfidence] = useState<BracketConfidence>(
    () => initialConfidence
  );
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(Boolean(submittedAt));
  const [isLocked, setIsLocked] = useState(locked);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const picksRef = useRef(picks);
  const confidenceRef = useRef(confidence);
  picksRef.current = picks;
  confidenceRef.current = confidence;
  const t = useT();
  const tf = useTf();
  const locale = useLocale();

  useEffect(() => {
    function onOnline() {
      setStatus((s) => (s === "offline" ? "pending" : s));
    }
    function onOffline() {
      setStatus("offline");
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  function scheduleSave(nextPicks: BracketPicks, nextConf: BracketConfidence) {
    if (isLocked) return;
    setStatus((s) => (s === "offline" ? "offline" : "pending"));
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist(nextPicks, nextConf);
    }, SAVE_DELAY_MS);
  }

  async function persist(nextPicks: BracketPicks, nextConf: BracketConfidence) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("saving");
    const result = await saveBracketPicks({
      leagueId,
      tournamentId,
      picks: nextPicks,
      confidence: nextConf,
      leagueSlug,
      tournamentRef,
    });
    if (!result.ok) {
      if (result.code === "locked") {
        setIsLocked(true);
      }
      setStatus("failed");
      setMessage(result.error || t("bracket.fail"));
      return;
    }
    setStatus("saved");
    const savedMessage = t("bracket.saved");
    setMessage(savedMessage);
    window.setTimeout(() => {
      setStatus((s) => (s === "saved" ? "idle" : s));
      setMessage((m) => (m === savedMessage ? null : m));
    }, 1600);
  }

  function handlePick(matchKey: string, playerRef: string) {
    if (isLocked) return;
    const nextRaw = clearDownstream(picksRef.current, matchKey, playerRef);
    const next = applyByeAdvances(seats, nextRaw, drawSize);
    const nextConf = pruneConfidence(confidenceRef.current, next);
    setPicks(next);
    setConfidence(nextConf);
    scheduleSave(next, nextConf);
  }

  function handleConfidence(matchKey: string, level: number) {
    if (isLocked) return;
    if (!picksRef.current[matchKey]) return;
    const nextConf = { ...confidenceRef.current, [matchKey]: level };
    setConfidence(nextConf);
    scheduleSave(picksRef.current, nextConf);
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitBracket({
        leagueId,
        tournamentId,
        leagueSlug,
        tournamentRef,
      });
      if (!result.ok) {
        setMessage(result.error);
        if (result.code === "locked") setIsLocked(true);
        return;
      }
      setSubmitted(true);
      setMessage(t("tournament.entry.submitted"));
    });
  }

  function handleLockToggle(lockedNext: boolean) {
    startTransition(async () => {
      const result = await adminLockTournament({
        tournamentRef,
        locked: lockedNext,
        leagueSlug,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setIsLocked(lockedNext);
      setMessage(lockedNext ? t("bracket.lockedMsg") : t("bracket.unlockedMsg"));
    });
  }

  const made = countPicksMade(picks, drawSize);
  const need = totalMatches(drawSize);
  const complete = isBracketComplete(picks, drawSize);

  const hasOfficial = Object.keys(officialResults).length > 0;
  const statusText =
    status === "saving"
      ? t("bracket.saving")
      : status === "offline"
        ? t("bracket.offline")
        : status === "failed"
          ? message ?? t("bracket.fail")
          : status === "saved"
            ? t("bracket.saved")
            : status === "pending"
              ? t("bracket.autosave")
              : message ??
                (isLocked
                  ? hasOfficial
                    ? t("bracket.gradedHint")
                    : t("bracket.lockedHint")
                  : t("bracket.autosave"));

  return (
    <div className="stack gap-2xl">
      <div className="row wrap gap-md between">
        <p className="t-lead" aria-live="polite">
          <span className="numeral">{tf("bracket.picksMade", { made, need })}</span>
          {submitted ? ` · ${t("bracket.submitted")}` : ""}
          {isLocked ? ` · ${t("bracket.locked")}` : ""}
        </p>
        <div className="row wrap gap-md">
          {!isLocked ? (
            <button
              type="button"
              className="act act--prominent act--standard-size"
              disabled={!complete || pending || submitted}
              onClick={handleSubmit}
            >
              {submitted ? t("bracket.submitted") : t("bracket.submit")}
            </button>
          ) : (
            <span className="act act--standard act--standard-size" aria-disabled="true">
              {t("bracket.locked")}
            </span>
          )}
          {isCommissioner ? (
            <button
              type="button"
              className="act act--standard act--standard-size"
              disabled={pending}
              onClick={() => handleLockToggle(!isLocked)}
            >
              {isLocked ? t("bracket.unlock") : t("bracket.lock")}
            </button>
          ) : null}
        </div>
      </div>

      <p
        className="hint"
        role="status"
        aria-live="polite"
        data-tone={status === "failed" || status === "offline" ? "bad" : "flat"}
      >
        {statusText}
      </p>

      {!complete && !isLocked ? (
        <p className="hint">
          {tf("bracket.completeHint", { left: need - made })}
        </p>
      ) : null}

      {showSoloInvite && submitted && !isLocked ? (
        <section className="panel stack gap-md" aria-labelledby="solo-invite">
          <h2 id="solo-invite" className="section-title">
            {t("bracket.solo.invite.title")}
          </h2>
          <p className="t-body">{t("bracket.solo.invite.body")}</p>
          <Link
            href={`/leagues/${leagueSlug}?invite=1`}
            className="act act--prominent act--standard-size"
            style={{ alignSelf: "flex-start" }}
          >
            {t("bracket.solo.invite.cta")}
          </Link>
        </section>
      ) : null}

      <BracketFind
        drawSize={drawSize}
        seats={seats}
        picks={picks}
        official={officialResults}
        schedule={schedule}
        venueTz={venueTz}
        locale={locale}
      />

      <BracketGrid
        drawSize={drawSize}
        seats={seats}
        picks={picks}
        confidence={confidence}
        locked={isLocked}
        official={officialResults}
        schedule={schedule}
        venueTz={venueTz}
        locale={locale}
        onPick={handlePick}
        onConfidence={handleConfidence}
      />
    </div>
  );
}

function pruneConfidence(
  conf: BracketConfidence,
  picks: BracketPicks
): BracketConfidence {
  const next: BracketConfidence = {};
  for (const [key, level] of Object.entries(conf)) {
    if (picks[key]) next[key] = level;
  }
  return next;
}

/** When re-picking a match, drop later picks that depended on the old winner. */
function clearDownstream(
  picks: BracketPicks,
  matchKey: string,
  playerRef: string
): BracketPicks {
  const m = /^r(\d+)-m(\d+)$/.exec(matchKey);
  if (!m) return { ...picks, [matchKey]: playerRef };

  const round = Number(m[1]);
  const index = Number(m[2]);
  const next: BracketPicks = { ...picks, [matchKey]: playerRef };

  let r = round;
  let i = index;
  while (true) {
    const parentRound = r + 1;
    const parentIndex = Math.floor(i / 2);
    const parentKey = `r${parentRound}-m${parentIndex}`;
    if (!(parentKey in next)) break;
    const old = next[parentKey];
    // Only clear if parent currently holds a player that came from this subtree
    // Simplest correct approach: clear all ancestors
    delete next[parentKey];
    void old;
    r = parentRound;
    i = parentIndex;
  }

  // Also clear any deeper keys under this branch
  for (const key of Object.keys(next)) {
    const km = /^r(\d+)-m(\d+)$/.exec(key);
    if (!km) continue;
    const kr = Number(km[1]);
    const ki = Number(km[2]);
    if (kr <= round) continue;
    // Check if this match is a descendant of matchKey
    let pr = kr;
    let pi = ki;
    while (pr > round) {
      pr -= 1;
      pi = Math.floor(pi / 2);
    }
    if (pr === round && pi === index) {
      delete next[key];
    }
  }

  next[matchKey] = playerRef;
  return next;
}
