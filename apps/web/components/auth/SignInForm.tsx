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
import { saveMyDisplayName } from "@/app/actions/profile";
import { PENDING_DISPLAY_NAME_KEY } from "@/components/shell/DisplayNameBootstrap";
import { useT, useTf } from "@/components/shell/LocaleProvider";
import type { MessageKey } from "@matchread/i18n";

type Props = {
  nextParam: string | null;
  configured: boolean;
  /** From `/sign-in?error=` after a failed magic-link callback. */
  authError?: string | null;
};

function keyForAuthError(code: string | null | undefined): MessageKey | null {
  if (!code) return null;
  if (code === "config") return "signin.errors.notConfigured";
  if (code === "otp_expired") return "signin.errors.otpExpired";
  if (code === "auth") return "signin.errors.authFailed";
  return "signin.errors.generic";
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
  const t = useT();
  const tf = useTf();
  const next = useMemo(() => safeNext(nextParam), [nextParam]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [otp, setOtp] = useState("");
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<
    "idle" | "invalid" | "submitting" | "sent" | "rate_limited" | "error"
  >(() => (authError ? "error" : "idle"));
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    const key = keyForAuthError(authError);
    return key ? t(key) : null;
  });
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
    try {
      const pending = displayName.trim();
      if (pending) sessionStorage.setItem(PENDING_DISPLAY_NAME_KEY, pending);
    } catch {
      /* ignore */
    }
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
    const name = displayName.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 32) {
      setStatus("invalid");
      setErrorMessage(t("signin.errors.invalidDisplayName"));
      return;
    }
    if (!isValidEmail(value)) {
      setStatus("invalid");
      setErrorMessage(t("signin.errors.invalidEmail"));
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    const { error } = await sendOtp(value);

    if (error) {
      const limited = isProviderRateLimit(error);
      setStatus(limited ? "rate_limited" : "error");
      setErrorMessage(
        limited ? t("signin.errors.rateLimited") : error.message
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
        limited ? t("signin.errors.rateLimited") : error.message
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
      setErrorMessage(t("signin.errors.sameEmailHint"));
      return;
    }
    if (!/^\d{6,8}$/.test(token)) {
      setErrorMessage(t("signin.errors.invalidCode"));
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
          ? t("signin.errors.codeExpired")
          : error.message
      );
      return;
    }

    const pendingName =
      displayName.trim() ||
      (typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(PENDING_DISPLAY_NAME_KEY) ?? ""
        : "");
    if (pendingName) {
      const saved = await saveMyDisplayName(pendingName);
      if (saved.ok) {
        try {
          sessionStorage.removeItem(PENDING_DISPLAY_NAME_KEY);
        } catch {
          /* ignore */
        }
      }
    }

    router.replace(next);
    router.refresh();
  }

  if (!configured) {
    return (
      <div className="stack gap-lg" style={{ maxWidth: 520 }}>
        <div className="page-header">
          <p className="eyebrow">{t("signin.eyebrow")}</p>
          <h1 className="t-page-title">{t("signin.title")}</h1>
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
          <p className="eyebrow">{t("signin.checkEmail.eyebrow")}</p>
          <h1 className="t-page-title">{t("signin.checkEmail.title")}</h1>
          <p className="t-lead">
            {tf("signin.checkEmail.lede", { email: email.trim() })}
          </p>
          {errorMessage ? (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <form className="stack gap-md" onSubmit={(e) => void onVerifyCode(e)}>
          <label htmlFor="otp" className="field-label">
            {t("signin.otp")}
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
            {verifying ? t("signin.verifying") : t("signin.verify")}
          </button>
        </form>

        <p className="hint">
          {tf("signin.redirectNote", {
            url: lastRedirectTo ?? `${getClientSiteUrl()}/auth/callback`,
          })}
        </p>

        <div className="row wrap gap-md">
          <button
            type="button"
            className="act act--standard act--standard-size"
            disabled={coolingDown || verifying}
            onClick={() => void onResend()}
          >
            {coolingDown
              ? tf("signin.resendWait", { s: secondsLeft })
              : t("signin.resend")}
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
            {t("signin.differentEmail")}
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
        <p className="eyebrow">{t("signin.eyebrow")}</p>
        <h1 className="t-page-title">{t("signin.title")}</h1>
        <p className="t-lead">{t("signin.lede")}</p>
      </div>

      <div className="stack gap-sm">
        <label htmlFor="display-name" className="field-label">
          {t("signin.displayName")}
        </label>
        <input
          id="display-name"
          name="displayName"
          autoComplete="nickname"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            if (status === "invalid" || status === "error") {
              setStatus("idle");
              setErrorMessage(null);
            }
          }}
          className="field"
          placeholder={t("signin.displayName.hint")}
          maxLength={32}
          disabled={status === "submitting"}
          required
        />
      </div>

      <div className="stack gap-sm">
        <label htmlFor="email" className="field-label">
          {t("signin.email")}
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
          <span className="choice-title">{t("signin.remember")}</span>
          <span className="t-caption">{t("signin.remember.hint")}</span>
        </span>
      </label>

      <button
        type="submit"
        className="act act--prominent act--prominent-size"
        disabled={status === "submitting" || coolingDown}
        style={{ alignSelf: "flex-start", minWidth: 160 }}
      >
        {status === "submitting"
          ? t("signin.sending")
          : coolingDown
            ? tf("signin.wait", { s: secondsLeft })
            : t("signin.sendLink")}
      </button>
    </form>
  );
}
