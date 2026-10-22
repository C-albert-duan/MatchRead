/**
 * Associate a server-rendered match node with one canonical live patch.
 * The key is the public match ref. A match uuid is not an address.
 */
import { isPublicMatchRef } from "../tournaments/href.ts";
import type { LiveRow } from "./patch.ts";
import { liveDisplayState } from "./view.ts";

export type ServerMatchNode = {
  publicRef: string | null;
};

/**
 * One live update for the node whose public ref matches.
 * `match_id` and `tournament_id` are not fields of this patch.
 */
export function liveNodePatch(row: unknown): LiveRow | null {
  const view = liveDisplayState(row);
  if (!view || !isPublicMatchRef(view.publicRef)) return null;
  const record = row as Record<string, unknown>;
  const sequence =
    typeof record.sequence === "number" && Number.isFinite(record.sequence) ? record.sequence : 0;
  const source = record.sequence_source ?? record.sequenceSource;
  return {
    public_ref: view.publicRef,
    phase: view.phase,
    score_text: view.sets,
    points_text: view.game,
    serving_side: view.serving,
    provisional_winner_ref: view.provisionalWinner,
    sequence,
    sequence_source: typeof source === "string" && source.trim() ? source.trim() : "seq",
    received_at: view.receivedAt,
    occurred_at: view.occurredAt,
  };
}

/**
 * Copy only the nodes this public ref addresses.
 * Every other node keeps its identity. A miss returns the same list.
 * A uuid or a bare id does not patch anything.
 */
export function patchAffectedNodes<T extends ServerMatchNode>(
  nodes: readonly T[],
  publicRef: string,
  apply: (node: T) => T
): readonly T[] {
  const ref = publicRef.trim();
  if (!isPublicMatchRef(ref)) return nodes;
  let changed = false;
  const next = nodes.map((node) => {
    if ((node.publicRef ?? "").trim() !== ref) return node;
    const patched = apply(node);
    if (patched !== node) changed = true;
    return patched;
  });
  return changed ? next : nodes;
}
