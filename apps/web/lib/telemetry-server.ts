/** Server-side capture. PostHog when keyed; always writes ops_events. */
import { captureOps } from "@/lib/ops-capture";

type Props = Record<string, string | number | boolean | null | undefined>;

function posthogKey(): string {
  return (
    process.env.POSTHOG_KEY?.trim() ||
    process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ||
    ""
  );
}

function posthogHost(): string {
  return (
    process.env.POSTHOG_HOST?.trim() ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
    "https://us.i.posthog.com"
  ).replace(/\/$/, "");
}

export function trackServer(event: string, distinctId: string, props?: Props) {
  captureOps("event", event, { distinct_id: distinctId, ...props });
  const apiKey = posthogKey();
  if (!apiKey) return;
  void fetch(`${posthogHost()}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event,
      properties: { distinct_id: distinctId, ...props },
    }),
  }).catch(() => {
    /* never break a write path for analytics */
  });
}
