"use client";

import { Fragment, memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { LiveScore } from "@/components/live/LiveScore";
import { hasSupabaseEnv } from "@/lib/env";
import { reportError } from "@/lib/report-error";
import {
  deliverLiveChange,
  enterForeground,
  finishForegroundRefetch,
  openLiveSync,
  projectionRefetched,
  snapshotAfterPostgresReady,
  subscriptionConfirmed,
  type FirstSnapshot,
  subscriptionOpened,
  type LiveSync,
} from "@/lib/live/catch-up";
import { armRealtimeRecovery } from "@/lib/live/disconnect";
import { browserLiveDelay } from "@/lib/live/freshness";
import { liveNodePatch } from "@/lib/live/node-patch";
import { liveSnapshotOpen } from "@/lib/live/provider-down";
import {
  acceptLiveEvent,
  isLiveStale,
  resumeLiveTransport,
  type LiveRow,
} from "@/lib/live/patch";
import { knownServingSide, liveScoreFields, type LiveScoreFields } from "@/lib/live/score";
import { isPublicMatchRef } from "@/lib/tournaments/href";
import {
  liveTournamentWatches,
  useLiveTournament,
  type LiveTournamentChange,
  type LiveTournamentWatch,
} from "@/components/live/useLiveTournament";

type Labels = {
  live: string;
  stale: string;
  delayed: string;
  lastUpdated: string;
  provisional: string;
  serving: string;
};

const reportedAt = new Map<string, number>();

function reportLive(source: string, message: string) {
  const now = Date.now();
  if (now - (reportedAt.get(source) ?? 0) < 60_000) return;
  reportedAt.set(source, now);
  reportError(new Error(message), { source });
}

function cells(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-public-ref][data-base-resolution]")];
}

function pageTournaments(): LiveTournamentWatch[] {
  return liveTournamentWatches(
    cells().map((cell) => ({
      tournamentRef: cell.getAttribute("data-tournament-ref"),
      tournamentId: cell.getAttribute("data-tournament-id"),
    }))
  );
}

/** Server nodes for one public match ref. Other cells are not in this list. */
function cellsFor(ref: string): HTMLElement[] {
  const token = ref.trim();
  if (!isPublicMatchRef(token)) return [];
  return [
    ...document.querySelectorAll<HTMLElement>(
      `[data-public-ref="${CSS.escape(token)}"][data-base-resolution]`
    ),
  ];
}

function readCell(cell: HTMLElement) {
  const sequence = cell.getAttribute("data-live-sequence");
  return {
    official: cell.getAttribute("data-base-resolution") === "official",
    sequence: sequence == null ? null : Number(sequence),
    sequenceSource: cell.getAttribute("data-live-source"),
    occurredAt: cell.getAttribute("data-occurred-at"),
  };
}

function clearPaint(cell: HTMLElement) {
  const base = cell.getAttribute("data-base-resolution") || "scheduled";
  cell.setAttribute("data-resolution", base);
  cell.removeAttribute("data-live-sequence");
  cell.removeAttribute("data-live-source");
  cell.removeAttribute("data-observed-at");
  cell.removeAttribute("data-occurred-at");
  cell.removeAttribute("data-live-serve");
  cell.removeAttribute("data-live-stale");
  const root = cell.querySelector<HTMLElement>("[data-live-root]");
  if (root) root.hidden = true;
  for (const seat of cell.querySelectorAll("[data-live-leader]")) {
    seat.removeAttribute("data-live-leader");
  }
}

function pageExpectsPlay(): boolean {
  return cells().some((cell) => cell.getAttribute("data-resolution") === "live");
}

function paintCell(cell: HTMLElement, row: LiveRow, labels: Labels, now: number): LiveScoreFields | null | undefined {
  const decision = acceptLiveEvent({
    generation: 1,
    currentGeneration: 1,
    fromSnapshot: cell.getAttribute("data-live-snapshot") === "1",
    cell: readCell(cell),
    row,
    now,
  });
  cell.removeAttribute("data-live-snapshot");
  if (decision.action !== "paint" || !decision.presentation) return undefined;
  const presented = decision.presentation;
  cell.setAttribute("data-resolution", presented.state);
  cell.setAttribute("data-live-sequence", String(decision.sequence));
  cell.setAttribute("data-live-source", decision.sequenceSource || "");
  if (decision.observedAt) cell.setAttribute("data-observed-at", decision.observedAt);
  if (decision.occurredAt) cell.setAttribute("data-occurred-at", decision.occurredAt);
  else cell.removeAttribute("data-occurred-at");
  const serving = knownServingSide(presented.servingSide);
  if (serving === "a") cell.setAttribute("data-live-serve", "0");
  else if (serving === "b") cell.setAttribute("data-live-serve", "1");
  else cell.removeAttribute("data-live-serve");
  if (presented.stale) cell.setAttribute("data-live-stale", "true");
  else cell.removeAttribute("data-live-stale");
  const fields = liveScoreFields(presented, labels);
  const root = cell.querySelector<HTMLElement>("[data-live-root]");
  if (root) root.hidden = !fields;
  for (const seat of cell.querySelectorAll("[data-live-leader]")) {
    seat.removeAttribute("data-live-leader");
  }
  return fields;
}

const LiveNodeScore = memo(function LiveNodeScore({
  fields,
  root,
}: {
  fields: LiveScoreFields;
  root: HTMLElement;
}) {
  return createPortal(<LiveScore {...fields} />, root);
});

function LiveTournamentChannel({
  watch,
  generation,
  onChange,
  onSubscribed,
  onDisconnect,
  onPostgresReady,
}: {
  watch: LiveTournamentWatch;
  generation: number;
  onChange: (generation: number, change: LiveTournamentChange) => void;
  onSubscribed: (generation: number, ref: string) => void;
  onDisconnect: (status: string) => void;
  onPostgresReady: (generation: number) => void;
}) {
  useLiveTournament(watch.ref, watch.tournamentId, {
    onChange: (change) => onChange(generation, change),
    onSubscribed: () => onSubscribed(generation, watch.ref),
    onDisconnect,
    onPostgresReady: () => onPostgresReady(generation),
  });
  return null;
}

export function LiveMatchLayer({ labels }: { labels: Labels }) {
  const router = useRouter();
  const refreshSheet = useRef(router.refresh);
  refreshSheet.current = router.refresh;
  const { live, stale, delayed, lastUpdated, provisional, serving } = labels;
  const [watch, setWatch] = useState<LiveTournamentWatch[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [delayMinutes, setDelayMinutes] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, LiveScoreFields>>({});
  const onChangeRef = useRef<(generation: number, change: LiveTournamentChange) => void>(() => {});
  const onSubscribedRef = useRef<(generation: number, ref: string) => void>(() => {});
  const onDisconnectRef = useRef<(status: string) => void>(() => {});
  const onPostgresReadyRef = useRef<(generation: number) => void>(() => {});

  useEffect(() => {
    const labels: Labels = { live, stale, delayed, lastUpdated, provisional, serving };
    if (!hasSupabaseEnv()) return;
    let generation = 0;
    let timer: number | null = null;
    let alive = true;
    let sync: LiveSync<LiveTournamentChange> = openLiveSync();
    let expected = 0;
    const confirmed = new Set<string>();
    let refetchStarted = false;
    let firstSnapshot: FirstSnapshot = "pending";
    let snapshotAgain = false;
    let recovering = false;
    let failures = 0;
    let lastFreshAt: number | null = null;
    let layerOpen = false;
    let sheetTimer: number | null = null;

    function revealOfficialSheet() {
      if (sheetTimer != null) return;
      sheetTimer = window.setTimeout(() => {
        sheetTimer = null;
        refreshSheet.current();
      }, 0);
    }

    function publishDelay(now = Date.now()) {
      const delay = browserLiveDelay({
        lastFreshAt,
        now,
        expectingPlay: pageExpectsPlay(),
      });
      const minutes = delay.delayed ? delay.minutes : null;
      setDelayMinutes((current) => (current === minutes ? current : minutes));
    }

    function noteFresh(at = Date.now()) {
      lastFreshAt = at;
      publishDelay(at);
    }

    function putScore(ref: string, fields: LiveScoreFields) {
      setScores((prev) => {
        const current = prev[ref];
        if (
          current &&
          current.badge === fields.badge &&
          current.score === fields.score &&
          current.serving === fields.serving &&
          current.note === fields.note
        ) {
          return prev;
        }
        return { ...prev, [ref]: fields };
      });
    }

    function dropScore(ref: string) {
      setScores((prev) => {
        if (!prev[ref]) return prev;
        const next = { ...prev };
        delete next[ref];
        return next;
      });
    }

    function applyRow(row: LiveRow, gen: number, fromSnapshot: boolean) {
      if (gen !== generation) return;
      const targets = cellsFor(row.public_ref);
      if (!targets.length) return;
      let painted: LiveScoreFields | null | undefined;
      for (const cell of targets) {
        if (fromSnapshot) cell.setAttribute("data-live-snapshot", "1");
        const fields = paintCell(cell, row, labels, Date.now());
        if (fields !== undefined) painted = fields;
      }
      if (painted === undefined) return;
      if (!painted) {
        dropScore(row.public_ref);
        return;
      }
      putScore(row.public_ref, painted);
      noteFresh();
    }

    async function refetch(gen: number) {
      const tournamentRefs = [
        ...new Set(
          cells()
            .map((cell) => cell.getAttribute("data-tournament-ref"))
            .filter((ref): ref is string => Boolean(ref))
        ),
      ];
      if (!tournamentRefs.length) return;
      const seen = new Set<string>();
      for (const tournamentRef of tournamentRefs) {
        const response = await fetch("/api/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentRef }),
        });
        if (gen !== generation) return;
        if (!response.ok) {
          reportLive("live.refetch", `live read failed: ${response.status}`);
          refreshStale();
          continue;
        }
        const body = (await response.json()) as { matches?: unknown; live?: unknown };
        if (!liveSnapshotOpen(body)) {
          layerOpen = false;
          let dropped = false;
          for (const cell of cells()) {
            if (cell.getAttribute("data-base-resolution") === "official") continue;
            if (!cell.hasAttribute("data-live-sequence")) continue;
            const ref = cell.getAttribute("data-public-ref");
            clearPaint(cell);
            if (ref) dropScore(ref);
            dropped = true;
          }
          if (dropped) revealOfficialSheet();
          publishDelay();
          return;
        }
        layerOpen = true;
        noteFresh();
        for (const item of Array.isArray(body.matches) ? body.matches : []) {
          const row = liveNodePatch(item);
          if (!row) continue;
          seen.add(row.public_ref);
          applyRow(row, gen, true);
        }
      }
      let dropped = false;
      for (const cell of cells()) {
        const ref = cell.getAttribute("data-public-ref");
        if (!ref || seen.has(ref) || cell.getAttribute("data-base-resolution") === "official") {
          continue;
        }
        if (cell.hasAttribute("data-live-sequence")) {
          clearPaint(cell);
          dropScore(ref);
          dropped = true;
        }
      }
      if (dropped) revealOfficialSheet();
      publishDelay();
    }

    function applyChange(gen: number, change: LiveTournamentChange) {
      if (gen !== generation) return;
      if (change.eventType === "DELETE") {
        const previous = liveNodePatch(change.old);
        if (!previous) {
          void refetch(gen);
          return;
        }
        const targets = cellsFor(previous.public_ref);
        let cleared = false;
        for (const cell of targets) {
          if (cell.getAttribute("data-base-resolution") === "official") continue;
          clearPaint(cell);
          cleared = true;
        }
        if (cleared && previous) {
          dropScore(previous.public_ref);
          publishDelay();
          revealOfficialSheet();
        }
        return;
      }
      const row = liveNodePatch(change.new);
      if (row) applyRow(row, gen, false);
    }

    onChangeRef.current = (gen, change) => {
      if (gen !== generation || !layerOpen) return;
      const delivery = deliverLiveChange(sync, change, {
        hidden: document.visibilityState === "hidden",
        recovering,
      });
      sync = delivery.sync;
      if (delivery.apply) applyChange(gen, delivery.apply);
    };

    onSubscribedRef.current = (gen, ref) => {
      if (gen !== generation || refetchStarted) return;
      if (sync.phase === "subscribe") sync = subscriptionOpened(sync);
      confirmed.add(ref);
      if (confirmed.size < expected || sync.phase !== "confirm") return;
      sync = subscriptionConfirmed(sync);
      if (sync.phase !== "refetch") return;
      refetchStarted = true;
      firstSnapshot = "in-flight";
      failures = 0;
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
      void refetch(gen).finally(() => {
        if (!alive || gen !== generation) return;
        firstSnapshot = "done";
        const flushed = projectionRefetched(sync);
        sync = flushed.sync;
        if (snapshotAgain) {
          snapshotAgain = false;
          void refetch(gen);
        }
        if (!layerOpen) return;
        for (const change of flushed.patches) applyChange(gen, change);
      });
    };

    onPostgresReadyRef.current = (gen) => {
      if (gen !== generation) return;
      const next = snapshotAfterPostgresReady(firstSnapshot);
      if (next === "after-first") snapshotAgain = true;
      else if (next === "now") void refetch(gen);
    };

    onDisconnectRef.current = (status) => {
      reportLive("live.channel", status);
      refreshStale();
      const armed = armRealtimeRecovery({ failures, waiting: timer != null });
      if (!armed.arm) return;
      failures = armed.failures;
      const step = armed.step;
      timer = window.setTimeout(() => {
        timer = null;
        if (!alive) return;
        begin();
        if (step.mode === "poll") void refetch(generation);
      }, step.waitMs);
    };

    function begin() {
      const plan = resumeLiveTransport();
      if (plan.dropQueuedEvents) generation += 1;
      const gen = generation;
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
      sync = openLiveSync();
      confirmed.clear();
      refetchStarted = false;
      firstSnapshot = "pending";
      snapshotAgain = false;
      // A new generation reads its own snapshot after subscribing. A foreground
      // refetch from the old generation returns early and must not leave the
      // layer stuck "recovering" (every later frame was dropped: V3-M4-DOD F-1).
      recovering = false;
      const next = pageTournaments();
      expected = next.length;
      if (!alive) return;
      setWatch(next);
      setEpoch(gen);
    }

    function markTabHidden(hidden: boolean) {
      if (hidden) document.documentElement.setAttribute("data-tab-hidden", "true");
      else document.documentElement.removeAttribute("data-tab-hidden");
    }

    function onVisible() {
      markTabHidden(document.visibilityState === "hidden");
      refreshStale();
      if (document.visibilityState !== "visible") return;
      const transport = resumeLiveTransport();
      if (!transport.refetch || transport.replay || !transport.dropQueuedEvents) return;
      const resumed = enterForeground(sync);
      sync = resumed.sync;
      recovering = true;
      const gen = generation;
      void refetch(gen).finally(() => {
        if (!alive || gen !== generation) return;
        recovering = false;
        const finished = finishForegroundRefetch(sync);
        sync = finished.sync;
        if (!layerOpen) return;
        for (const change of finished.patches) applyChange(gen, change);
      });
    }

    function refreshStale() {
      const now = Date.now();
      const badges = new Map<string, string>();
      for (const cell of cells()) {
        const resolution = cell.getAttribute("data-resolution");
        if (resolution !== "live" && resolution !== "provisional") continue;
        const ref = cell.getAttribute("data-public-ref");
        if (!ref) continue;
        const stale = isLiveStale(cell.getAttribute("data-observed-at"), now);
        if (stale) cell.setAttribute("data-live-stale", "true");
        else cell.removeAttribute("data-live-stale");
        if (resolution === "provisional") continue;
        badges.set(ref, stale ? labels.stale : labels.live);
      }
      setScores((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [ref, badge] of badges) {
          const current = next[ref];
          if (!current || current.badge === badge) continue;
          next[ref] = { ...current, badge };
          changed = true;
        }
        return changed ? next : prev;
      });
    }

    function onOffline() {
      onDisconnectRef.current("offline");
    }

    markTabHidden(document.visibilityState === "hidden");
    begin();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("offline", onOffline);
    const staleTimer = window.setInterval(() => {
      refreshStale();
      publishDelay();
    }, 5_000);
    return () => {
      alive = false;
      generation += 1;
      if (timer != null) window.clearTimeout(timer);
      if (sheetTimer != null) window.clearTimeout(sheetTimer);
      document.documentElement.removeAttribute("data-tab-hidden");
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(staleTimer);
    };
  }, [live, stale, delayed, lastUpdated, provisional, serving]);

  return (
    <>
      {delayMinutes != null ? (
        <div
          className="status-banner status-banner--beta status-banner--delay"
          role="status"
          data-live-delay="true"
        >
          {delayed}
          <br />
          {lastUpdated.replaceAll("{n}", String(delayMinutes))}
        </div>
      ) : null}
      {Object.entries(scores).map(([ref, fields]) => {
        if (typeof document === "undefined") return null;
        return (
          <Fragment key={ref}>
            {cellsFor(ref).map((cell, index) => {
              const root = cell.querySelector<HTMLElement>("[data-live-root]");
              if (!root) return null;
              return <LiveNodeScore key={`${ref}:${index}`} fields={fields} root={root} />;
            })}
          </Fragment>
        );
      })}
      {watch.map((tournament) => (
        <LiveTournamentChannel
          key={`${tournament.ref}:${epoch}`}
          watch={tournament}
          generation={epoch}
          onChange={(generation, change) => onChangeRef.current(generation, change)}
          onSubscribed={(generation, ref) => onSubscribedRef.current(generation, ref)}
          onDisconnect={(status) => onDisconnectRef.current(status)}
          onPostgresReady={(generation) => onPostgresReadyRef.current(generation)}
        />
      ))}
    </>
  );
}
