"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/site-url-client";
import { safeNext } from "@/lib/safe-next";
import {
  getRememberPref,
  setRememberPref,
} from "@/lib/auth/remember-client";

type Props = {
  nextParam: string | null;
  configured: boolean;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Only treat real provider throttling — not every message that mentions "rate". */
function isProviderRateLimit(error: {
  status?: number;
  code?: string;
  message: string;
}): boolean {
  if (error.status === 429) return true;
  const code = (error.code ?? "").toLowerCase();
  if (code.includes("over_email_send_rate_limit")) return true;
  if (code.includes("rate_limit")) return true;
  return /over_email_send_rate_limit|email rate limit exceeded/i.test(
    error.message
  );
}

const RESEND_COOLDOWN_MS = 10_000;

export function SignInForm({ nextParam, configured }: Props) {
  const next = useMemo(() => safeNext(nextParam), [nextParam]);
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<
    "idle" | "invalid" | "submitting" | "sent" | "rate_limited" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setRemember(getRememberPref());
  }, []);

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
    setRememberPref(remember);
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
      const limited = isProviderRateLimit(error);
      setStatus(limited ? "rate_limited" : "error");
      setErrorMessage(
        limited
          ? "Supabase email limit hit (common on free tier while testing). Wait a few minutes, check spam, or use a different address."
          : error.message
      );
      if (limited) {
        setCooldownUntil(Date.now() + 60_000);
      }
      return;
    }

    setStatus("sent");
    setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
  }

  async function onResend() {
    if (coolingDown) return;
    const value = email.trim();
    setStatus("submitting");
    setErrorMessage(null);
    const { error } = await sendOtp(value);
    if (error) {
      const limited = isProviderRateLimit(error);
      setStatus(limited ? "rate_limited" : "error");
      setErrorMessage(
        limited
          ? "Supabase email limit hit (common on free tier while testing). Wait a few minutes, check spam, or use a different address."
          : error.message
      );
      if (limited) {
        setCooldownUntil(Date.now() + 60_000);
      }
      return;
    }
    setStatus("sent");
    setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
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
          Nothing arrived? Check spam. You can resend after a short pause — during
          heavy testing Supabase&apos;s free email quota runs out quickly; use a
          second inbox or wait a few minutes.
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
            if (
              status === "invalid" ||
              status === "error" ||
              status === "rate_limited"
            ) {
              setStatus("idle");
              setErrorMessage(null);
            }
          }}
          aria-invalid={
            status === "invalid" || status === "error" || status === "rate_limited"
              ? true
              : undefined
          }
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

      <label className="remember">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => {
            const nextRemember = e.target.checked;
            setRemember(nextRemember);
            setRememberPref(nextRemember);
          }}
          disabled={status === "submitting"}
        />
        <span className="stack gap-xs">
          <span className="choice-title">Stay signed in on this device</span>
          <span className="t-caption">
            You won&apos;t need a new email link every visit. Uncheck on shared
            computers.
          </span>
        </span>
      </label>

      <button
        type="submit"
        className="act act--prominent act--prominent-size"
        disabled={status === "submitting" || coolingDown}
        style={{ alignSelf: "flex-start", minWidth: 160 }}
      >
        {status === "submitting"
          ? "Sending"
          : coolingDown
            ? `Wait ${secondsLeft}s`
            : "Send me a link"}
      </button>
    </form>
  );
}
