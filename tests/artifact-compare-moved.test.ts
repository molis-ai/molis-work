import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGES_ARTIFACT_TYPE_ID } from "@molis-ai/molis-work-contracts/modules/pages";
import { FORM_ARTIFACT_TYPE_ID } from "@molis-ai/molis-work-contracts/modules/form";
import { DATASET_ARTIFACT_TYPE_ID } from "@molis-ai/molis-work-contracts/modules/dataset";
import { PPT_ARTIFACT_TYPE_ID, PPT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/ppt";
import { pagesActions, createPagesActionHandlers, openPagesStore, PAGES_SUBJECT_KIND } from "@molis-ai/molis-work-plugin-pages";
import { formActions, createFormActionHandlers, openFormStore } from "@molis-ai/molis-work-plugin-form";
import { datasetActions, createDatasetActionHandlers, openDatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { pptActions, createPptActionHandlers, openPptStore } from "@molis-ai/molis-work-plugin-ppt";

// 「原文已改」 (specs/artifact-positioning A4b): the owner compares a pinned version with the object it came from. An object
// moved to another place still exists; only one that is gone is "missing", and the 成果库 must not call a move a deletion.
const unavailable = () => ({ available: false as const, code: "actions.connection_required", reason: "no model" });
const owners = [
  { name: "Pages", type: PAGES_ARTIFACT_TYPE_ID, kind: PAGES_SUBJECT_KIND, definition: pagesActions.artifactCompare,
    open: openPagesStore, handlers: (withStore: any) => createPagesActionHandlers({ withStore, modelAvailability: unavailable, prepareImport: async () => { throw new Error("n/a"); } }) },
  { name: "Form", type: FORM_ARTIFACT_TYPE_ID, kind: "form", definition: formActions.artifactCompare,
    open: openFormStore, handlers: (withStore: any) => createFormActionHandlers({ withStore, modelAvailability: unavailable }) },
  { name: "Dataset", type: DATASET_ARTIFACT_TYPE_ID, kind: "dataset", definition: datasetActions.artifactCompare,
    open: openDatasetStore, handlers: (withStore: any) => createDatasetActionHandlers({ withStore, modelAvailability: unavailable }) },
  { name: "PPT", type: PPT_ARTIFACT_TYPE_ID, kind: PPT_SUBJECT_KIND, definition: pptActions.artifactCompare,
    open: openPptStore, handlers: (withStore: any) => createPptActionHandlers({ withStore }) },
];

for (const owner of owners) {
  test(`${owner.name}: a pinned version of an object that moved to another place is compared with it, not reported deleted`, async t => {
    const home = await mkdtemp(join(tmpdir(), "artifact-compare-moved-"));
    t.after(() => rm(home, { recursive: true, force: true }));
    const withStore = <T>(run: (store: any) => T): T => { const store = (owner.open as (home: string) => any)(home); try { return run(store); } finally { store.close(); } };
    const compare = owner.handlers(withStore).find((handler: any) => handler.capability_id === owner.definition.capability_id)!;
    const object = withStore(store => store.create({ project_id: "project-a", title: "Plan" }));
    const version = (id: string) => ({ artifact_type_id: owner.type, origin: { kind: "pinned", subject: { kind: owner.kind, id }, revision: String(object.version) },
      payload: JSON.parse(JSON.stringify(object)) });
    const caller = (project: string) => ({ actor_id: "web-user", audience: "user", project_id: project, permissions: [] }) as any;
    const state = (project: string, id = object.id) => (compare.handle(caller(project), { artifact: version(id) }) as { state: string }).state;

    assert.equal(state("project-a"), "same");
    withStore(store => store.relocate(object.id, "project-a", "project-b"));
    assert.equal(state("project-a"), "moved", "it still exists, in the other project");
    assert.equal(state("project-b"), "same", "and compares as before where it is now");
    assert.equal(state("project-a", "never-existed"), "missing", "only an object that exists nowhere is gone");
  });
}
