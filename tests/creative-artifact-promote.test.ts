import { pptTestPorts } from "./fixtures/ppt-actions.js";
import { formTestPorts } from "./fixtures/form-actions.js";
import { datasetTestPorts } from "./fixtures/dataset-actions.js";
import { zh as pagesZh } from "./fixtures/pages-host.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  datasetActions,
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
  openPptStore,
  pptActions,
  renderPptWorkbench,
} from "@molis-ai/molis-work-plugin-ppt";

const primitives = {
  escape: (value: unknown) => String(value ?? ""),
  text: (value: string) => value,
};

test("四个创作插件的列表和顶栏都有存为固定版本（放进 Artifacts）", () => {
  // Pages' words are stable keys: the page is shown in the person's language, as the Host would.
  const pages = renderPagesWorkbench({ primitives: { ...primitives, text: (key: string, values?: Record<string, string | number>) => pagesZh(key, values) } });
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
  assert.match(readFileSync(fileURLToPath(new URL("../plugins/native/dataset/src/browser/commands.ts", import.meta.url)), "utf8"), /data-dataset-artifact/);

  const ppt = renderPptWorkbench({ primitives });
  assert.match(ppt, /data-ppt-artifact-bar/);
  assert.match(readFileSync(fileURLToPath(new URL("../plugins/native/ppt/src/browser/commands.ts", import.meta.url)), "utf8"), /data-ppt-artifact/);
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
    const { actions } = datasetTestPorts(datasets, query.get("project_id")!, {
      publishArtifact: (input) => {
        assert.equal(input.content.columns.length, 1);
        return { artifact_id: "dataset-" + input.record_id, version: input.version };
      },
    });
    const created = await actions.invoke(datasetActions.create, { title: "分数" });
    const id = created.dataset.id;
    await actions.invoke(datasetActions.update, { id, columns: [{ id: "c1", name: "姓名", type: "text", order: 1 }], rows: [] });
    const promoted = await actions.invoke(datasetActions.snapshot, { id, note: "编辑历史" });
    assert.equal(promoted.version.note, "编辑历史");
    const artifact = await actions.invoke(datasetActions.promote, { id });
    assert.equal(artifact.dataset.artifact_version, 1);
    const again = await actions.invoke(datasetActions.promote, { id });
    assert.equal(again.dataset.artifact_version, 2);
  } finally {
    datasets.close();
  }

  const decks = openPptStore(home);
  try {
    const { actions } = pptTestPorts(decks, query.get("project_id")!, {
      publishArtifact: (input) => {
        assert.ok(input.content.slides.length > 0);
        return { artifact_id: "ppt-" + input.record_id, version: input.version };
      },
    });
    const created = await actions.invoke(pptActions.create, { title: "发布会" });
    const id = created.presentation.id;
    const first = await actions.invoke(pptActions.promote, { id });
    const second = await actions.invoke(pptActions.promote, { id });
    assert.equal(first.artifact.version, 1);
    assert.equal(second.presentation.title, "发布会");
    assert.equal(second.presentation.artifact_version, 2);
  } finally {
    decks.close();
  }
});
