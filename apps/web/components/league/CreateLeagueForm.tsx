"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createLeague } from "@/app/actions/leagues";
import { TOURNAMENT_OPTIONS } from "@/lib/leagues/types";

export function CreateLeagueForm() {
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
        <p className="eyebrow">New league</p>
        <h1 className="t-page-title">Start a league</h1>
        <p className="t-lead">
          Four decisions. Two of them cannot be changed afterwards, and both
          are marked.
        </p>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="stack gap-sm">
        <label htmlFor="name" className="field-label">
          League name
        </label>
        <input
          id="name"
          name="name"
          className="field"
          placeholder="Fourth Floor Slam Challenge"
          required
          maxLength={80}
          disabled={pending}
          aria-invalid={error?.toLowerCase().includes("name") || undefined}
        />
      </div>

      <fieldset className="choice-set">
        <legend className="eyebrow">Format — cannot be changed later</legend>
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
            <span className="choice-title">Single tournament</span>
            <span className="t-caption">
              One draw, one table, and the league ends with the final.
            </span>
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
            <span className="choice-title">Season league</span>
            <span className="t-caption">
              Every event you add scores into a running table. The league keeps
              its people between tournaments.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="choice-set">
        <legend className="eyebrow">Who can see it</legend>
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
            <span className="choice-title">Private</span>
            <span className="t-caption">
              Only people with the invite link. This is the default.
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
            <span className="choice-title">Public</span>
            <span className="t-caption">
              Anyone can find and read the standings. Members still hold their
              picks until the lock.
            </span>
          </span>
        </label>
      </fieldset>

      {format === "single" ? (
        <div className="stack gap-sm">
          <label htmlFor="tournament_label" className="field-label">
            Which tournament
          </label>
          <select
            id="tournament_label"
            name="tournament_label"
            className="field"
            disabled={pending}
            defaultValue={TOURNAMENT_OPTIONS[0].value}
          >
            {TOURNAMENT_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="hint">
            These are calendar events (US Open, etc.), not your existing leagues.
            This form always starts a <strong>new</strong> league. Your private
            leagues stay on{" "}
            <Link href="/leagues">My leagues</Link>. The draw does not have to
            exist yet — members join now and the bracket opens when it lands.
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
          {pending ? "Creating" : "Create league"}
        </button>
        <Link href="/leagues" className="act act--quiet">
          Cancel
        </Link>
      </div>
    </form>
  );
}
