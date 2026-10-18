import assert from "node:assert/strict";
import test from "node:test";
import { todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// Security invariant S-03 (docs/system/SECURITY-INVARIANTS.md): a Home plugin's route reads at most the body its Manifest declares
// (`max_body_bytes`), and 12 MiB when it declares none (that half is W3-06-F-02 in tests/home-plugin-platform.test.ts). A body one byte
// over is refused before the action runs.

test("S-03 a Home route's own body limit refuses one byte more before the action runs; Todo declares the 1,000,000 it had", { timeout: 60_000 }, async t => {
  const { request } = await serveHomeRuntime(t);
  const items = `/api/plugins/${todoManifest.plugin_id}/items`;
  // `{"title":"…"}` is 12 bytes around the title.
  const sized = (bytes: number) => JSON.stringify({ title: "x".repeat(bytes - 12) });
  assert.equal(Buffer.byteLength(sized(1_000_001)), 1_000_001);
  const over = await request(items, { method: "POST", raw: sized(1_000_001) });
  assert.equal(over.status, 413);
  assert.equal((await over.json()).code, "actions.input_too_large");
  const at = await request(items, { method: "POST", raw: sized(1_000_000) });
  assert.notEqual(at.status, 413, "a body at the limit is read; the action then judges the input");
  assert.deepEqual((await (await request(`${items}?view=all`)).json() as { items: unknown[] }).items, [], "neither request added a todo");
});
