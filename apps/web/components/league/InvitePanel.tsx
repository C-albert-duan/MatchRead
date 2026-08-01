"use client";

import { useState, useTransition } from "react";
import { revokeAndReissueInvite } from "@/app/actions/leagues";

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
        Invite friends
      </button>
    );
  }

  return (
    <section className="panel stack gap-lg" aria-label="Invite friends">
      <div className="stack gap-sm">
        <p className="eyebrow">Invite</p>
        <h2 className="t-title3">One link. Copy it into the group chat.</h2>
        <p className="t-caption">
          Anyone with this link can join after signing in. You can revoke it and
          issue a fresh one anytime.
        </p>
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
          {copied ? "Copied" : "Copy invite link"}
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
              setMessage("Old link revoked. Refresh if the URL below looks stale.");
              window.location.reload();
            });
          }}
        >
          {pending ? "Working…" : "Revoke and re-issue"}
        </button>
        <button
          type="button"
          className="act act--quiet"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>

      {copyFailed ? (
        <p className="form-error" role="alert">
          Could not copy — select the link and copy manually.
        </p>
      ) : null}
      {message ? <p className="hint">{message}</p> : null}
    </section>
  );
}
