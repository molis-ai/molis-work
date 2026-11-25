import assert from "node:assert/strict";
import test from "node:test";
import type { PagesRecord } from "@molis-ai/molis-work-plugin-pages/contract";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { openPagesStore, partitionLibraryFile } from "./fixtures/plugin-home-stores.js";
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
  for (const pages of [gone, kept]) {
    const store = openPagesStore(gone.home, pages.project.project_id);
    try {
      store.beginGeneration({ request_id: "receipt-" + pages.project.project_id, project_id: pages.project.project_id, request_hash: "hash",
        status: "running", document_id: null, title: "回执", instructions: "", error: null, updated_at: new Date().toISOString(), inputs: [] });
    } finally { store.close(); }
  }
  const held = (projectId: string) => {
    if (!existsSync(partitionLibraryFile(gone.home, projectId, "pages"))) return { documents: 0, folders: 0, receipts: 0 };
    const reader = openPagesStore(gone.home, projectId);
    try { return { documents: reader.list().length, folders: reader.listFolders().length, receipts: reader.generations().length }; }
    finally { reader.close(); }
  };
  const remove = (projectId: string, key: string) => gone.rawRequest(`/api/settings/projects/${projectId}/delete`, { method: "POST", body: { delete_confirmed: true, idempotency_key: key } });
  return { gone, kept, held, remove };
}

// W5-01-PAGES-07 (RUNTIME-MIGRATION 6.10): the "project deleted" step still reaches Pages' library from its Manifest's declaration
// (the partition's library, removed whole by the platform, U2),
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

// Batch 107: Pages' library is in the project's own folder, which the deletion moves aside before any owner step runs, so the step
// has no file of its own left to fail on; the same deletion asked again is the receipt replayed.
test("W5-01-PAGES-07 the Pages step goes with the project's folder, and asking for the same deletion again replays it complete", { timeout: 60_000 }, async t => {
  const f = await twoProjects(t), goneId = f.gone.project.project_id, library = partitionLibraryFile(f.gone.home, goneId, "pages");
  assert.equal(existsSync(library), true);
  const first = await (await f.remove(goneId, "pages-delete-retry")).json() as Deletion;
  assert.equal(first.deletion.cleanup_state, "complete");
  assert.equal(stepOf(first)?.state, "complete");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) assert.equal(existsSync(library + suffix), false, `the library${suffix} is gone`);
  assert.equal(existsSync(dirname(library)), false, "and the folder it was in");
  const retried = await (await f.remove(goneId, "pages-delete-retry")).json() as Deletion & { replayed?: boolean };
  assert.equal(retried.replayed, true);
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
