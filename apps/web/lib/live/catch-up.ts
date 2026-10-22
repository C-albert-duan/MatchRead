/**
 * Subscribe, confirm, refetch, then apply patches.
 * A patch that arrives after subscribe and before the snapshot is held.
 * It is applied after the snapshot, so the gap between fetch and subscribe cannot drop it.
 */

export type LiveSyncPhase = "subscribe" | "confirm" | "refetch" | "apply";

export type LiveSync<T> = {
  phase: LiveSyncPhase;
  held: T[];
};

export function openLiveSync<T>(): LiveSync<T> {
  return { phase: "subscribe", held: [] };
}

/** The channel has been opened. Refetch waits for confirmation. */
export function subscriptionOpened<T>(sync: LiveSync<T>): LiveSync<T> {
  if (sync.phase !== "subscribe") return sync;
  return { phase: "confirm", held: sync.held };
}

/** The channel reported ready. The current projection may be read. */
export function subscriptionConfirmed<T>(sync: LiveSync<T>): LiveSync<T> {
  if (sync.phase !== "confirm") return sync;
  return { phase: "refetch", held: sync.held };
}

/** Keep a patch until the snapshot has been applied. A live phase does not hold it. */
export function holdLivePatch<T>(sync: LiveSync<T>, patch: T): LiveSync<T> {
  if (sync.phase === "apply") return sync;
  return { phase: sync.phase, held: [...sync.held, patch] };
}

/**
 * A hidden tab comes back through the current projection.
 * Held patches are dropped. Nothing missed while hidden is returned to replay.
 */
export function recoverVisibleTab<T>(sync: LiveSync<T>): { sync: LiveSync<T>; refetch: true; replay: [] } {
  const phase = sync.phase === "subscribe" || sync.phase === "confirm" ? sync.phase : "refetch";
  return { sync: { phase, held: [] }, refetch: true, replay: [] };
}

/** `visibilitychange` to visible refetches. Hidden does not start a replay. */
export function acceptVisibilityChange<T>(
  sync: LiveSync<T>,
  visibility: "visible" | "hidden"
): { sync: LiveSync<T>; refetch: boolean; replay: readonly T[] } {
  if (visibility !== "visible") return { sync, refetch: false, replay: [] };
  const recovered = recoverVisibleTab(sync);
  return { sync: recovered.sync, refetch: true, replay: recovered.replay };
}

/**
 * A frame while the tab is hidden, or while the foreground refetch is in flight,
 * is not queued. A visible live tab applies it. A tab still opening holds it
 * until the first snapshot.
 */
export function deliverLiveChange<T>(
  sync: LiveSync<T>,
  change: T,
  gate: { hidden: boolean; recovering: boolean }
): { sync: LiveSync<T>; apply: T | null } {
  if (gate.hidden || gate.recovering) return { sync, apply: null };
  if (sync.phase !== "apply") return { sync: holdLivePatch(sync, change), apply: null };
  return { sync, apply: change };
}

/** The browser came back. Read the current projection and keep no backlog. */
export function enterForeground<T>(sync: LiveSync<T>): {
  sync: LiveSync<T>;
  refetch: true;
  replay: readonly T[];
} {
  const recovered = recoverVisibleTab(sync);
  return { sync: recovered.sync, refetch: true, replay: [] };
}

/**
 * The foreground snapshot is on screen. Anything still queued is dropped.
 */
export function finishForegroundRefetch<T>(sync: LiveSync<T>): {
  sync: LiveSync<T>;
  replay: readonly T[];
} {
  const flushed = projectionRefetched(sync);
  return { sync: { phase: flushed.sync.phase, held: [] }, replay: [] };
}

/**
 * Release patches that arrived after subscribe.
 * Before confirmation this does not advance and does not release them.
 */
export function projectionRefetched<T>(sync: LiveSync<T>): { sync: LiveSync<T>; patches: T[] } {
  if (sync.phase !== "refetch") return { sync, patches: [] };
  return { sync: { phase: "apply", held: [] }, patches: sync.held };
}
