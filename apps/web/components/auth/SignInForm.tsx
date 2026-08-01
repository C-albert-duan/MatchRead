"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getClientSiteUrl } from "@/lib/site-url-client";
import { safeNext } from "@/lib/safe-next";
import {
  getRememberPref,
  setRememberPref,
} from "@/lib/auth/remember-client";

type Props = {
  nextParam: string | null;
  configured: boolean;
  /** From `/sign-in?error=` after a failed magic-link callback. */
  authError?: string | null;
};

function messageForAuthError(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "config") {
    return "Sign-in is not configured. Ask the host to check Supabase env on this deploy.";
  }
  if (code === "otp_expired") {
    return "That email link was already used or burned by an email scanner. Request a new link, then either click it once in this browser — or type the verification code from the email below.";
  }
  if (code === "auth") {
    return "That sign-in link is invalid or expired. Request a new one below — your invite destination is still saved.";
  }
  return "Could not finish sign-in. Request a new link below.";
}

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

export function SignInForm({ nextParam, configured, authError }: Props) {
  const router = useRouter();
  const next = useMemo(() => safeNext(nextParam), [nextParam]);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<
    "idle" | "invalid" | "submitting" | "sent" | "rate_limited" | "error"
  >(() => (authError ? "error" : "idle"));
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    messageForAuthError(authError)
  );
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [lastRedirectTo, setLastRedirectTo] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

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
    const redirectTo = `${getClientSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
    setLastRedirectTo(redirectTo);
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
          ? "Auth email rate limit hit (Supabase built-in sender is capped even on Pro). Wait a few minutes, check spam, try another inbox, or add custom SMTP in Supabase → Project Settings → Authentication → SMTP."
          : error.message
      );
      if (limited) {
        setCooldownUntil(Date.now() + 60_000);
      }
      return;
    }

    setOtp("");
    setEmailSent(true);
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
          ? "Auth email rate limit hit (Supabase built-in sender is capped even on Pro). Wait a few minutes, check spam, try another inbox, or add custom SMTP in Supabase → Project Settings → Authentication → SMTP."
          : error.message
      );
      if (limited) {
        setCooldownUntil(Date.now() + 60_000);
      }
      return;
    }
    setOtp("");
    setEmailSent(true);
    setStatus("sent");
    setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    const token = otp.replace(/\s/g, "");
    if (!isValidEmail(address)) {
      setErrorMessage("Enter the same email you used for the link.");
      return;
    }
    if (!/^\d{6,8}$/.test(token)) {
      setErrorMessage("Enter the verification code from the email.");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);
    setRememberPref(remember);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: address,
      token,
      type: "email",
    });

    if (error) {
      setStatus("sent");
      setErrorMessage(
        error.message.includes("expired") || error.message.includes("invalid")
          ? "That code is invalid or expired. Request a new email and try the new code."
          : error.message
      );
      return;
    }

    router.replace(next);
    router.refresh();
  }

  if (!configured) {
    return (
      <div className="stack gap-lg" style={{ maxWidth: 520 }}>
        <div className="page-header">
          <p className="eyebrow">Sign in</p>
          <h1 className="t-page-title">Sign in to MatchRead</h1>
        </div>
        <p className="form-error" role="alert">
          Supabase is not configured. Copy <code>.env.docker.example</code> to{" "}
          <code>.env.docker</code>, add your project URL and anon key, then run{" "}
          <code>docker compose --env-file .env.docker up --build</code>.
        </p>
        <p className="hint">
          In Supabase → Authentication → URL configuration, allow:{" "}
          <code>{getClientSiteUrl()}/auth/callback</code>
        </p>
      </div>
    );
  }

  if (emailSent) {
    const verifying = status === "submitting";
    return (
      <div className="stack gap-2xl focus-band" style={{ maxWidth: 520 }}>
        <div className="page-header">
          <p className="eyebrow">Check your email</p>
          <h1 className="t-page-title">A sign-in link is on its way.</h1>
          <p className="t-lead">
            We sent it to <strong>{email.trim()}</strong>. Prefer the
            verification code if your mail app previews links (that burns
            one-time URLs).
          </p>
          {errorMessage ? (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <form className="stack gap-md" onSubmit={(e) => void onVerifyCode(e)}>
          <label htmlFor="otp" className="field-label">
            Verification code
          </label>
          <input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="field"
            placeholder="12345678"
            disabled={verifying}
          />
          <button
            type="submit"
            className="act act--prominent act--prominent-size"
            disabled={verifying}
            style={{ alignSelf: "flex-start", minWidth: 160 }}
          >
            {verifying ? "Checking" : "Verify code"}
          </button>
        </form>

        <p className="hint">
          Or click the email link <strong>once</strong> in this same browser —
          do not paste a link you already opened. Redirect target:{" "}
          <code>{lastRedirectTo ?? `${getClientSiteUrl()}/auth/callback`}</code>
        </p>

        <div className="row wrap gap-md">
          <button
            type="button"
            className="act act--standard act--standard-size"
            disabled={coolingDown || verifying}
            onClick={() => void onResend()}
          >
            {coolingDown ? `Send it again (${secondsLeft}s)` : "Send it again"}
          </button>
          <button
            type="button"
            className="act act--quiet"
            disabled={verifying}
            onClick={() => {
              setStatus("idle");
              setErrorMessage(null);
              setOtp("");
              setLastRedirectTo(null);
              setEmailSent(false);
            }}
          >
            Use a different address
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="stack gap-2xl focus-band"
      style={{ maxWidth: 480 }}
      onSubmit={(e) => void onSubmit(e)}
      noValidate
    >
      <div className="page-header">
        <p className="eyebrow">Sign in</p>
        <h1 className="t-page-title">Sign in to MatchRead</h1>
        <p className="t-lead">
          We email you a link and a code. No password — a new address gets an
          account the first time it signs in.
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
