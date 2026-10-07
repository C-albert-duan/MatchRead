"use client";

import { useSyncExternalStore } from "react";
import { viewerTimeZone } from "@/lib/tournaments/format";

function subscribeNoop() {
  return () => {};
}

/**
 * Viewer IANA zone after mount. Null on the server so clocks do not hydrate
 * against the machine zone. profiles has no time_zone; the browser zone is the viewer zone.
 */
export function useViewerTimeZone(): string | null {
  const browserZone = useSyncExternalStore(
    subscribeNoop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    () => null
  );
  return viewerTimeZone({ browserZone });
}
