"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { stableOrder } from "@/lib/me/stable-order";

type Item = { ref: string; node: ReactNode };

/**
 * Server-ranked rows that do not reshuffle under the reader. The soft
 * refresh re-ranks on the server; only the top three follow it, and a row
 * that moves into the top three is marked for a short highlight (none under
 * reduced motion). Live scores patch in place through the live layer.
 */
export function MyMatchList({ items, label }: { items: Item[]; label: string }) {
  const previous = useRef<string[]>([]);
  const refs = items.map((item) => item.ref);
  const signature = refs.join("|");
  const { order, promoted } = useMemo(
    () => stableOrder(previous.current, refs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature]
  );
  useEffect(() => {
    previous.current = order;
  }, [order]);

  const byRef = new Map(items.map((item) => [item.ref, item.node]));
  const lifted = new Set(promoted);
  return (
    <ol className="my-list" aria-label={label}>
      {order.map((ref) => (
        <li key={ref} className="my-list-item" data-promoted={lifted.has(ref) ? "true" : undefined}>
          {byRef.get(ref)}
        </li>
      ))}
    </ol>
  );
}
