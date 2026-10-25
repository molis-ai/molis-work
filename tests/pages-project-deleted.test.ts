import assert from "node:assert/strict";
import test from "node:test";
import type { PagesRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import { Worker } from "node:worker_threads";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { pagesIn } from "./fixtures/pages-runtime.js";

type Deletion = { deletion: { cleanup_state: string; cleanup_error: string | null; replayed?: boolean; owner_steps: Array<{ owner_id: string; state: string }> }; replayed?: boolean };
const stepOf = (result: Deletion) => result.deletion.owner_steps.find(step => step.owner_id === "pages");

/** Two projects of one Home, each with a document, a folder and a generation receipt written through Pages' own library. */
async function twoProjects(t: Parameters<typeof serveHomeRuntime>[0]) {
  const home = await serveHomeRuntime(t);
  const gone = pagesIn(home, await home.project("Pages 要删的项目")), kept = pagesIn(home, await home.project("Pages 留下的项目"));
  for (const pages of [gone, kept]) {
    const folder = await pages.http<{ folder: { id: string } }>("/folders", { title: "文件夹" });
    await pages.http<{ document: PagesRecord }>("", { title: `文稿 ${pages.project.project_id}`, folder_id: folder.folder.id });
  }
  const store = openPagesStore(gone.home);
  try {
    for (const pages of [gone, kept]) store.beginGeneration({ request_id: "receipt-" + pages.project.project_id, project_id: pages.project.project_id, request_hash: "hash",
      status: "running", document_id: null, title: "回执", instructions: "", error: null, updated_at: new Date().toISOString(), inputs: [] });
  } finally { store.close(); }
  const held = (projectId: string) => {
    const reader = openPagesStore(gone.home);
    try { return { documents: reader.list(projectId).length, folders: reader.listFolders(projectId).length, receipts: reader.generations(projectId).length }; }
    finally { reader.close(); }
  };
  const remove = (projectId: string, key: string) => gone.rawRequest(`/api/settings/projects/${projectId}/delete`, { method: "POST", body: { delete_confirmed: true, idempotency_key: key } });
  return { gone, kept, held, remove };
}

// W5-01-PAGES-07 (RUNTIME-MIGRATION 6.10): the "project deleted" step still reaches Pages' library from its Manifest's declaration
// (`project_rows`, deleted by the platform, PG-024),
// whether or not the project's Pages instance is running, and a failed step is finished by the same deletion asked again.
test("W5-01-PAGES-07 deleting a project clears its Pages from the library, leaves the other project's, and the Runtime instance is no part of it", async t => {
  const f = await twoProjects(t);
  const [goneId, keptId] = [f.gone.project.project_id, f.kept.project.project_id];
  assert.deepEqual(f.held(goneId), { documents: 1, folders: 1, receipts: 1 });
  const response = await f.remove(goneId, "pages-delete-1");
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json() as Deletion;
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.equal(stepOf(result)?.state, "complete", "Pages is recorded in the receipt as done");
  assert.deepEqual(f.held(goneId), { documents: 0, folders: 0, receipts: 0 });
  assert.deepEqual(f.held(keptId), { documents: 1, folders: 1, receipts: 1 }, "the other project's Pages are untouched");
  const still = await f.kept.http<{ documents: PagesRecord[] }>("");
  assert.deepEqual(still.documents.map(document => document.title), [`文稿 ${keptId}`], "and its Runtime instance still serves them");
});

test("W5-01-PAGES-07 a Pages step that fails stays pending, and asking for the same deletion again finishes it", { timeout: 60_000 }, async t => {
  const f = await twoProjects(t), goneId = f.gone.project.project_id;
  // Another connection holds a write on the library past the deletion's wait (busy_timeout): the platform's delete fails like any write.
  const holder = new Worker(`
    const { DatabaseSync } = require("node:sqlite"); const { parentPort, workerData } = require("node:worker_threads");
    const db = new DatabaseSync(workerData.file); db.exec("BEGIN IMMEDIATE"); parentPort.postMessage("locked");
    parentPort.once("message", () => { db.exec("ROLLBACK"); db.close(); parentPort.close(); });
  `, { eval: true, workerData: { file: homeSqlitePath(f.gone.home, "pages") } });
  const exited = new Promise(resolve => holder.once("exit", resolve));
  t.after(async () => { holder.postMessage("release"); await exited; });
  await new Promise(resolve => holder.once("message", resolve));
  const first = await (await f.remove(goneId, "pages-delete-retry")).json() as Deletion;
  assert.equal(first.deletion.cleanup_state, "pending");
  assert.equal(stepOf(first)?.state, "pending");
  assert.match(first.deletion.cleanup_error ?? "", /pages/);
  assert.deepEqual(f.held(goneId), { documents: 1, folders: 1, receipts: 1 }, "nothing was half cleared");
  holder.postMessage("release");
  await exited;
  const retried = await (await f.remove(goneId, "pages-delete-retry")).json() as Deletion;
  assert.equal(retried.deletion.cleanup_state, "complete");
  assert.equal(stepOf(retried)?.state, "complete");
  assert.deepEqual(f.held(goneId), { documents: 0, folders: 0, receipts: 0 });
  assert.deepEqual(f.held(f.kept.project.project_id), { documents: 1, folders: 1, receipts: 1 });
});

test("W5-01-PAGES-07 a project whose Pages instance is not running (its runtime closed) is cleared the same way", async t => {
  const f = await twoProjects(t), goneId = f.gone.project.project_id;
  await f.gone.host.closeProject(f.gone.project.reference);
  const result = await (await f.remove(goneId, "pages-delete-closed")).json() as Deletion;
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.equal(stepOf(result)?.state, "complete");
  assert.deepEqual(f.held(goneId), { documents: 0, folders: 0, receipts: 0 });
});
