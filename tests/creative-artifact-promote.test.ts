import { pptTestPorts } from "./fixtures/ppt-actions.js";
import { formTestPorts } from "./fixtures/form-actions.js";
import { datasetTestPorts } from "./fixtures/dataset-actions.js";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DATASET_CLIENT_FACTORY_SCRIPT,
  DatasetPluginRouteTable,
  createDatasetRouteHandlers,
  openDatasetStore,
  renderDatasetWorkbench,
} from "@molis-ai/molis-work-plugin-dataset";
import {
  FORM_CLIENT_FACTORY_SCRIPT,
  formActions,
  openFormStore,
  renderFormWorkbench,
} from "@molis-ai/molis-work-plugin-form";
import {
  PAGES_CLIENT_FACTORY_SCRIPT,
  renderPagesWorkbench,
} from "@molis-ai/molis-work-plugin-pages";
import {
  PPT_CLIENT_FACTORY_SCRIPT,
  PptPluginRouteTable,
  createPptRouteHandlers,
  openPptStore,
  renderPptWorkbench,
} from "@molis-ai/molis-work-plugin-ppt";

const primitives = {
  escape: (value: unknown) => String(value ?? ""),
  text: (value: string) => value,
};

test("四个创作插件的列表和顶栏都有存为固定版本（放进 Artifacts）", () => {
  const pages = renderPagesWorkbench({ primitives });
  assert.match(pages, /data-pages-artifact-bar/);
  // Named by what the person gets: a version that no longer changes, kept in this location's Artifacts.
  assert.match(pages, /存为固定版本/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /data-pages-artifact/);

  const form = renderFormWorkbench({ primitives });
  assert.match(form, /data-form-artifact-bar/);
  assert.match(form, /data-form-publish/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /data-form-artifact/);

  const dataset = renderDatasetWorkbench({ primitives });
  assert.match(dataset, /data-dataset-artifact-bar/);
  assert.match(dataset, /data-dataset-snapshot/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /data-dataset-artifact/);

  const ppt = renderPptWorkbench({ primitives });
  assert.match(ppt, /data-ppt-artifact-bar/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /data-ppt-artifact/);
});

test("问卷、数据表、演示稿可以连续存成两版 Artifact，编辑稿还在", async () => {
  const home = mkdtempSync(join(tmpdir(), "creative-artifact-"));
  const project_id = "project-1";
  const query = new URLSearchParams({ project_id });

  const forms = openFormStore(home);
  try {
    // Form's routes are its Runtime plugin's now (tests/form-runtime-routes.test.ts); this is the same pair of pins through its actions.
    const { actions } = formTestPorts(forms, project_id, {
      publishArtifact: (input) => ({ artifact_id: "form-" + input.record_id, version: input.version }),
    });
    const id = (await actions.invoke(formActions.create, { title: "报名" })).form.id;
    const first = await actions.invoke(formActions.promote, { id });
    const { form } = await actions.invoke(formActions.promote, { id });
    assert.equal(form.title, "报名");
    assert.equal(form.artifact_id, "form-" + id);
    assert.equal(form.artifact_version, 2);
    assert.equal(first.artifact.version, 1);
  } finally {
    forms.close();
  }

  const datasets = openDatasetStore(home);
  try {
    const routes = new DatasetPluginRouteTable(createDatasetRouteHandlers(datasetTestPorts(datasets, query.get("project_id")!, {
      publishArtifact: (input) => {
        assert.equal(input.content.columns.length, 1);
        return { artifact_id: "dataset-" + input.record_id, version: input.version };
      },
    })));
    const created = await routes.handle({ method: "POST", pathname: "/api/dataset", query, body: { title: "分数" } });
    const id = (created?.body as { dataset: { id: string } }).dataset.id;
    await routes.handle({
      method: "POST",
      pathname: `/api/dataset/${id}`,
      query,
      body: { columns: [{ id: "c1", name: "姓名", type: "text", order: 1 }], rows: [] },
    });
    const promoted = await routes.handle({ method: "POST", pathname: `/api/dataset/${id}/versions`, query, body: { note: "编辑历史" } });
    assert.equal((promoted?.body as { version: { note: string } }).version.note, "编辑历史");
    const artifact = await routes.handle({ method: "POST", pathname: `/api/dataset/${id}/promote`, query, body: {} });
    const dataset = (artifact?.body as { dataset: { artifact_version: number } }).dataset;
    assert.equal(dataset.artifact_version, 1);
    const again = await routes.handle({ method: "POST", pathname: `/api/dataset/${id}/promote`, query, body: {} });
    assert.equal((again?.body as { dataset: { artifact_version: number } }).dataset.artifact_version, 2);
  } finally {
    datasets.close();
  }

  const decks = openPptStore(home);
  try {
    const routes = new PptPluginRouteTable(createPptRouteHandlers(pptTestPorts(decks, query.get("project_id")!, {
      publishArtifact: (input) => {
        assert.ok(input.content.slides.length > 0);
        return { artifact_id: "ppt-" + input.record_id, version: input.version };
      },
    })));
    const created = await routes.handle({ method: "POST", pathname: "/api/ppt", query, body: { title: "发布会" } });
    const id = (created?.body as { presentation: { id: string } }).presentation.id;
    const first = await routes.handle({ method: "POST", pathname: `/api/ppt/${id}/promote`, query, body: {} });
    const second = await routes.handle({ method: "POST", pathname: `/api/ppt/${id}/promote`, query, body: {} });
    assert.equal((first?.body as { artifact: { version: number } }).artifact.version, 1);
    assert.equal((second?.body as { presentation: { title: string; artifact_version: number } }).presentation.title, "发布会");
    assert.equal((second?.body as { presentation: { artifact_version: number } }).presentation.artifact_version, 2);
  } finally {
    decks.close();
  }
});
