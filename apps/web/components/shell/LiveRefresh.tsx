"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** When false, no timer is armed. */
  enabled: boolean;
  /** Soft REST poll interval. Default 45s — gentle, not aggressive. */
  intervalMs?: number;
};

/** Soft REST poll: revalidate the current RSC tree on an interval.
 * Mounted from AppShell on every page so public calendar and brackets
 * pick up sync-facts writes without a manual refresh.
 * Backend: EventMapper + sync-facts (~5m); this is the browser fallback.
 */
export function LiveRefresh({ enabled, intervalMs = 45_000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    if (intervalMs < 5_000) return;

    const id = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [enabled, intervalMs, router]);

  return null;
}
