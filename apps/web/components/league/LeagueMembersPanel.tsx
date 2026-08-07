"use client";

import { useState, useTransition } from "react";
import { kickMember, leaveLeague } from "@/app/actions/leagues";
import { useT } from "@/components/shell/LocaleProvider";

type Member = {
  user_id: string;
  role: string;
  label: string;
};

type Props = {
  leagueId: string;
  slug: string;
  members: Member[];
  currentUserId: string;
  isCommissioner: boolean;
};

export function LeagueMembersPanel({
  leagueId,
  slug,
  members,
  currentUserId,
  isCommissioner,
}: Props) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canLeave = !isCommissioner;

  return (
    <section className="stack gap-md" aria-labelledby="members-heading">
      <h2 id="members-heading" className="section-title">
        {t("league.members")}
      </h2>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="member-list">
        {members.map((m) => {
          const canKick =
            isCommissioner &&
            m.role !== "commissioner" &&
            m.user_id !== currentUserId;
          return (
            <li key={m.user_id} className="member-row">
              <span className="numeral">{m.label}</span>
              <span className="row wrap gap-sm" style={{ alignItems: "center" }}>
                <span className="t-caption">
                  {m.role === "commissioner"
                    ? t("league.role.commissioner")
                    : t("league.role.member")}
                </span>
                {canKick ? (
                  <button
                    type="button"
                    className="act act--quiet"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(t("league.members.kickConfirm"))) {
                        return;
                      }
                      startTransition(async () => {
                        setError(null);
                        const result = await kickMember({
                          leagueId,
                          slug,
                          userId: m.user_id,
                        });
                        if (result && !result.ok) setError(result.error);
                      });
                    }}
                  >
                    {t("league.members.kick")}
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {canLeave ? (
        <div className="page-actions">
          <button
            type="button"
            className="act act--standard act--standard-size"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("league.members.leaveConfirm"))) return;
              startTransition(async () => {
                setError(null);
                const result = await leaveLeague(leagueId);
                if (result && !result.ok) setError(result.error);
              });
            }}
          >
            {t("league.members.leave")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
