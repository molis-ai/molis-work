import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

// The actual adapter must drain its original SDK even when cleanup requires recovery; the child ends only after those assertions.
for (const phase of ["prepare", "cancel", "cancel-unresolved"] as const) test(`APR-11: unknown original Surface ${phase} cannot close successfully without its owner's confirmed recovery of the same disk record`, { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-surface-unknown-close-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("./fixtures/surface-close-unknown.mjs", import.meta.url)), root, phase],
    { timeout: 20_000, maxBuffer: 512 * 1024 });
  assert.deepEqual(JSON.parse(stdout), { state: phase === "cancel-unresolved" ? "ready" : "stopped", lost: 1, inputs: 0, unsubscribed: 1,
    ownerRetained: phase !== "cancel", confirmedCancellations: phase === "cancel" ? 1 : 0 });
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const sdk: { createNodeHost(input: { storageRoot: string }): { storage: {
    list(input: { kind: string }): Promise<{ records: Array<{ id: string }> }>;
    readSecure(input: { kind: string; id: string }): Promise<Uint8Array>;
  } } } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const store = sdk.createNodeHost({ storageRoot: root }).storage;
  const kind = "io.molis.work.surface-unknown-close~effects", before = await store.list({ kind });
  const records: Array<{ id: string; state: string }> = [];
  for (const row of before.records) {
    const bytes = await store.readSecure({ kind, id: row.id });
    try {
      const effect: { state: string; proposal: { subject: { what: string } } } = JSON.parse(new TextDecoder().decode(bytes));
      if (effect.proposal.subject.what === "surface") records.push({ id: row.id, state: effect.state });
    } finally { bytes.fill(0); }
  }
  assert.equal(records.length, 1); assert.equal(records[0]!.state, phase === "prepare" ? "awaiting-approval" : "cancelled", "cleanup cannot erase the original record or infer the result of a lost reply");
  const reopened = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.surface-unknown-close", appVersion: "1.0.0" }, storageRoot: root,
    modelConfiguration: async () => { throw new Error("Recovery must not dispatch a model"); } });
  await reopened.close();
  const after = await store.list({ kind });
  assert.deepEqual(after.records.map(row => row.id), before.records.map(row => row.id), "restart must not create a substitute effect");
});
