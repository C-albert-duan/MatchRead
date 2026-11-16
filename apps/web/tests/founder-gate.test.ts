/**
 * Fix list P2-10: an unset FOUNDER_EMAILS admits nobody outside local dev.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isFounderEmail } from "../lib/auth/founder.ts";

const saved = { ...process.env };
const env = process.env as Record<string, string | undefined>;
afterEach(() => {
  for (const key of ["FOUNDER_EMAILS", "NODE_ENV", "VERCEL_ENV"]) env[key] = saved[key];
});

describe("isFounderEmail", () => {
  it("is closed in production when the list is unset", () => {
    delete env.FOUNDER_EMAILS;
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "production";
    assert.equal(isFounderEmail("anyone@example.com"), false);
  });

  it("is closed in a preview build when the list is empty", () => {
    env.FOUNDER_EMAILS = " , ";
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "preview";
    assert.equal(isFounderEmail("anyone@example.com"), false);
  });

  it("stays open in local development when the list is unset", () => {
    delete env.FOUNDER_EMAILS;
    env.NODE_ENV = "development";
    delete env.VERCEL_ENV;
    assert.equal(isFounderEmail("dev@example.com"), true);
  });

  it("admits only listed emails when the list is set", () => {
    env.FOUNDER_EMAILS = "Founder@Example.com";
    env.NODE_ENV = "production";
    assert.equal(isFounderEmail("founder@example.com"), true);
    assert.equal(isFounderEmail("other@example.com"), false);
  });
});
