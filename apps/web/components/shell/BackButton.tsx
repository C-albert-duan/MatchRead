"use client";

import { useRouter } from "next/navigation";
import { signalNavigationStart } from "@/lib/nav-pending";

type Props = {
  label: string;
  /** Used when there is no in-app history (new tab / direct link). */
  fallbackHref?: string;
};

export function BackButton({ label, fallbackHref = "/" }: Props) {
  const router = useRouter();

  function goBack() {
    signalNavigationStart();

    if (typeof window === "undefined") {
      router.push(fallbackHref);
      return;
    }

    const referrer = document.referrer;
    const sameOrigin =
      Boolean(referrer) && referrer.startsWith(window.location.origin);

    if (sameOrigin || window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      className="back-btn"
      onClick={goBack}
      aria-label={label}
    >
      <span aria-hidden="true" className="back-btn-chevron">
        ←
      </span>
      <span>{label}</span>
    </button>
  );
}
