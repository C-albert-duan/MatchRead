/**
 * First-party ops sink. Writes through log_client_event (migration 0047), which
 * stamps origin/uid and refuses the pipeline's integrity names. Also used when
 * Sentry/PostHog keys are unset.
 */

type Payload = Record<string, string | number | boolean | null | undefined>;

function restTarget(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function captureOps(
  kind: "error" | "event",
  name: string,
  payload?: Payload
) {
  const target = restTarget();
  if (!target) return;
  const trimmed = String(name || "").slice(0, 80);
  if (!trimmed) return;
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (v === undefined) continue;
    body[k] = v;
  }
  void fetch(`${target.url}/rest/v1/rpc/log_client_event`, {
    method: "POST",
    headers: {
      apikey: target.key,
      Authorization: `Bearer ${target.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ p_kind: kind, p_name: trimmed, p_payload: body }),
    keepalive: true,
  }).catch(() => {
    /* never throw from reporting */
  });
}
