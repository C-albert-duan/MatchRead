"use client";

import { useEffect } from "react";
import { initTelemetry, track } from "@/lib/telemetry";

export function TelemetryRoot() {
  useEffect(() => {
    initTelemetry();
  }, []);
  return null;
}

export function TrackOnMount({
  event,
  props,
}: {
  event: string;
  props?: Record<string, string | number | boolean | null | undefined>;
}) {
  useEffect(() => {
    track(event, props);
    // Intentional: fire once per mount for this event name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}
