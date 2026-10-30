"use client";

import { useMemo, useState, useTransition } from "react";
import type { MessageKey } from "@matchread/i18n";
import {
  addTournamentAction,
  enableCustomScheduleAction,
  removeTournamentAction,
} from "@/app/actions/leagues";
import { useT, useTf } from "@/components/shell/LocaleProvider";
import { EntryLockWhen } from "@/components/tournaments/EntryLockWhen";
import type { TournamentTimeLabels } from "@/lib/tournaments/time-facts";
import type {
  ScheduleErrorCode,
  ScheduleResult,
} from "@/lib/leagues/schedule-change";

function errorKey(code: ScheduleErrorCode): MessageKey {
  return `schedule.error.${code}` as MessageKey;
}

/** Actions are atomic and idempotent, so a thrown call is safe to retry. */
async function run(call: () => Promise<ScheduleResult>): Promise<ScheduleErrorCode | null> {
  try {
    const result = await call();
    return result.ok ? null : result.code;
  } catch {
    return "network";
  }
}

function ScheduleError({ code }: { code: ScheduleErrorCode | null }) {
  const t = useT();
  if (!code) return null;
  return (
    <p className="form-error" role="alert">
      {t(errorKey(code))}
    </p>
  );
}

export function CustomScheduleSwitch({
  slug,
  leagueName,
}: {
  slug: string;
  leagueName: string;
}) {
  const t = useT();
  const tf = useTf();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ScheduleErrorCode | null>(null);

  return (
    <div className="stack gap-sm">
      <p className="t-caption">{t("schedule.customizeLede")}</p>
      <div className="page-actions">
        <button
          type="button"
          className="act act--standard act--standard-size"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(tf("schedule.customizeConfirm", { league: leagueName }))) {
              return;
            }
            start(async () => {
              setError(await run(() => enableCustomScheduleAction({ slug })));
            });
          }}
        >
          {t("schedule.customize")}
        </button>
      </div>
      <ScheduleError code={error} />
    </div>
  );
}

export type ScheduleCandidate = {
  ref: string;
  name: string;
  tour: string;
  tierLabel: string | null;
  lockAt: string | null;
  venueTz: string | null;
  surfaceClass: string;
  dateLabel: string;
  monthLabel: string;
};

export function AddTournamentPicker({
  slug,
  candidates,
  locale,
  lockLabels,
}: {
  slug: string;
  candidates: ScheduleCandidate[];
  locale: string;
  lockLabels: Pick<TournamentTimeLabels, "today" | "tomorrow" | "entryLocks">;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<ScheduleErrorCode | null>(null);

  const months = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = new Map<string, ScheduleCandidate[]>();
    for (const c of candidates) {
      if (q && !c.name.toLowerCase().includes(q)) continue;
      const list = groups.get(c.monthLabel) ?? [];
      list.push(c);
      groups.set(c.monthLabel, list);
    }
    return [...groups.entries()];
  }, [candidates, query]);

  if (!open) {
    return (
      <button
        type="button"
        className="act act--standard act--standard-size"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {t("schedule.add")}
      </button>
    );
  }

  return (
    <div className="schedule-picker stack gap-md" role="region" aria-label={t("schedule.add")}>
      <div className="row wrap gap-sm" style={{ alignItems: "center" }}>
        <input
          type="search"
          className="field"
          style={{ flex: 1, minWidth: 0 }}
          placeholder={t("schedule.search")}
          aria-label={t("schedule.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="act act--quiet" onClick={() => setOpen(false)}>
          {t("schedule.close")}
        </button>
      </div>

      {candidates.length === 0 ? (
        <p className="t-body">{t("schedule.empty")}</p>
      ) : months.length === 0 ? (
        <p className="t-body">{t("schedule.noMatch")}</p>
      ) : (
        months.map(([month, rows]) => (
          <div key={month} className="stack gap-sm">
            <p className="eyebrow eyebrow--plain">{month}</p>
            <ul className="schedule-picker-list">
              {rows.map((c) => (
                <li key={c.ref} className="schedule-picker-row">
                  <span className={`court-hairline court-${c.surfaceClass}`} aria-hidden />
                  <span className="stack gap-sm" style={{ flex: 1, minWidth: 0 }}>
                    <span className="league-card-name">{c.name}</span>
                    <span className="t-caption numeral">
                      {[c.tour.toUpperCase(), c.tierLabel, c.dateLabel]
                        .filter(Boolean)
                        .join(" · ")}
                      {c.lockAt ? (
                        <>
                          {" · "}
                          <EntryLockWhen
                            lockAt={c.lockAt}
                            venueTz={c.venueTz}
                            locale={locale}
                            labels={lockLabels}
                          />
                        </>
                      ) : null}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="act act--standard act--standard-size"
                    disabled={pending}
                    aria-busy={pending && pendingRef === c.ref}
                    onClick={() => {
                      setPendingRef(c.ref);
                      start(async () => {
                        const code = await run(() =>
                          addTournamentAction({ slug, tournamentRef: c.ref })
                        );
                        setError(code);
                        if (!code) setOpen(false);
                      });
                    }}
                  >
                    {t("schedule.addOne")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <ScheduleError code={error} />
    </div>
  );
}

export function ScheduleRowMenu({
  slug,
  tournamentRef,
  name,
  leagueName,
  blockedBy,
}: {
  slug: string;
  tournamentRef: string;
  name: string;
  leagueName: string;
  /** Why Remove cannot apply: shown inline (no tooltips on phones). */
  blockedBy: "locked" | "brackets" | null;
}) {
  const t = useT();
  const tf = useTf();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ScheduleErrorCode | null>(null);

  if (blockedBy) {
    return (
      <p className="t-caption schedule-row-note">
        {blockedBy === "locked"
          ? t("schedule.locked")
          : t("schedule.error.brackets_exist")}
      </p>
    );
  }

  return (
    <div className="schedule-row-actions">
      <details className="schedule-menu">
        <summary
          className="act act--quiet"
          aria-label={tf("schedule.more", { name })}
        >
          •••
        </summary>
        <button
          type="button"
          className="act act--quiet"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(tf("schedule.removeConfirm", { name, league: leagueName }))) {
              return;
            }
            start(async () => {
              setError(
                await run(() => removeTournamentAction({ slug, tournamentRef }))
              );
            });
          }}
        >
          {t("schedule.remove")}
        </button>
      </details>
      <ScheduleError code={error} />
    </div>
  );
}
