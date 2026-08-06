"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createLeague } from "@/app/actions/leagues";
import { useT } from "@/components/shell/LocaleProvider";
import { TOURNAMENT_OPTIONS } from "@/lib/leagues/types";
import type { MessageKey } from "@matchread/i18n";

const OPTION_LABEL_KEY: Record<
  (typeof TOURNAMENT_OPTIONS)[number]["ref"],
  MessageKey
> = {
  "uso-2026": "create.opt.uso",
  "wim-2026": "create.opt.wim",
  "rg-2026": "create.opt.rg",
};

export function CreateLeagueForm() {
  const t = useT();
  const [format, setFormat] = useState<"single" | "season">("single");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="stack gap-3xl focus-band"
      style={{ maxWidth: 560 }}
      action={(fd) => {
        startTransition(async () => {
          setError(null);
          const result = await createLeague(fd);
          if (result && !result.ok) {
            setError(result.error);
          }
        });
      }}
    >
      <div className="page-header">
        <p className="eyebrow">{t("create.eyebrow")}</p>
        <h1 className="t-page-title">{t("create.title")}</h1>
        <p className="t-lead">{t("create.lede")}</p>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="stack gap-sm">
        <label htmlFor="name" className="field-label">
          {t("create.name")}
        </label>
        <input
          id="name"
          name="name"
          className="field"
          placeholder={t("create.name.placeholder")}
          required
          maxLength={80}
          disabled={pending}
          aria-invalid={error?.toLowerCase().includes("name") || undefined}
        />
      </div>

      <fieldset className="choice-set">
        <legend className="eyebrow">{t("create.format.legend")}</legend>
        <label className="choice" data-selected={format === "single"}>
          <input
            type="radio"
            name="format"
            value="single"
            checked={format === "single"}
            onChange={() => setFormat("single")}
            disabled={pending}
          />
          <span className="stack gap-xs">
            <span className="choice-title">{t("league.format.single")}</span>
            <span className="t-caption">{t("create.format.single.body")}</span>
          </span>
        </label>
        <label className="choice" data-selected={format === "season"}>
          <input
            type="radio"
            name="format"
            value="season"
            checked={format === "season"}
            onChange={() => setFormat("season")}
            disabled={pending}
          />
          <span className="stack gap-xs">
            <span className="choice-title">{t("league.format.season")}</span>
            <span className="t-caption">{t("create.format.season.body")}</span>
          </span>
        </label>
      </fieldset>

      <fieldset className="choice-set">
        <legend className="eyebrow">{t("create.visibility.legend")}</legend>
        <label className="choice" data-selected={visibility === "private"}>
          <input
            type="radio"
            name="visibility"
            value="private"
            checked={visibility === "private"}
            onChange={() => setVisibility("private")}
            disabled={pending}
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
            name="visibility"
            value="public"
            checked={visibility === "public"}
            onChange={() => setVisibility("public")}
            disabled={pending}
          />
          <span className="stack gap-xs">
            <span className="choice-title">{t("create.visibility.public")}</span>
            <span className="t-caption">
              {t("create.visibility.public.body")}
            </span>
          </span>
        </label>
      </fieldset>

      {format === "single" ? (
        <div className="stack gap-sm">
          <label htmlFor="tournament_label" className="field-label">
            {t("create.tournament")}
          </label>
          <select
            id="tournament_label"
            name="tournament_label"
            className="field"
            disabled={pending}
            defaultValue={TOURNAMENT_OPTIONS[0].value}
          >
            {TOURNAMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(OPTION_LABEL_KEY[opt.ref])}
              </option>
            ))}
          </select>
          <p className="hint">
            {t("create.tournament.hint.before")}{" "}
            <strong>{t("create.tournament.hint.new")}</strong>{" "}
            {t("create.tournament.hint.mid")}{" "}
            <Link href="/leagues">{t("create.tournament.hint.myLeagues")}</Link>
            {t("create.tournament.hint.after")}
          </p>
        </div>
      ) : (
        <input type="hidden" name="tournament_label" value="" />
      )}

      <div className="row wrap gap-md">
        <button
          type="submit"
          className="act act--prominent act--prominent-size"
          disabled={pending}
        >
          {pending ? t("create.creating") : t("create.submit")}
        </button>
        <Link href="/leagues" className="act act--quiet">
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
