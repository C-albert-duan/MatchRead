"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** When false, no timer is armed. */
  enabled: boolean;
  /** Soft REST poll interval. Default 45s — gentle, not aggressive. */
  intervalMs?: number;
};

/**
 * MVP live fallback: revalidate the current RSC tree on an interval.
 * No websockets — see docs/runbooks/LIVE-LISTENER.md.
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
