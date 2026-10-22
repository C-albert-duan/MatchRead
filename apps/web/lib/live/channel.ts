import { isRealtimeLoss } from "./disconnect.ts";
import { liveTournamentChangeFilter, liveTournamentTopic } from "./realtime.ts";
import { isPublicTournamentRef } from "./view.ts";

export type LiveChannelChange = {
  eventType: string;
  new: unknown;
  old: unknown;
};

export type LiveChannelHandlers = {
  onChange: (change: LiveChannelChange) => void;
  onSubscribed: () => void;
  onDisconnect: (status: string) => void;
};

type ChannelPayload = {
  eventType: string;
  new: unknown;
  old: unknown;
};

type PostgresFilter = {
  event: "*";
  schema: "public";
  table: "live_match_state";
  filter: string;
};

export type LiveChannel = {
  on(
    event: "postgres_changes",
    filter: PostgresFilter,
    callback: (payload: ChannelPayload) => void
  ): LiveChannel;
  subscribe(callback: (status: string) => void): LiveChannel;
};

export type LiveChannelClient = {
  channel(topic: string): LiveChannel;
  removeChannel(channel: LiveChannel): unknown;
};

/**
 * One tournament topic. The returned function is the unmount cleanup:
 * it calls `removeChannel` so navigation does not leave the topic open.
 */
export function openLiveTournamentChannel(
  client: LiveChannelClient,
  tournamentRef: string,
  tournamentId: string,
  handlers: LiveChannelHandlers
): () => void {
  const ref = tournamentRef.trim();
  const filter = liveTournamentChangeFilter(tournamentId);
  if (!isPublicTournamentRef(ref) || !filter) return () => {};
  let closed = false;
  const channel = client
    .channel(liveTournamentTopic(ref))
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_match_state",
        filter,
      },
      (payload) => {
        if (closed) return;
        handlers.onChange({
          eventType: payload.eventType,
          new: payload.new,
          old: payload.old,
        });
      }
    )
    .subscribe((status) => {
      if (closed) return;
      if (status === "SUBSCRIBED") {
        handlers.onSubscribed();
        return;
      }
      if (isRealtimeLoss(status)) handlers.onDisconnect(status);
    });
  return () => {
    closed = true;
    void client.removeChannel(channel);
  };
}
