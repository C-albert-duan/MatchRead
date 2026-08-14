"use client";

type Props = Record<string, string | number | boolean | null | undefined>;

function posthogKey(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || "";
}

function posthogHost(): string {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com"
  ).replace(/\/$/, "");
}

export function initTelemetry() {
  /* capture is on-demand; nothing to start */
}

export function track(event: string, props?: Props) {
  const apiKey = posthogKey();
  if (!apiKey || typeof window === "undefined") return;
  const distinct =
    window.localStorage?.getItem("mh-distinct") ||
    (() => {
      const id =
        crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16);
      try {
        window.localStorage.setItem("mh-distinct", id);
      } catch {
        /* ignore */
      }
      return id;
    })();
  void fetch(`${posthogHost()}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event,
      properties: { distinct_id: distinct, ...props },
    }),
    keepalive: true,
  }).catch(() => {
    /* never break the product for analytics */
  });
}
