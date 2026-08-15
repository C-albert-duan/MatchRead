import { captureOps } from "@/lib/ops-capture";

type SentryTarget = { store: string; key: string };

function parseDsn(dsn: string): SentryTarget | null {
  try {
    const url = new URL(dsn);
    const key = url.username;
    const project = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    if (!key || !project) return null;
    return {
      key,
      store: `${url.protocol}//${url.host}/api/${project}/store/`,
    };
  } catch {
    return null;
  }
}

function dsn(): string {
  return (
    process.env.SENTRY_DSN?.trim() ||
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
    ""
  );
}

export function reportError(
  err: unknown,
  extras?: Record<string, string | number | boolean | null>
) {
  const error = err instanceof Error ? err : new Error(String(err));
  captureOps("error", error.name || "Error", {
    message: error.message.slice(0, 500),
    ...(extras ?? {}),
  });
  const target = parseDsn(dsn());
  if (!target) return;
  const payload = {
    event_id: crypto.randomUUID?.() || String(Date.now()),
    timestamp: new Date().toISOString(),
    platform: typeof window === "undefined" ? "node" : "javascript",
    level: "error",
    exception: {
      values: [
        {
          type: error.name || "Error",
          value: error.message,
          stacktrace: error.stack
            ? {
                frames: error.stack
                  .split("\n")
                  .slice(1, 12)
                  .map((line) => ({ filename: line.trim() })),
              }
            : undefined,
        },
      ],
    },
    extra: extras ?? {},
    request:
      typeof window === "undefined"
        ? undefined
        : { url: window.location.href },
  };
  void fetch(target.store, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=matchread/1.0, sentry_key=${target.key}`,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    /* never throw from reporting */
  });
}
