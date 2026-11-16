"use client";

import { useEffect } from "react";
import { VIEWER_ZONE_COOKIE } from "@/lib/tournaments/viewer-zone-cookie";

/** Stores the browser's time zone so server-rendered copy can use it (P2-7). */
export function ViewerZoneCookie() {
  useEffect(() => {
    let zone = "";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return;
    }
    if (!zone) return;
    const current = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${VIEWER_ZONE_COOKIE}=`))
      ?.slice(VIEWER_ZONE_COOKIE.length + 1);
    if (current && decodeURIComponent(current) === zone) return;
    document.cookie = `${VIEWER_ZONE_COOKIE}=${encodeURIComponent(zone)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);
  return null;
}
