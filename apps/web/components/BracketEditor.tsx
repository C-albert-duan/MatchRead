"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  applyByeAdvances,
  countPicksMade,
  isBracketComplete,
  totalMatches,
  type BracketPicks,
  type DrawSeat,
} from "@matchread/core";
import {
  adminLockTournament,
  saveBracketPicks,
  submitBracket,
} from "@/app/actions/brackets";
import { BracketGrid } from "@/components/BracketGrid";

type Props = {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
  drawSize: number;
  seats: DrawSeat[];
  initialPicks: BracketPicks;
  submittedAt: string | null;
  locked: boolean;
  isCommissioner: boolean;
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
  submittedAt,
  locked,
  isCommissioner,
}: Props) {
  const [picks, setPicks] = useState<BracketPicks>(() =>
    applyByeAdvances(seats, initialPicks, drawSize)
  );
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(Boolean(submittedAt));
  const [isLocked, setIsLocked] = useState(locked);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const picksRef = useRef(picks);
  picksRef.current = picks;

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

  function scheduleSave(next: BracketPicks) {
    if (isLocked) return;
    setStatus((s) => (s === "offline" ? "offline" : "pending"));
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist(next);
    }, SAVE_DELAY_MS);
  }

  async function persist(next: BracketPicks) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("saving");
    const result = await saveBracketPicks({
      leagueId,
      tournamentId,
      picks: next,
      leagueSlug,
      tournamentRef,
    });
    if (!result.ok) {
      if (result.code === "locked") {
        setIsLocked(true);
      }
      setStatus("failed");
      setMessage(
        result.error ||
          "Your bracket did not save. Nothing has been lost — try again."
      );
      return;
    }
    setStatus("saved");
    setMessage("Bracket saved");
    window.setTimeout(() => {
      setStatus((s) => (s === "saved" ? "idle" : s));
      setMessage((m) => (m === "Bracket saved" ? null : m));
    }, 1600);
  }

  function handlePick(matchKey: string, playerRef: string) {
    if (isLocked) return;
    const nextRaw = clearDownstream(picksRef.current, matchKey, playerRef);
    const next = applyByeAdvances(seats, nextRaw, drawSize);
    setPicks(next);
    scheduleSave(next);
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
      setMessage("Entry submitted for this league.");
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
      setMessage(
        lockedNext
          ? "Draw locked. Brackets are read-only."
          : "Lock cleared. Brackets are editable again."
      );
    });
  }

  const made = countPicksMade(picks, drawSize);
  const need = totalMatches(drawSize);
  const complete = isBracketComplete(picks, drawSize);

  const statusText =
    status === "saving"
      ? "Saving your bracket"
      : status === "offline"
        ? "You are offline. Bracket edits stay on this page until you reconnect."
        : status === "failed"
          ? message ??
            "Your bracket did not save. Nothing has been lost — try again."
          : status === "saved"
            ? "Bracket saved"
            : status === "pending"
              ? "Changes save automatically"
              : message ??
                (isLocked
                  ? "This draw is locked."
                  : "Changes save automatically");

  return (
    <div className="stack gap-2xl">
      <div className="row wrap gap-md between">
        <p className="t-lead" aria-live="polite">
          <span className="numeral">
            {made} of {need}
          </span>{" "}
          picks made
          {submitted ? " · Submitted" : ""}
          {isLocked ? " · Locked" : ""}
        </p>
        <div className="row wrap gap-md">
          {!isLocked ? (
            <button
              type="button"
              className="act act--prominent act--standard-size"
              disabled={!complete || pending || submitted}
              onClick={handleSubmit}
            >
              {submitted ? "Submitted" : "Submit my bracket"}
            </button>
          ) : (
            <span className="act act--standard act--standard-size" aria-disabled="true">
              Locked
            </span>
          )}
          {isCommissioner ? (
            <button
              type="button"
              className="act act--standard act--standard-size"
              disabled={pending}
              onClick={() => handleLockToggle(!isLocked)}
            >
              {isLocked ? "Unlock (fixture)" : "Lock draw now"}
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
          Submit stays off until every match has a pick ({need - made} left).
        </p>
      ) : null}

      <BracketGrid
        drawSize={drawSize}
        seats={seats}
        picks={picks}
        locked={isLocked}
        onPick={handlePick}
      />
    </div>
  );
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
