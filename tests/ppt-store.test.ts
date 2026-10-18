import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openPptStore, ownPptStores, PPT_DATABASE, PPT_HOME_STORE } from "@molis-ai/molis-work-plugin-ppt";

// W5-01-PPT-STORE-01: the unique declaration is the Home baseline, and the narrow SQL port reads and writes through one store.
test("W5-01-PPT-STORE-01: one PPT declaration and one SQL port under the original library", async t => {
  assert.equal(PPT_HOME_STORE.library?.baseline.version, PPT_DATABASE.version);
  assert.equal(PPT_HOME_STORE.library?.baseline.schema, PPT_DATABASE.schema);
  const home = await mkdtemp(join(tmpdir(), "ppt-store-"));
  const store = openPptStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const stores = ownPptStores(run => run(store));
  const caller: ActionExecutionContext = { actor_id: "test", project_id: "a", audience: "user", permissions: [], beforeEffect: async () => {} };
  const deck = await stores.write(caller, current => current.create({ project_id: "a", title: "Store port" }));
  assert.equal(stores.read(current => current.get(deck.id, "a")).title, "Store port");
  assert.deepEqual(stores.read(current => current.list("a")).map(item => item.id), [deck.id]);
});
