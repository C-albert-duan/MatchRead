"use client";

import { useState, useTransition } from "react";
import {
  deleteLeague,
  updateLeague,
  type ActionResult,
} from "@/app/actions/leagues";
import { useT } from "@/components/shell/LocaleProvider";
import type { LeagueVisibility } from "@/lib/leagues/types";

type Props = {
  leagueId: string;
  slug: string;
  initialName: string;
  initialVisibility: LeagueVisibility;
};

export function LeagueSettingsPanel({
  leagueId,
  slug,
  initialName,
  initialVisibility,
}: Props) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] =
    useState<LeagueVisibility>(initialVisibility);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyResult(result: ActionResult | void, okMessage: string) {
    if (result && !result.ok) {
      setError(result.error);
      setMessage(null);
      return;
    }
    setError(null);
    setMessage(okMessage);
  }

  return (
    <section className="panel stack gap-lg" aria-labelledby="league-settings">
      <div className="stack gap-sm">
        <h2 id="league-settings" className="section-title">
          {t("league.settings.title")}
        </h2>
        <p className="t-caption">{t("league.settings.lede")}</p>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="hint" role="status">
          {message}
        </p>
      ) : null}

      <div className="stack gap-sm">
        <label htmlFor="league-settings-name" className="field-label">
          {t("create.name")}
        </label>
        <input
          id="league-settings-name"
          className="field"
          value={name}
          maxLength={80}
          disabled={pending}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <fieldset className="choice-set">
        <legend className="eyebrow">{t("create.visibility.legend")}</legend>
        <label className="choice" data-selected={visibility === "private"}>
          <input
            type="radio"
            name="league-settings-visibility"
            value="private"
            checked={visibility === "private"}
            disabled={pending}
            onChange={() => setVisibility("private")}
          />
          <span className="stack gap-xs">
            <span className="choice-title">
              {t("create.visibility.private")}
            </span>
            <span className="t-caption">
              {t("create.visibility.private.body")}
            </span>
          </span>
        </label>
        <label className="choice" data-selected={visibility === "public"}>
          <input
            type="radio"
            name="league-settings-visibility"
            value="public"
            checked={visibility === "public"}
            disabled={pending}
            onChange={() => setVisibility("public")}
          />
          <span className="stack gap-xs">
            <span className="choice-title">{t("create.visibility.public")}</span>
            <span className="t-caption">
              {t("create.visibility.public.body")}
            </span>
          </span>
        </label>
      </fieldset>

      <div className="page-actions">
        <button
          type="button"
          className="act act--prominent act--prominent-size"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await updateLeague({
                leagueId,
                slug,
                name,
                visibility,
              });
              applyResult(result, t("league.settings.saved"));
            });
          }}
        >
          {pending ? t("league.settings.saving") : t("league.settings.save")}
        </button>
      </div>

      <div className="stack gap-sm" style={{ borderTop: "1px solid var(--mr-line)", paddingTop: "var(--s-lg)" }}>
        <p className="t-caption">{t("league.settings.danger")}</p>
        <button
          type="button"
          className="act act--standard act--standard-size"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t("league.settings.deleteConfirm"))) return;
            startTransition(async () => {
              const result = await deleteLeague(leagueId);
              applyResult(result, "");
            });
          }}
        >
          {t("league.settings.delete")}
        </button>
      </div>
    </section>
  );
}
