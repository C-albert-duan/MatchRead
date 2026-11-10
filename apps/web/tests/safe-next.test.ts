/**
 * Fix list P0-6: ?next= must never leave the site.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeNext } from "../lib/safe-next.ts";

const ORIGIN = "https://matchreadtennis.com";

/** Where a redirect built the way the auth callback builds it would land. */
function landsOn(next: string): string {
  return new URL(safeNext(next), ORIGIN).host;
}

describe("safeNext", () => {
  it("keeps in-app paths with query and hash", () => {
    assert.equal(safeNext("/leagues/abc?tab=picks#r2"), "/leagues/abc?tab=picks#r2");
    assert.equal(safeNext("/me"), "/me");
  });

  it("falls back when next is missing", () => {
    assert.equal(safeNext(null), "/leagues");
    assert.equal(safeNext(undefined, "/me"), "/me");
    assert.equal(safeNext(""), "/leagues");
  });

  it("refuses absolute and protocol-relative URLs", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "/x?u=https://e.com"]) {
      assert.equal(safeNext(bad), "/", bad);
    }
  });

  it("refuses tab, CR and LF that the URL parser would strip", () => {
    for (const bad of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\u0000/evil.com"]) {
      assert.equal(safeNext(bad), "/", JSON.stringify(bad));
    }
  });

  it("never redirects to another host", () => {
    const attempts = [
      "/\t/evil.com",
      "/%09/evil.com",
      "/\n\n/evil.com",
      "/./\t/evil.com",
      "//evil.com",
      "/\\/evil.com",
      "/..//evil.com",
    ];
    for (const next of attempts) {
      assert.equal(landsOn(next), "matchreadtennis.com", JSON.stringify(next));
    }
  });
});
