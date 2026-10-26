/**
 * Keep a list from reshuffling under the reader. The server re-ranks on every
 * refresh; the page applies that order only to the top `top` rows. Rows below
 * keep their previous relative order and new rows join at the end.
 * `promoted` names rows that just moved into the top, so only those animate.
 */
export function stableOrder(
  previous: readonly string[],
  next: readonly string[],
  top = 3
): { order: string[]; promoted: string[] } {
  if (!previous.length) return { order: [...next], promoted: [] };
  const present = new Set(next);
  const head = next.slice(0, top);
  const headSet = new Set(head);
  const before = new Set(previous);
  const rest = [
    ...previous.filter((ref) => present.has(ref) && !headSet.has(ref)),
    ...next.filter((ref) => !before.has(ref) && !headSet.has(ref)),
  ];
  const previousTop = new Set(previous.slice(0, top));
  return {
    order: [...head, ...rest],
    promoted: head.filter((ref) => !previousTop.has(ref)),
  };
}
