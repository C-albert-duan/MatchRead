import * as Sentry from "@sentry/nextjs";
import { captureOps } from "@/lib/ops-capture";

function sentryDsn(): string | undefined {
  const value = (
    process.env.SENTRY_DSN ||
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    ""
  ).trim();
  return value || undefined;
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
  if (!sentryDsn()) return;
  Sentry.captureException(error, extras ? { extra: extras } : undefined);
}
