"use client";

import { useEffect, useRef } from "react";
import { saveMyDisplayName } from "@/app/actions/profile";

export const PENDING_DISPLAY_NAME_KEY = "mr_pending_display_name";

/** After magic-link sign-in, persist the name typed on the sign-in form. */
export function DisplayNameBootstrap() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    try {
      const pending = sessionStorage.getItem(PENDING_DISPLAY_NAME_KEY)?.trim();
      if (!pending) return;
      void saveMyDisplayName(pending).then((result) => {
        if (result.ok) {
          sessionStorage.removeItem(PENDING_DISPLAY_NAME_KEY);
        }
      });
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  return null;
}
