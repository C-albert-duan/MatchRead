"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportError(event.error ?? event.message, { source: "window.onerror" });
    };
    const onReject = (event: PromiseRejectionEvent) => {
      reportError(event.reason, { source: "unhandledrejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);
  return null;
}
