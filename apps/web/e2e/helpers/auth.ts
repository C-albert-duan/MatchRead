import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

export const SECONDARY_EMAIL =
  process.env.E2E_SECONDARY_EMAIL || "clever.albert@hotmail.com";
export const FOUNDER_EMAIL =
  process.env.E2E_FOUNDER_EMAIL || "themorgan994@gmail.com";
export const E2E_REF = process.env.E2E_REF || "e2e-live-checklist";

const INBOX = resolve(process.cwd(), "e2e/.otp-inbox");
const WAITING = resolve(process.cwd(), "e2e/.otp-waiting");

/** Clear any stale OTP handoff files. */
export function clearOtpInbox() {
  for (const p of [INBOX, WAITING]) {
    if (existsSync(p)) unlinkSync(p);
  }
}

/**
 * Block until the agent/user drops an 8-digit code into e2e/.otp-inbox.
 * Writes e2e/.otp-waiting so the agent can detect the pause.
 */
export async function waitForOtpCode(
  email: string,
  label: string,
  timeoutMs = 15 * 60_000
): Promise<string> {
  mkdirSync(resolve(process.cwd(), "e2e"), { recursive: true });
  if (existsSync(INBOX)) unlinkSync(INBOX);
  writeFileSync(
    WAITING,
    JSON.stringify({ email, label, at: new Date().toISOString() }, null, 2) +
      "\n"
  );
  console.log(
    `\n>>> OTP REQUIRED for ${email} (${label}).\n` +
      `>>> Reply in chat with the 8-digit code — the agent will write e2e/.otp-inbox.\n`
  );

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (existsSync(INBOX)) {
      const raw = readFileSync(INBOX, "utf8").trim();
      const code = raw.replace(/\s/g, "");
      try {
        unlinkSync(INBOX);
      } catch {
        /* ignore */
      }
      try {
        unlinkSync(WAITING);
      } catch {
        /* ignore */
      }
      if (/^\d{6,8}$/.test(code)) return code;
      console.log(">>> Invalid OTP payload, still waiting…", raw);
      writeFileSync(
        WAITING,
        JSON.stringify({ email, label, at: new Date().toISOString() }, null, 2) +
          "\n"
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for OTP for ${email} (${label})`);
}

/**
 * Prefer admin generate_link (no email) when E2E_SUPABASE_SERVICE_ROLE_KEY is set.
 * Falls back to UI OTP + chat handoff.
 */
export async function signInWithEmailOtp(
  page: Page,
  email: string,
  displayName: string,
  label: string,
  nextPath: string
) {
  const viaAdmin = await signInViaAdminMagicLink(page, email, nextPath);
  if (viaAdmin) {
    console.log(`>>> Signed in ${email} via admin magic link (${label}) — no email OTP.`);
    return;
  }

  await page.goto(`/sign-in?next=${encodeURIComponent(nextPath)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#display-name").fill(displayName);
  await page.locator("#email").fill(email);

  const sendBtn = page.getByRole("button", { name: /Send me a link/i });
  await sendBtn.click();

  const otpField = page.getByLabel(/Verification code/i);
  const rateAlert = page.getByRole("alert").filter({ hasText: /rate limit/i });
  for (let i = 0; i < 40; i++) {
    if (await otpField.isVisible().catch(() => false)) break;
    if (await rateAlert.isVisible().catch(() => false)) {
      throw new Error(
        `Auth email rate-limited for ${email}. Set E2E_SUPABASE_SERVICE_ROLE_KEY or wait and retry.`
      );
    }
    await page.waitForTimeout(1000);
  }
  await otpField.waitFor({ state: "visible", timeout: 5_000 });

  const code = await waitForOtpCode(email, label);
  await page.locator("#otp").fill(code);
  await page.getByRole("button", { name: /Verify code/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 60_000,
  });
}

async function signInViaAdminMagicLink(
  page: Page,
  email: string,
  nextPath: string
): Promise<boolean> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
    /\/$/,
    ""
  );
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !serviceKey || !anonKey) return false;

  const site = (
    process.env.LIVE_BASE_URL || "https://www.matchreadtennis.com"
  ).replace(/\/$/, "");
  const redirectTo = `${site}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  // Top-level redirect_to is required — options.redirect_to is ignored by GoTrue.
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "magiclink",
      email,
      redirect_to: redirectTo,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.log(
      `>>> admin generate_link failed (${res.status}): ${text.slice(0, 200)}`
    );
    return false;
  }
  let data: {
    email_otp?: string;
    action_link?: string;
    properties?: { email_otp?: string; action_link?: string };
  };
  try {
    data = JSON.parse(text);
  } catch {
    return false;
  }
  const emailOtp = data.email_otp || data.properties?.email_otp;
  if (!emailOtp) {
    console.log(">>> admin generate_link returned no email_otp");
    return false;
  }

  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "email",
      email,
      token: emailOtp,
    }),
  });
  const verifyText = await verifyRes.text();
  if (!verifyRes.ok) {
    console.log(
      `>>> verify OTP failed (${verifyRes.status}): ${verifyText.slice(0, 200)}`
    );
    return false;
  }
  let sessionBody: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
    token_type?: string;
    user?: unknown;
  };
  try {
    sessionBody = JSON.parse(verifyText);
  } catch {
    return false;
  }
  if (!sessionBody.access_token || !sessionBody.refresh_token) {
    console.log(">>> verify response missing tokens");
    return false;
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionJson = JSON.stringify({
    access_token: sessionBody.access_token,
    refresh_token: sessionBody.refresh_token,
    expires_in: sessionBody.expires_in ?? 3600,
    expires_at:
      sessionBody.expires_at ??
      Math.floor(Date.now() / 1000) + (sessionBody.expires_in ?? 3600),
    token_type: sessionBody.token_type ?? "bearer",
    user: sessionBody.user,
  });

  // Match @supabase/ssr cookieEncoding=base64url without importing CJS internals.
  const encoded = `base64-${toBase64Url(sessionJson)}`;
  const chunks = chunkCookie(storageKey, encoded);

  const hostname = new URL(site).hostname;
  await page.context().addCookies([
    {
      name: "mr_remember",
      value: "1",
      domain: hostname,
      path: "/",
      secure: true,
      sameSite: "Lax",
    },
    ...chunks.map((c) => ({
      name: c.name,
      value: c.value,
      domain: hostname,
      path: "/",
      secure: true,
      sameSite: "Lax" as const,
      httpOnly: false,
    })),
  ]);

  await page.goto(nextPath.startsWith("http") ? nextPath : `${site}${nextPath}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(
    (url) =>
      url.hostname.includes("matchreadtennis.com") &&
      !url.pathname.includes("/sign-in"),
    { timeout: 60_000 }
  );
  return true;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Mirror @supabase/ssr createChunks (3180 encoded chars). */
function chunkCookie(
  key: string,
  value: string
): { name: string; value: string }[] {
  const max = 3180;
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= max) return [{ name: key, value }];
  const chunks: string[] = [];
  while (encodedValue.length > 0) {
    let head = encodedValue.slice(0, max);
    const lastEscape = head.lastIndexOf("%");
    if (lastEscape > max - 3) head = head.slice(0, lastEscape);
    let decoded = "";
    while (head.length > 0) {
      try {
        decoded = decodeURIComponent(head);
        break;
      } catch {
        if (head.at(-3) === "%" && head.length > 3) {
          head = head.slice(0, head.length - 3);
        } else {
          throw new Error("cookie chunk decode failed");
        }
      }
    }
    chunks.push(decoded);
    encodedValue = encodedValue.slice(head.length);
  }
  return chunks.map((v, i) => ({ name: `${key}.${i}`, value: v }));
}

/** Click through an open 8-draw bracket and submit. */
export async function fillAndSubmitEightDraw(page: Page) {
  const region = page.getByRole("region", { name: /Tournament bracket/i });
  await region.scrollIntoViewIfNeeded().catch(() => undefined);

  // Chips are <label><input type="radio" class="sr-only">…</label> inside .slot.
  for (let i = 0; i < 28; i++) {
    const submit = page.getByRole("button", { name: /Submit my bracket/i });
    if (await submit.isEnabled().catch(() => false)) break;

    const unpickedSlot = page.locator('.slot[data-unpicked="true"]').first();
    if (await unpickedSlot.isVisible().catch(() => false)) {
      await unpickedSlot.scrollIntoViewIfNeeded();
      const radio = unpickedSlot
        .locator('input[type="radio"]:not(:checked)')
        .first();
      await radio.check({ force: true });
    } else {
      const empty = page.locator('.slot[role="radiogroup"]').filter({
        has: page.locator('input[type="radio"]:not(:checked)'),
        hasNot: page.locator('input[type="radio"]:checked'),
      });
      if ((await empty.count()) === 0) break;
      await empty.first().scrollIntoViewIfNeeded();
      await empty
        .first()
        .locator('input[type="radio"]:not(:checked)')
        .first()
        .check({ force: true });
    }

    const conf = page
      .locator(".confidence-row")
      .filter({ hasNot: page.locator('[data-active="true"]') })
      .first()
      .getByRole("button", { name: /Confidence 3 of 5/i });
    if (await conf.isVisible().catch(() => false)) {
      await conf.click();
    }
    await page.waitForTimeout(500);
  }

  // Autosave debounces ~1.2s — wait for persist before submit RPC.
  await page.getByText(/7 of 7 picks made/i).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(2000);
  await page
    .getByText(/Bracket saved|Changes save automatically/i)
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined);

  const submit = page.getByRole("button", { name: /Submit my bracket/i });
  await expectEnabled(submit);
  await submit.click();

  const submittedBtn = page.getByRole("button", { name: /^Submitted$/i });
  const failHint = page.locator('[data-tone="bad"], .hint[data-tone="bad"]');
  try {
    await submittedBtn.waitFor({ timeout: 45_000 });
  } catch {
    const err = (await failHint.textContent().catch(() => null))?.trim();
    throw new Error(
      err
        ? `Submit failed: ${err}`
        : "Submit clicked but bracket did not reach Submitted state"
    );
  }
}

async function expectEnabled(
  locator: import("@playwright/test").Locator,
  timeoutMs = 15_000
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await locator.isEnabled().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Submit my bracket stayed disabled");
}
