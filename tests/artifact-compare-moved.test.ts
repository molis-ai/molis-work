import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGES_ARTIFACT_TYPE_ID } from "@molis-ai/molis-work-plugin-pages/contract";
import { FORM_ARTIFACT_TYPE_ID } from "@molis-ai/molis-work-plugin-form/contract";
import { DATASET_ARTIFACT_TYPE_ID } from "@molis-ai/molis-work-plugin-dataset/contract";
import { PPT_ARTIFACT_TYPE_ID, PPT_SUBJECT_KIND } from "@molis-ai/molis-work-plugin-ppt/contract";
import { pagesActions, createPagesActionHandlers, ownPagesStores, PAGES_SUBJECT_KIND } from "@molis-ai/molis-work-plugin-pages";
import { formActions, createFormActionHandlers, ownFormStores } from "@molis-ai/molis-work-plugin-form";
import { openFormStore, openPagesStore } from "./fixtures/plugin-home-stores.js";
import { datasetActions, createDatasetActionHandlers, ownDatasetStores } from "@molis-ai/molis-work-plugin-dataset";
import { openDatasetStore } from "./fixtures/plugin-home-stores.js";
import { pptActions, createPptActionHandlers, ownPptStores } from "@molis-ai/molis-work-plugin-ppt";
import { openPptStore } from "./fixtures/plugin-home-stores.js";

// 「原文已改」 (specs/artifact-positioning A4b): the owner compares a pinned version with the object it came from. An object
// moved to another place still exists; only one that is gone is "missing", and the 成果库 must not call a move a deletion.
const unavailable = () => ({ available: false as const, code: "actions.connection_required", reason: "no model" });
const owners = [
  { name: "Pages", type: PAGES_ARTIFACT_TYPE_ID, kind: PAGES_SUBJECT_KIND, definition: pagesActions.artifactCompare,
    open: openPagesStore, handlers: (withStore: any) => createPagesActionHandlers({ ...ownPagesStores(withStore), modelAvailability: unavailable, prepareImport: async () => { throw new Error("n/a"); } }) },
  { name: "Form", type: FORM_ARTIFACT_TYPE_ID, kind: "form", definition: formActions.artifactCompare,
    open: openFormStore, handlers: (withStore: any) => createFormActionHandlers({ ...ownFormStores(withStore), modelAvailability: unavailable }) },
  { name: "Dataset", type: DATASET_ARTIFACT_TYPE_ID, kind: "dataset", definition: datasetActions.artifactCompare,
    open: openDatasetStore, handlers: (withStore: any) => createDatasetActionHandlers({ ...ownDatasetStores(withStore), modelAvailability: unavailable }) },
  { name: "PPT", type: PPT_ARTIFACT_TYPE_ID, kind: PPT_SUBJECT_KIND, definition: pptActions.artifactCompare,
    open: openPptStore, handlers: (withStore: any) => createPptActionHandlers({ ...ownPptStores(withStore) }) },
];

for (const owner of owners) {
  test(`${owner.name}: a pinned version of an object carried to another partition compares the same there, and where it left the owner says it is gone`, async t => {
    const home = await mkdtemp(join(tmpdir(), "artifact-compare-moved-"));
    t.after(() => rm(home, { recursive: true, force: true }));
    // Each partition has its own library (U2): the owner in a partition reads only that partition's file.
    const withStore = (partition: string) => <T>(run: (store: any) => T): T => {
      const store = (owner.open as (home: string, partition: string) => any)(home, partition);
      try { return run(store); } finally { store.close(); } };
    const compare = (partition: string) => owner.handlers(withStore(partition)).find((handler: any) => handler.capability_id === owner.definition.capability_id)!;
    const object = withStore("project-a")(store => store.create({ title: "Plan" }));
    const version = (id: string) => ({ artifact_type_id: owner.type, origin: { kind: "pinned", subject: { kind: owner.kind, id }, revision: String(object.version) },
      payload: JSON.parse(JSON.stringify(object)) });
    const caller = (project: string) => ({ actor_id: "web-user", audience: "user", project_id: project, permissions: [] }) as any;
    const state = (project: string, id = object.id) => (compare(project).handle(caller(project), { artifact: version(id) }) as { state: string }).state;

    assert.equal(state("project-a"), "same");
    // The platform's move: the export put into the other partition's library under the same id, then let go where it was.
    const carried = withStore("project-a")(store => store.exportRecord(object.id));
    withStore("project-b")(store => store.putRecord(carried.record, "move:" + object.id, object.id));
    assert.equal(withStore("project-a")(store => store.removeCarried(object.id, carried.revision)), true);
    assert.equal(state("project-b"), "same", "it compares as before where it is now");
    // Where it left, its owner cannot tell a move from a deletion: the 成果库 asks placement, which carried it (artifact-library-http.ts).
    assert.equal(state("project-a"), "missing");
    assert.equal(state("project-b", "never-existed"), "missing", "an object that exists nowhere is gone");
  });
}
