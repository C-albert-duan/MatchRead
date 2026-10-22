import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { test } from "node:test";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const ogBundle = join(repoRoot, "node_modules/next/dist/compiled/@vercel/og/index.node.js");

test("Next bundled @vercel/og node entry loads WASM/fonts on Windows paths", async () => {
  const mod = await import(pathToFileURL(ogBundle).href);
  assert.equal(typeof mod.ImageResponse, "function");

  const response = new mod.ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#053D26",
          color: "#FBFDFA",
          fontSize: 24,
        },
      },
      "MR"
    ),
    { width: 32, height: 32 }
  );
  assert.equal(response.headers.get("content-type"), "image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes[0], 0x89);
  assert.equal(bytes[1], 0x50);
  assert.equal(bytes[2], 0x4e);
  assert.equal(bytes[3], 0x47);
});

test("path.join must not resolve sibling assets from a file: import.meta.url", () => {
  const sample = pathToFileURL(join(repoRoot, "node_modules/next/package.json")).href;
  const broken = join(sample, "../noto-sans-v27-latin-regular.ttf");
  assert.equal(broken.includes("file:"), true);
  assert.throws(() => fileURLToPath(broken), /Invalid URL/);
});
