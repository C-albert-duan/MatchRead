"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMyDisplayName } from "@/app/actions/profile";
import { safeNext } from "@/lib/safe-next";
import { useT } from "@/components/shell/LocaleProvider";

type Props = {
  nextParam: string | null;
  initialName?: string | null;
};

export function WelcomeNameForm({ nextParam, initialName }: Props) {
  const router = useRouter();
  const t = useT();
  const next = safeNext(nextParam);
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="stack gap-2xl focus-band"
      style={{ maxWidth: 480 }}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await saveMyDisplayName(name);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          try {
            sessionStorage.removeItem("mr_pending_display_name");
          } catch {
            /* ignore */
          }
          router.replace(next);
          router.refresh();
        });
      }}
    >
      <div className="page-header">
        <p className="eyebrow">{t("welcome.eyebrow")}</p>
        <h1 className="t-page-title">{t("welcome.title")}</h1>
        <p className="t-lead">{t("welcome.lede")}</p>
      </div>

      <div className="stack gap-sm">
        <label htmlFor="display-name" className="field-label">
          {t("welcome.name")}
        </label>
        <input
          id="display-name"
          name="displayName"
          autoComplete="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field"
          placeholder="e.g. Alex"
          maxLength={32}
          disabled={pending}
          required
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="hint">{t("welcome.hint")}</p>
        )}
      </div>

      <button
        type="submit"
        className="act act--prominent act--prominent-size"
        disabled={pending}
        style={{ alignSelf: "flex-start", minWidth: 160 }}
      >
        {pending ? t("welcome.saving") : t("welcome.continue")}
      </button>
    </form>
  );
}
