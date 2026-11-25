import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService, assertActionInput } from "@molis-ai/molis-work-kernel";
import { bindActionClient, isObjectExporter, isObjectPutter, isObjectRemover, type PlacementExport, type PlacementRecord } from "@molis-ai/molis-work-contracts/platform/actions";
import { placementActions } from "@molis-ai/molis-work-contracts/services/placement";
import { datasetActions, datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { formActions, formManifest } from "@molis-ai/molis-work-plugin-form";
import { createLingguangActionHandlers, createLingguangContentHandlers, LINGGUANG_ACTION_PERMISSIONS, lingguangActions, lingguangManifest, ownLingguangStores } from "@molis-ai/molis-work-plugin-lingguang";
import { pagesActions, pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { pptActions, pptManifest } from "@molis-ai/molis-work-plugin-ppt";
import { openDatasetStore, openFormStore, openLingguangStore, openPagesStore, openPptStore } from "./fixtures/plugin-home-stores.js";
import { datasetTestPorts } from "./fixtures/dataset-actions.js";
import { formTestPorts } from "./fixtures/form-actions.js";
import { pagesTestPorts } from "./fixtures/pages-actions.js";
import { pptTestPorts } from "./fixtures/ppt-actions.js";

// AIC-14: the five document stores no longer carry their own `normalizeProjectId`. The project id they read comes from the call's trusted
// context (`project(caller)`) or from a placement input the schema has already checked. These actions are `scope: "project"`, so a call
// with no project is refused by the kernel before any handler runs, as `actions.project_required`.

const STORES = ["dataset", "form", "lingguang", "pages", "ppt"] as const;

test("AIC-14: no store defines or calls normalizeProjectId, and none refuses a project id for its length", async () => {
  for (const plugin of STORES) {
    const source = await readFile(new URL(`../plugins/native/${plugin}/src/store.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /normalizeProjectId/, `${plugin} store`);
    assert.doesNotMatch(source, /项目标识过长/, `${plugin} store`);
  }
});

test("AIC-14: a Home-level call with no project is still refused as actions.project_required by every document plugin", async t => {
  const home = await mkdtemp(join(tmpdir(), "store-project-id-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const dataset = openDatasetStore(home, "p"), form = openFormStore(home, "p"), spark = openLingguangStore(home, "p"), pages = openPagesStore(home, "p"), ppt = openPptStore(home, "p");
  t.after(() => { for (const store of [dataset, form, spark, pages, ppt]) store.close(); });
  const refused = { code: "actions.project_required" };
  // An empty project id on the call context is "no project".
  await assert.rejects(datasetTestPorts(dataset, "").actions.invoke(datasetActions.list, {}), refused);
  await assert.rejects(formTestPorts(form, "").actions.invoke(formActions.list, {}), refused);
  await assert.rejects(pagesTestPorts(pages, "").actions.invoke(pagesActions.list, {}), refused);
  await assert.rejects(pptTestPorts(ppt, "").actions.invoke(pptActions.list, {}), refused);
  const service = new ActionService();
  const actions = bindActionClient(service, () => ({ actor_id: "test", project_id: "", audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS }));
  service.registerProvider({ provider: { provider_id: lingguangManifest.plugin_id, title: "Lingguang", kind: "plugin", project_id: "" }, definitions: lingguangManifest.actions!,
    handlers: [...createLingguangActionHandlers({ ...ownLingguangStores(run => run(spark)), modelAvailability: () => ({ available: false, code: "x", reason: "x" }) }), ...createLingguangContentHandlers(actions)] });
  await assert.rejects(actions.invoke(lingguangActions.list, {}), refused);
});

test("AIC-14: a placement's to_project_id with blanks or past 120 characters is refused by the placement schema, not by a store", () => {
  // Since batch 107 these plugins move and copy through placement's carry (export there, put here, remove there): the target is only ever
  // placement's own input, and the plugins declare the three parts with no project id in them.
  const bad = ["", " p-1", "p-1 ", "p 1", "p-1\n", "x".repeat(121)];
  const object = { kind: "document", id: "doc-1", project_id: "p-0" };
  for (const definition of [placementActions.move, placementActions.copy]) {
    const input = (to_project_id: string) => definition === placementActions.copy ? { object, to_project_id, request_id: "r-1" } : { object, to_project_id };
    for (const to of bad) assert.throws(() => assertActionInput(definition.action.input_schema, input(to)), { code: "actions.input_invalid" }, `${definition.capability_id} ${JSON.stringify(to)}`);
    for (const to of ["p-1", "x".repeat(81), "x".repeat(120)]) assert.doesNotThrow(() => assertActionInput(definition.action.input_schema, input(to)), to);
  }
  for (const manifest of [datasetManifest, formManifest, lingguangManifest, pagesManifest, pptManifest]) {
    const actions = (manifest.actions ?? []).map(({ action }) => action);
    for (const part of [isObjectExporter, isObjectPutter, isObjectRemover]) assert.equal(actions.filter(part).length, 1, `${manifest.plugin_id} declares one ${part.name}`);
    assert.equal(actions.some(action => JSON.stringify(action.input_schema).includes("to_project_id")), false, `${manifest.plugin_id} takes no target project`);
  }
});

test("AIC-14: a project id of 81 characters works in all five stores (the old 80-character limit is gone)", async t => {
  const home = await mkdtemp(join(tmpdir(), "store-project-id-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const long = "p".repeat(81), other = "q".repeat(100);
  const dataset = openDatasetStore(home, long), form = openFormStore(home, long), spark = openLingguangStore(home, long), pages = openPagesStore(home, long), ppt = openPptStore(home, long);
  const there = { dataset: openDatasetStore(home, other), form: openFormStore(home, other), spark: openLingguangStore(home, other), pages: openPagesStore(home, other), ppt: openPptStore(home, other) };
  t.after(() => { for (const store of [dataset, form, spark, pages, ppt, ...Object.values(there)]) store.close(); });
  /** Carried to `other` the way placement moves it: exported here, put there under its id, removed here; what is put says where it is. */
  const carry = <R extends { project_id: string }>(from: { exportRecord(id: string): PlacementExport; removeCarried(id: string, revision: string): boolean },
    to: { putRecord(record: PlacementRecord, requestId: string, targetId?: string): R }, id: string): R => {
    const carried = from.exportRecord(id), put = to.putRecord(carried.record, "move-" + id, id);
    assert.equal(from.removeCarried(id, carried.revision), true);
    return put;
  };

  const d = dataset.create({ title: "表" });
  assert.equal(d.project_id, long);
  assert.deepEqual(dataset.list().map(row => row.id), [d.id]);
  assert.equal(dataset.get(d.id).id, d.id);
  assert.equal(carry(dataset, there.dataset, d.id).project_id, other);

  const f = form.create({ title: "问卷" });
  assert.deepEqual(form.list().map(row => row.id), [f.id]);
  assert.equal(form.get(f.id).id, f.id);
  assert.equal(carry(form, there.form, f.id).project_id, other);

  const s = spark.create({ title: "灵光", body: "想法" });
  assert.deepEqual(spark.list().map(row => row.id), [s.id]);
  assert.equal(spark.get(s.id).id, s.id);
  assert.equal(carry(spark, there.spark, s.id).project_id, other);

  const p = pages.create({ title: "文档" });
  assert.deepEqual(pages.list().map(row => row.id), [p.id]);
  assert.equal(pages.get(p.id).id, p.id);
  assert.equal(carry(pages, there.pages, p.id).project_id, other);

  const d2 = ppt.create({ title: "演示" });
  assert.deepEqual(ppt.list().map(row => row.id), [d2.id]);
  assert.equal(ppt.get(d2.id).id, d2.id);
  assert.equal(carry(ppt, there.ppt, d2.id).project_id, other);
});
