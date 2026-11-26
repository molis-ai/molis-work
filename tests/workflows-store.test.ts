import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ownWorkflowsStores, WORKFLOWS_DATABASE, workflowsManifest } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsStore } from "./fixtures/plugin-home-stores.js";

const caller: ActionExecutionContext = { actor_id: "test", project_id: "a", audience: "user", permissions: [], beforeEffect: async () => {} };

// W5-01-WORKFLOWS-STORE-01: the unique declaration is the library in each partition (U2), and the SQL port keeps the revision guard.
test("W5-01-WORKFLOWS-STORE-01: one Workflows declaration and one SQL port under the partition's library", async t => {
  assert.equal(workflowsManifest.databases?.partition, WORKFLOWS_DATABASE);
  assert.equal(workflowsManifest.databases?.home, undefined);
  const home = await mkdtemp(join(tmpdir(), "workflows-store-"));
  const store = openWorkflowsStore(home, "a");
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownWorkflowsStores(run => run(store));
  const created = await stores.write(caller, current => current.create({ title: "Flow", chain: { stations: [], links: [] } }));
  assert.equal(stores.read(current => current.get(created.workflow_id)).title, "Flow");
  assert.deepEqual(stores.read(current => current.list()).map(item => item.workflow_id), [created.workflow_id]);
  assert.throws(() => store.update(created.workflow_id, { title: "Stale", revision: 99 }), /别处改过/u);
  assert.equal(store.get(created.workflow_id).title, "Flow");
  assert.equal(store.update(created.workflow_id, { title: "Flow 2", revision: 1 }).revision, 2);
});

// W5-01-WORKFLOWS-STORE-02: the authority wait comes before the callback, so a refusal never enters the write.
test("W5-01-WORKFLOWS-STORE-02: a refused beforeEffect does not enter the write", async t => {
  const home = await mkdtemp(join(tmpdir(), "workflows-store-refused-"));
  const store = openWorkflowsStore(home, "a");
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownWorkflowsStores(run => run(store));
  let entered = false;
  const refused: ActionExecutionContext = { ...caller, beforeEffect: async () => { throw new Error("refused"); } };
  await assert.rejects(stores.write(refused, () => { entered = true; return 0; }), /refused/u);
  assert.equal(entered, false);
  assert.deepEqual(store.list(), []);
});
