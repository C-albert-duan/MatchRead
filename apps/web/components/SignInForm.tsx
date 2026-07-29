"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/site-url-client";
import { safeNext } from "@/lib/safe-next";

type Props = {
  nextParam: string | null;
  configured: boolean;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function SignInForm({ nextParam, configured }: Props) {
  const next = useMemo(() => safeNext(nextParam), [nextParam]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "invalid" | "submitting" | "sent" | "rate_limited" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Date.now() >= cooldownUntil) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const coolingDown = now < cooldownUntil;
  const secondsLeft = coolingDown
    ? Math.ceil((cooldownUntil - now) / 1000)
    : 0;

  async function sendOtp(address: string) {
    const supabase = createClient();
    const redirectTo = `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
    return supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectTo },
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!isValidEmail(value)) {
      setStatus("invalid");
      setErrorMessage("Enter a valid email address.");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    const { error } = await sendOtp(value);

    if (error) {
      const limited =
        error.status === 429 || /rate|too many/i.test(error.message);
      setStatus(limited ? "rate_limited" : "error");
      setErrorMessage(
        limited
          ? "Too many attempts. Wait a minute and try again."
          : error.message
      );
      return;
    }

    setStatus("sent");
    setCooldownUntil(Date.now() + 30_000);
  }

  async function onResend() {
    if (coolingDown) return;
    const value = email.trim();
    setStatus("submitting");
    setErrorMessage(null);
    const { error } = await sendOtp(value);
    if (error) {
      const limited =
        error.status === 429 || /rate|too many/i.test(error.message);
      setStatus(limited ? "rate_limited" : "error");
      setErrorMessage(
        limited
          ? "Too many attempts. Wait a minute and try again."
          : error.message
      );
      return;
    }
    setStatus("sent");
    setCooldownUntil(Date.now() + 30_000);
  }

  if (!configured) {
    return (
      <div className="stack gap-lg" style={{ maxWidth: 520 }}>
        <div className="stack gap-lg">
          <p className="eyebrow">Sign in</p>
          <h1 className="t-page-title">Sign in to MatchRead</h1>
        </div>
        <p className="form-error" role="alert">
          Supabase is not configured. Copy <code>.env.example</code> to{" "}
          <code>apps/web/.env.local</code>, add your project URL and anon key,
          then restart <code>npm run dev</code>.
        </p>
        <p className="hint">
          In Supabase → Authentication → URL configuration, allow:{" "}
          <code>{siteUrl()}/auth/callback</code>
        </p>
      </div>
    );
  }

  if (status === "sent") {
    return (
      <div className="stack gap-2xl" style={{ maxWidth: 520 }}>
        <div className="stack gap-lg">
          <p className="eyebrow">Check your email</p>
          <h1 className="t-page-title">A sign-in link is on its way.</h1>
          <p className="t-lead">
            We sent it to <strong>{email.trim()}</strong>. The link signs you in
            and brings you straight back to where you were.
          </p>
        </div>
        <div className="row wrap gap-md">
          <button
            type="button"
            className="act act--standard act--standard-size"
            disabled={coolingDown}
            onClick={() => void onResend()}
          >
            {coolingDown ? `Send it again (${secondsLeft}s)` : "Send it again"}
          </button>
          <button
            type="button"
            className="act act--quiet"
            onClick={() => {
              setStatus("idle");
              setErrorMessage(null);
            }}
          >
            Use a different address
          </button>
        </div>
        <p className="hint">
          Nothing arrived? Check spam, then try again in 30 seconds — we limit
          how often a link can be sent to one address.
        </p>
      </div>
    );
  }

  return (
    <form
      className="stack gap-2xl"
      style={{ maxWidth: 480 }}
      onSubmit={(e) => void onSubmit(e)}
      noValidate
    >
      <div className="stack gap-lg">
        <p className="eyebrow">Sign in</p>
        <h1 className="t-page-title">Sign in to MatchRead</h1>
        <p className="t-lead">
          We email you a link. No password to remember, and no account to create
          first — a new address gets an account the first time it signs in.
        </p>
      </div>

      <div className="stack gap-sm">
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "invalid" || status === "error") {
              setStatus("idle");
              setErrorMessage(null);
            }
          }}
          aria-invalid={status === "invalid" || undefined}
          aria-describedby={errorMessage ? "email-error" : undefined}
          className="field"
          disabled={status === "submitting"}
        />
        {errorMessage ? (
          <p id="email-error" className="form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        className="act act--prominent act--prominent-size"
        disabled={status === "submitting"}
        style={{ alignSelf: "flex-start", minWidth: 160 }}
      >
        {status === "submitting" ? "Sending" : "Send me a link"}
      </button>
    </form>
  );
}
