import { pageText, withPageText } from "./fixtures/page-text.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { datasetActions, renderDatasetWorkbench } from "@molis-ai/molis-work-plugin-dataset";
import { FORM_CLIENT_FACTORY_SCRIPT, formActions, renderFormWorkbench } from "@molis-ai/molis-work-plugin-form";
import {
  pagesActions, PAGES_CLIENT_FACTORY_SCRIPT,
  renderPagesWorkbench,
} from "@molis-ai/molis-work-plugin-pages";
import { pptActions, renderPptWorkbench } from "@molis-ai/molis-work-plugin-ppt";

import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";

const primitives = {
  escape: (value: unknown) => String(value ?? ""),
};

test("四个创作插件的列表和顶栏都有存为固定版本（放进 Artifacts）", () => {
  // Pages' words are stable keys: the page is shown in the person's language, as the Host would.
  const pages = withPageText("zh", ["pages"], () => renderPagesWorkbench({ primitives: { ...primitives, text: pageText("zh", "pages") } }));
  assert.match(pages, /data-pages-artifact-bar/);
  // Named by what the person gets: a version that no longer changes, kept in this location's Artifacts.
  assert.match(pages, /存为固定版本/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /data-pages-artifact/);

  const form = withPageText("zh", ["form"], () => renderFormWorkbench({ primitives: { ...primitives, text: pageText("zh", "form") } }));
  assert.match(form, /data-form-artifact-bar/);
  assert.match(form, /data-form-publish/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /data-form-artifact/);

  const dataset = withPageText("zh", ["dataset"], () => renderDatasetWorkbench({ primitives: { ...primitives, text: pageText("zh", "dataset") } }));
  assert.match(dataset, /data-dataset-artifact-bar/);
  assert.match(dataset, /data-dataset-snapshot/);
  assert.match(readFileSync(fileURLToPath(new URL("../plugins/native/dataset/src/browser/commands.ts", import.meta.url)), "utf8"), /data-dataset-artifact/);

  const ppt = withPageText("zh", ["ppt"], () => renderPptWorkbench({ primitives: { ...primitives, text: pageText("zh", "ppt") } }));
  assert.match(ppt, /data-ppt-artifact-bar/);
  assert.match(readFileSync(fileURLToPath(new URL("../plugins/native/ppt/src/browser/commands.ts", import.meta.url)), "utf8"), /data-ppt-artifact/);
});

test("BSH-01 四家运行实例的固定版进入项目成果库并保留编辑稿", async t => {
  const h = await openTestHome(t), project = await h.createProject("Creative pins", ["form", "dataset", "ppt", "pages"]);
  const person = await h.host.localPersonContext(project.reference);
  const actions = bindActionClient(h.host.actionClient(project.reference), () => person);
  const read = (artifact_id: string, version: number) => h.host.withProject(project.reference,
    ({ artifacts }) => artifacts.query.getArtifactVersion(project.project_id, { artifact_id, version }));

  const { form } = await actions.invoke(formActions.create, { title: "报名" });
  assert.equal((await actions.invoke(formActions.promote, { id: form.id })).artifact.version, 1);
  const fixedForm = await actions.invoke(formActions.artifactPin, { subject_id: form.id });
  assert.equal(fixedForm.artifact.version, 2);
  assert.equal((await actions.invoke(formActions.get, { id: form.id })).form.title, "报名");
  assert.equal((await read(fixedForm.artifact.artifact_id, 2))?.title, "报名");

  const { dataset } = await actions.invoke(datasetActions.create, { title: "分数" });
  await actions.invoke(datasetActions.update, { id: dataset.id, columns: [{ id: "c1", name: "姓名", type: "text", order: 1 }], rows: [] });
  assert.equal((await actions.invoke(datasetActions.snapshot, { id: dataset.id, note: "编辑历史" })).version.note, "编辑历史");
  assert.equal((await actions.invoke(datasetActions.promote, { id: dataset.id })).dataset.artifact_version, 1);
  const fixedTable = await actions.invoke(datasetActions.artifactPin, { subject_id: dataset.id });
  const table = await read(fixedTable.artifact.artifact_id, 2);
  assert.equal((table?.payload as { columns: readonly unknown[] }).columns.length, 1);

  const { presentation } = await actions.invoke(pptActions.create, { title: "发布会" });
  assert.equal((await actions.invoke(pptActions.promote, { id: presentation.id })).artifact.version, 1);
  const fixedPpt = await actions.invoke(pptActions.artifactPin, { subject_id: presentation.id });
  const deck = await read(fixedPpt.artifact.artifact_id, 2);
  assert.equal(deck?.title, "发布会");
  assert.ok((deck?.payload as { slides: readonly unknown[] }).slides.length > 0);

  const { document } = await actions.invoke(pagesActions.create, { title: "发布记录", markdown: "原始正文" });
  const fixedPage = await actions.invoke(pagesActions.promote, { id: document.id, goal_id: "goal-shipping" });
  assert.equal(fixedPage.document.goal_id, "goal-shipping");
  const nextPage = await actions.invoke(pagesActions.artifactPin, { subject_id: document.id });
  assert.equal(nextPage.artifact.version, 2);
  assert.equal((await read(nextPage.artifact.artifact_id, 2))?.metadata.goal_id, "goal-shipping");
});
