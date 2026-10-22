"use client";

import { useEffect, useRef } from "react";
import { hasSupabaseEnv } from "@/lib/env";
import {
  openLiveTournamentChannel,
  type LiveChannelClient,
} from "@/lib/live/channel";
import { createClient } from "@/lib/supabase/client";

export type { LiveTournamentWatch } from "@/lib/live/realtime";
export { liveTournamentTopic, liveTournamentWatches } from "@/lib/live/realtime";

export type LiveTournamentChange = {
  eventType: string;
  new: unknown;
  old: unknown;
};

type LiveTournamentListener = {
  onChange: (change: LiveTournamentChange) => void;
  onSubscribed: () => void;
  onDisconnect: (status: string) => void;
};

/**
 * One Postgres Changes subscription for one tournament.
 * The topic is `live:tournament:{ref}`. The filter is that tournament's id.
 * Unmount calls `removeChannel` so navigation does not leave the topic open.
 */
export function useLiveTournament(
  tournamentRef: string | null,
  tournamentId: string | null,
  listener: LiveTournamentListener
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    return openLiveTournamentChannel(
      createClient() as unknown as LiveChannelClient,
      tournamentRef ?? "",
      tournamentId ?? "",
      {
        onChange: (change) => listenerRef.current.onChange(change),
        onSubscribed: () => listenerRef.current.onSubscribed(),
        onDisconnect: (status) => listenerRef.current.onDisconnect(status),
      }
    );
  }, [tournamentRef, tournamentId]);
}
