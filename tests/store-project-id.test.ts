import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService, assertActionInput } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
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
// context (`project(caller)`) or from a placement input the schema has already checked; the one place that still says "no project" is the
// handler's `actions.project_required`.

const STORES = ["dataset", "form", "lingguang", "pages", "ppt"] as const;
const subject = { kind: "document", id: "doc-1" };
const MOVE_INPUT_TYPE = "molis.placement.move.input.v1", COPY_INPUT_TYPE = "molis.placement.copy.input.v1";

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
  const dataset = openDatasetStore(home), form = openFormStore(home), spark = openLingguangStore(home), pages = openPagesStore(home), ppt = openPptStore(home);
  t.after(() => { for (const store of [dataset, form, spark, pages, ppt]) store.close(); });
  const refused = { code: "actions.project_required" };
  // An empty project id on the call context is "no project": the test ports bind it as the caller's.
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
  const bad = ["", " p-1", "p-1 ", "p 1", "p-1\n", "x".repeat(121)];
  for (const manifest of [datasetManifest, formManifest, lingguangManifest, pagesManifest, pptManifest]) {
    const placements = (manifest.actions ?? []).filter(({ action }) => action.input_type === MOVE_INPUT_TYPE || action.input_type === COPY_INPUT_TYPE);
    assert.ok(placements.length >= 2, `${manifest.plugin_id} declares a mover and a copier`);
    for (const { action } of placements) {
      const input = (to_project_id: string) => action.input_type === COPY_INPUT_TYPE ? { subject, to_project_id, request_id: "r-1" } : { subject, to_project_id };
      for (const to of bad) assert.throws(() => assertActionInput(action.input_schema, input(to)), { code: "actions.input_invalid" }, `${manifest.plugin_id} ${action.input_type} ${JSON.stringify(to)}`);
      for (const to of ["p-1", "x".repeat(81), "x".repeat(120)]) assert.doesNotThrow(() => assertActionInput(action.input_schema, input(to)), to);
    }
  }
});

test("AIC-14: a project id of 81 characters works in all five stores (the old 80-character limit is gone)", async t => {
  const home = await mkdtemp(join(tmpdir(), "store-project-id-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const long = "p".repeat(81), other = "q".repeat(100);
  const dataset = openDatasetStore(home), form = openFormStore(home), spark = openLingguangStore(home), pages = openPagesStore(home), ppt = openPptStore(home);
  t.after(() => { for (const store of [dataset, form, spark, pages, ppt]) store.close(); });

  const d = dataset.create({ title: "表", project_id: long });
  assert.equal(d.project_id, long);
  assert.deepEqual(dataset.list(long).map(row => row.id), [d.id]);
  assert.equal(dataset.get(d.id, long).id, d.id);
  assert.equal(dataset.relocate(d.id, long, other).project_id, other);

  const f = form.create({ title: "问卷", project_id: long });
  assert.deepEqual(form.list(long).map(row => row.id), [f.id]);
  assert.equal(form.get(f.id, long).id, f.id);
  assert.equal(form.relocate(f.id, long, other).project_id, other);

  const s = spark.create({ title: "灵光", body: "想法", project_id: long });
  assert.deepEqual(spark.list(long).map(row => row.id), [s.id]);
  assert.equal(spark.get(s.id, long).id, s.id);
  assert.equal(spark.relocate(s.id, long, other).project_id, other);

  const p = pages.create({ title: "文档", project_id: long });
  assert.deepEqual(pages.list(long).map(row => row.id), [p.id]);
  assert.equal(pages.get(p.id, long).id, p.id);
  assert.equal(pages.relocate(p.id, long, other).project_id, other);

  const d2 = ppt.create({ title: "演示", project_id: long });
  assert.deepEqual(ppt.list(long).map(row => row.id), [d2.id]);
  assert.equal(ppt.get(d2.id, long).id, d2.id);
  assert.equal(ppt.relocate(d2.id, long, other).project_id, other);
});
