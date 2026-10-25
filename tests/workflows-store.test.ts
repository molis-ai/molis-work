import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ownWorkflowsStores, WORKFLOWS_DATABASE, WORKFLOWS_HOME_STORE } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsStore } from "./fixtures/plugin-home-stores.js";

const caller: ActionExecutionContext = { actor_id: "test", project_id: "a", audience: "user", permissions: [], beforeEffect: async () => {} };

// W5-01-WORKFLOWS-STORE-01: the unique declaration is the Home baseline, and the SQL port keeps the revision guard.
test("W5-01-WORKFLOWS-STORE-01: one Workflows declaration and one SQL port under the original library", async t => {
  assert.equal(WORKFLOWS_HOME_STORE.library?.baseline.version, WORKFLOWS_DATABASE.version);
  assert.equal(WORKFLOWS_HOME_STORE.library?.baseline.schema, WORKFLOWS_DATABASE.schema);
  const home = await mkdtemp(join(tmpdir(), "workflows-store-"));
  const store = openWorkflowsStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownWorkflowsStores(run => run(store));
  const created = await stores.write(caller, current => current.create({ project_id: "a", title: "Flow", chain: { stations: [], links: [] } }));
  assert.equal(stores.read(current => current.get(created.workflow_id, "a")).title, "Flow");
  assert.deepEqual(stores.read(current => current.list("a")).map(item => item.workflow_id), [created.workflow_id]);
  assert.throws(() => store.update(created.workflow_id, "a", { title: "Stale", revision: 99 }), /别处改过/u);
  assert.equal(store.get(created.workflow_id, "a").title, "Flow");
  assert.equal(store.update(created.workflow_id, "a", { title: "Flow 2", revision: 1 }).revision, 2);
});

// W5-01-WORKFLOWS-STORE-02: the authority wait comes before the callback, so a refusal never enters the write.
test("W5-01-WORKFLOWS-STORE-02: a refused beforeEffect does not enter the write", async t => {
  const home = await mkdtemp(join(tmpdir(), "workflows-store-refused-"));
  const store = openWorkflowsStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownWorkflowsStores(run => run(store));
  let entered = false;
  const refused: ActionExecutionContext = { ...caller, beforeEffect: async () => { throw new Error("refused"); } };
  await assert.rejects(stores.write(refused, () => { entered = true; return 0; }), /refused/u);
  assert.equal(entered, false);
  assert.deepEqual(store.list("a"), []);
});
