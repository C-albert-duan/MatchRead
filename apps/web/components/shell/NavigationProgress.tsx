"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV_START_EVENT } from "@/lib/nav-pending";

const CLEAR_MS = 8000;

function isModifiedClick(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

function shouldTrackAnchor(a: HTMLAnchorElement): boolean {
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  const href = a.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      if (url.origin !== window.location.origin) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Instant feedback on in-app navigation: top progress bar + soft dim on main.
 * Clears when the route changes (or after a safety timeout).
 */
export function NavigationProgress({ label }: { label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [stroke, setStroke] = useState(0);

  useEffect(() => {
    setPending(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    function start() {
      setStroke((n) => n + 1);
      setPending(true);
    }

    function onClick(e: MouseEvent) {
      if (isModifiedClick(e)) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const a = target.closest("a");
      if (!(a instanceof HTMLAnchorElement)) return;
      if (!shouldTrackAnchor(a)) return;

      const href = a.getAttribute("href");
      if (!href) return;

      try {
        const next = new URL(href, window.location.href);
        const cur = window.location;
        if (next.pathname === cur.pathname && next.search === cur.search) {
          return;
        }
      } catch {
        return;
      }

      start();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener(NAV_START_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAV_START_EVENT, start);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => setPending(false), CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [pending, stroke]);

  useEffect(() => {
    document.documentElement.dataset.navPending = pending ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.navPending;
    };
  }, [pending]);

  return (
    <div
      className="nav-progress"
      data-active={pending ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-busy={pending}
    >
      {pending ? (
        <div key={stroke} className="nav-progress-bar" />
      ) : null}
      <span className="sr-only">{pending ? label : ""}</span>
    </div>
  );
}
