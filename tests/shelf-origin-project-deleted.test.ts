import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ShelfArtifactSource } from "@molis-ai/molis-work-module-shelf/contract";
import { SHELF_ACTION_PERMISSIONS, shelfActions as a } from "@molis-ai/molis-work-plugin-shelf";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { openTestShelfStore } from "./shelf-direct-actions.js";

// BL-680 (用户 2026-10-26 弹窗决定): the copies on the Shelf that came from a project stay when the project is deleted. Deleting the project
// is untouched (Shelf is no owner step of it); the Shelf only says, copy by copy, whether the project it came from is still there.

const sourceOf = (projectId: string, artifact: string): ShelfArtifactSource => ({ project_id: projectId, project_path: `/projects/${projectId}`,
  reference: { artifact_id: artifact, version: 1 }, producer_plugin_id: "io.molis.work.coding", content_hash: `hash-${artifact}` });

test("BL-680 RAC-1066 a copy from a deleted project stays on the Shelf and is marked as having come from a deleted project; the deletion does not go through Shelf", { timeout: 90_000 }, async t => {
  const prior = process.env.MOLIS_WORK_LOCAL_TOOLS;
  process.env.MOLIS_WORK_LOCAL_TOOLS = "off";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_LOCAL_TOOLS; else process.env.MOLIS_WORK_LOCAL_TOOLS = prior; });
  const served = await serveHomeRuntime(t);
  await served.host.homePlugins!.ready();
  const kept = (await served.project("BL-680 kept")).project_id, gone = (await served.project("BL-680 gone")).project_id;
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS };
  const shelf = bindActionClient(served.host.homeActionClient(), () => user);
  const store = openTestShelfStore(served.home);
  const fromKept = await store.admit({ filename: "kept.md", bytes: Buffer.from("from the project that stays"), mime: "text/markdown", artifact_source: sourceOf(kept, "a-kept") });
  const fromGone = await store.admit({ filename: "gone.md", bytes: Buffer.from("from the project that goes"), mime: "text/markdown", artifact_source: sourceOf(gone, "a-gone") });
  const own = await store.admit({ filename: "own.md", bytes: Buffer.from("made here"), mime: "text/markdown" });
  const marks = async () => {
    const { materials, results } = await shelf.invoke(a.snapshot, {});
    const mine = new Set([fromKept.item_id, fromGone.item_id, own.item_id]);
    return Object.fromEntries([...materials, ...results].filter(item => mine.has(item.item_id)).map(item => [item.item_id, item.origin_project_deleted ?? null]));
  };

  assert.deepEqual(await marks(), { [fromKept.item_id]: false, [fromGone.item_id]: false, [own.item_id]: null }, "both projects are there; a copy with no project has no mark");

  const response = await served.request(`/api/settings/projects/${gone}/delete`, { method: "POST", body: { delete_confirmed: true, idempotency_key: "bl680-delete" } });
  assert.equal(response.status, 200, await response.clone().text());
  const deletion = await response.json() as { deletion: { cleanup_state: string; owner_steps: Array<{ owner_id: string }> } };
  assert.equal(deletion.deletion.cleanup_state, "complete");
  assert.ok(!deletion.deletion.owner_steps.some(step => /shelf/iu.test(step.owner_id)), "Shelf takes no step in deleting a project");

  assert.deepEqual(await marks(), { [fromKept.item_id]: false, [fromGone.item_id]: true, [own.item_id]: null }, "the copy stays; only it says its project is gone");
  assert.equal(openTestShelfStore(served.home).readFile(fromGone.item_id).bytes.toString("utf8"), "from the project that goes", "the copy's file is whole");
  const listed = await shelf.invoke(a.list, {});
  assert.equal(listed.materials.find(item => item.item_id === fromGone.item_id)?.origin_project_deleted, true, "the shared list says the same");
  assert.equal(fromGone.origin_project_deleted, undefined, "the mark is made when the snapshot is read and is not stored with the copy");
  assert.equal(openTestShelfStore(served.home).readFile(fromGone.item_id).item.origin_project_deleted, undefined);
});
