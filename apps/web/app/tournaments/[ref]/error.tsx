"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

export default function TournamentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, {
      source: "tournament.page",
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Tournament</p>
        <h1 className="t-page-title">This page failed to load</h1>
        <p className="t-lead">The error was reported. Try again in a moment.</p>
        <div className="page-actions">
          <button
            type="button"
            className="act act--prominent act--prominent-size"
            onClick={() => reset()}
          >
            Try again
          </button>
        </div>
      </header>
    </div>
  );
}
