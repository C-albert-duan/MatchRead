import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reason, ReasonKind } from "@matchread/core";
import { locales, t, tf } from "@matchread/i18n";
import { reasonMessage } from "./reason-text.ts";

const every: Reason[] = [
  ...(["break-point", "match-point"] as const).flatMap((flag) =>
    [true, false].map((against) => ({ prio: 0, kind: "flag" as const, params: { flag, against, playerRef: "p1" } }))
  ),
  ...(["out", "pressure", "on-court"] as const).map((state) => ({
    prio: 1,
    kind: "champion" as const,
    params: { state, playerRef: "p1" },
  })),
  ...(["eliminated", "pressure", "open"] as const).map((state) => ({
    prio: 2,
    kind: "forward" as const,
    params: { state, playerRef: "p1" },
  })),
  ...(["consensus", "alone", "contrarian", "future", "swing", "daily"] as ReasonKind[]).map((kind) => ({
    prio: 5,
    kind,
    params: { playerRef: "p1", sharePct: 72 },
  })),
];

test("every reason a core kind can produce has copy in every locale", () => {
  for (const reason of every) {
    const { key } = reasonMessage(reason, { p1: "Ames" });
    for (const locale of locales) {
      const text = t(locale, key);
      assert.equal(typeof text, "string", `${locale} ${key}`);
      assert.ok(text.length > 0, `${locale} ${key}`);
    }
  }
});

test("names and shares fill the sentence; an unknown player is a dash, not an id", () => {
  const consensus = reasonMessage(
    { prio: 3, kind: "consensus", params: { playerRef: "p1", sharePct: 72 } },
    { p1: "Ames" }
  );
  assert.equal(tf("en", consensus.key, consensus.vars), "Ames trails, and 72% of MatchRead picked them");
  const unknown = reasonMessage({ prio: 2, kind: "forward", params: { state: "open", playerRef: "uuid-1" } }, {});
  assert.equal(tf("en", unknown.key, unknown.vars), "You picked — here");
});
