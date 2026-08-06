"use client";

import { useState, useTransition } from "react";
import { revokeAndReissueInvite } from "@/app/actions/leagues";
import { useT } from "@/components/shell/LocaleProvider";

type Props = {
  leagueId: string;
  slug: string;
  inviteUrl: string;
  defaultOpen?: boolean;
};

export function InvitePanel({
  leagueId,
  slug,
  inviteUrl,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const t = useT();

  async function copyLink() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="act act--prominent act--prominent-size"
        onClick={() => setOpen(true)}
      >
        {t("invite.cta")}
      </button>
    );
  }

  return (
    <section className="panel stack gap-lg" aria-label={t("invite.cta")}>
      <div className="stack gap-sm">
        <p className="eyebrow">{t("invite.eyebrow")}</p>
        <h2 className="t-title3">{t("invite.title")}</h2>
        <p className="t-caption">{t("invite.hint")}</p>
      </div>

      <div className="invite-url" tabIndex={0}>
        {inviteUrl}
      </div>

      <div className="row wrap gap-md">
        <button
          type="button"
          className="act act--prominent act--prominent-size"
          onClick={() => void copyLink()}
        >
          {copied ? t("invite.copied") : t("invite.copy")}
        </button>
        <button
          type="button"
          className="act act--standard act--standard-size"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              setMessage(null);
              const result = await revokeAndReissueInvite(leagueId, slug);
              if (!result.ok) {
                setMessage(result.error);
                return;
              }
              setMessage(t("invite.revoked"));
              window.location.reload();
            });
          }}
        >
          {pending ? t("invite.working") : t("invite.revoke")}
        </button>
        <button
          type="button"
          className="act act--quiet"
          onClick={() => setOpen(false)}
        >
          {t("invite.close")}
        </button>
      </div>

      {copyFailed ? (
        <p className="form-error" role="alert">
          {t("invite.copyFailed")}
        </p>
      ) : null}
      {message ? <p className="hint">{message}</p> : null}
    </section>
  );
}
