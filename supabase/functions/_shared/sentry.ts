/**
 * Optional Sentry for Edge functions.
 * SENTRY_DSN is a function secret. An empty value leaves the SDK disabled.
 * Default integrations stay off: Deno.serve is not request-scoped.
 */
import * as Sentry from "npm:@sentry/deno@11.5.0";

function edgeDsn(): string | undefined {
  const value = Deno.env.get("SENTRY_DSN")?.trim() || "";
  return value || undefined;
}

let started = false;

export function initSentry(): void {
  if (started) return;
  started = true;
  const dsn = edgeDsn();
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    defaultIntegrations: false,
  });
}

export function captureEdgeError(
  err: unknown,
  extras?: Record<string, string>
): void {
  initSentry();
  if (!edgeDsn()) return;
  const error = err instanceof Error ? err : new Error(String(err));
  try {
    Sentry.withScope((scope) => {
      if (extras) scope.setExtras(extras);
      Sentry.captureException(error);
    });
  } catch {
    /* reporting must not fail the request */
  }
}

export async function flushSentry(): Promise<void> {
  if (!edgeDsn()) return;
  try {
    await Sentry.flush(2000);
  } catch {
    /* reporting must not fail the request */
  }
}
