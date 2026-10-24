import { pluginDocuments } from "./fixtures/plugin-documents.js";
import { pptTestPorts } from "./fixtures/ppt-actions.js";
import { formTestPorts } from "./fixtures/form-actions.js";
import { datasetTestPorts } from "./fixtures/dataset-actions.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALWAYS_ON_PLUGIN_IDS,
  PERSONAL_PLUGIN_IDS,
  PROJECT_SCOPED_PLUGIN_IDS,
  pluginMarketCards,
  railEntries,
} from "@molis-ai/molis-work-app-workbench";
import {
  datasetActions,
  mergeDatasetDraftRows,
  openDatasetStore,
  parseCsv,
  toCsv,
} from "@molis-ai/molis-work-plugin-dataset";
import {
  FORM_CLIENT_FACTORY_SCRIPT,
  FORM_EN,
  FORM_STYLES,
  formActions,
  openFormStore,
} from "@molis-ai/molis-work-plugin-form";
import {
  openPptStore,
  pptActions,
} from "@molis-ai/molis-work-plugin-ppt";
import {
  renderMolisWorkWeb,
  renderMolisWorkWorkbenchClientScript,
  renderMolisWorkWorkbenchStylesheet,
  type MolisWorkWebView,
} from "./workbench-renderer-fixture.js";

const PROJECT = "project-creative-tools";
const OTHER = "project-other";

function projectQuery(): URLSearchParams {
  return new URLSearchParams({ project_id: PROJECT });
}

function projectBody(body: Record<string, unknown> = {}): Record<string, unknown> {
  return { project_id: PROJECT, ...body };
}

// Forms' page is TypeScript bundled into its client pack (W4-04): what its code does is read in the sources, what it ships in the bundle.
const formSource = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/form/src/browser/${file}`, import.meta.url)), "utf8");
// Dataset's page is the same: TypeScript bundled into its client pack, read here in the sources.
const datasetSource = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/dataset/src/browser/${file}`, import.meta.url)), "utf8");
// PPT's page is the same.
const pptSource = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/ppt/src/browser/${file}`, import.meta.url)), "utf8");
const between = (text: string, from: string, to: string) => {
  const start = text.indexOf(from), end = text.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `找不到 ${from}`);
  return text.slice(start, end);
};

function emptyView(): MolisWorkWebView {
  return {
    snapshot: {
      board: {
        project_id: "board-creative-tools",
        title: "创作工具",
        active_goal_id: null,
        created_at: "2026-09-21T00:00:00.000Z",
        updated_at: "2026-09-21T00:00:00.000Z",
      },
      cursor: 0,
      goals: [],
      relations: [],
      goal_tree_proposals: [],
      planning_method_packs: [],
    },
    project: { project_id: PROJECT, display_name: "创作工具" },
    projects: [{ project_id: PROJECT, display_name: "创作工具" }],
    route_prefix: `/projects/${PROJECT}`,
    demo: false,
    active_goal_id: null,
    goals: [],
    archived_goals: [],
    trashed_goals: [],
    counts: {},
    input_bindings: [],
    policy_bindings: [],
    events: [],
    feed: {
      sources: [],
      feed_items: [],
      inbox_entries: [],
      runs: [],
      out_rules: [],
    },
  } as MolisWorkWebView;
}

async function withHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "creative-tools-"));
  try {
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test("Forms / Dataset / PPT 是个人插件，不进项目启用名单", () => {
  assert.equal(PERSONAL_PLUGIN_IDS.includes("functions" as never), false, "判断已迁入系统服务");
  for (const id of ["form", "dataset", "ppt"]) assert.ok(PERSONAL_PLUGIN_IDS.includes(id));
  assert.equal([...PERSONAL_PLUGIN_IDS, ...PROJECT_SCOPED_PLUGIN_IDS].includes("characters"), false, "角色是宿主设置的一节，不是插件（CHR-1）");
  assert.equal(PROJECT_SCOPED_PLUGIN_IDS.includes("alchemist"), false, "炼金术士不该要项目添加");
  for (const id of ["form", "dataset", "ppt"]) {
    assert.equal(PROJECT_SCOPED_PLUGIN_IDS.includes(id), false, `${id} 不该要项目添加`);
  }
  const rail = railEntries(["goals", ...PERSONAL_PLUGIN_IDS, "artifacts"]).map((entry) => entry.id);
  assert.deepEqual(
    rail.filter((id) => ["form", "dataset", "ppt"].includes(id)),
    ["form", "dataset", "ppt"],
  );
  const market = pluginMarketCards();
  // Every personal plugin is in the market except the 常开插件 (Shelf), which nobody adds or removes.
  assert.deepEqual(ALWAYS_ON_PLUGIN_IDS, ["shelf"]);
  assert.deepEqual(market.filter((card) => card.personal).map((card) => card.id),
    PERSONAL_PLUGIN_IDS.filter((id) => !ALWAYS_ON_PLUGIN_IDS.includes(id)));
  assert.equal(market.find((card) => card.id === "form")?.copy, "建问卷，收答卷，看逐题汇总。");
});

test("工作台 HTML 挂上三个创作入口，确认与工具条不在 label 里", () => {
  const owner = renderMolisWorkWeb(emptyView());
  const html = owner + pluginDocuments(owner).join("\n");
  assert.match(html, /data-plugin-id="form"/);
  assert.match(html, /data-plugin-id="dataset"/);
  assert.match(html, /data-plugin-id="ppt"/);
  assert.match(html, /data-form="workbench"/);
  assert.match(html, /data-dataset="workbench"/);
  assert.match(html, /data-ppt="workbench"/);
  assert.match(html, /data-ppt-swatch/);
  assert.doesNotMatch(html, /type="color"/);
  assert.match(html, /data-project-id="project-creative-tools"/);
  assert.match(html, /data-form-confirm/);
  assert.match(html, /data-dataset-confirm/);
  assert.match(html, /data-ppt-confirm/);
  assert.match(html, /data-form-result-list/);
  assert.match(html, /class="mw-textarea"/);
  assert.match(html, /class="mw-select"/);
  // An empty table shows the shape of a table (ghost grid) and the two ways to fill it, not a sentence (plugin-e2e-review §3.5).
  assert.match(html, /data-dataset-table-empty[\s\S]*class="dataset-ghost"[\s\S]*data-dataset-add-column[\s\S]*data-dataset-import-file[\s\S]*data-dataset-paste-open/);
  assert.doesNotMatch(html, /data-dataset-column-name|data-dataset-column-type/);
  assert.match(html, /data-dataset-filter-empty/);
  assert.match(html, /没有匹配的格子/);
  assert.match(html, /placeholder="可选"/);
  assert.match(html, /讲者备注/);
  assert.match(html, /class="form-prompt"/);
  assert.match(html, /class="dataset-prompt"/);
  // Importing replaces the table; the button says so before anyone clicks it.
  assert.match(html, /导入 CSV（会覆盖当前表）/);
  assert.match(html, /<div class="form-prompt">[\s\S]*data-form-ai-prompt[\s\S]*<\/label>[\s\S]*data-form-generate/);
  assert.match(html, /<div class="dataset-prompt">[\s\S]*data-dataset-ai-prompt[\s\S]*<\/label>[\s\S]*data-dataset-generate/);
  assert.doesNotMatch(html, /data-form-ai-prompt"[^>]*>\s*<button[^>]*data-form-generate/);
  assert.doesNotMatch(html, /data-dataset-ai-prompt"[^>]*>\s*<button[^>]*data-dataset-generate/);
  assert.match(html, /plugin-stage-list feed-stage-list feed-stage-tree" data-form="directory"/);
  assert.match(html, /plugin-stage-list feed-stage-list feed-stage-tree" data-dataset="directory"/);
  assert.match(html, /plugin-stage-list feed-stage-list feed-stage-tree" data-ppt="directory"/);
  assert.match(html, /class="mw-btn mw-btn--ghost tree-create"[^>]*data-form-new/);
  assert.match(html, /class="mw-btn mw-btn--ghost tree-create"[^>]*data-dataset-new/);
  assert.match(html, /class="mw-btn mw-btn--ghost tree-create"[^>]*data-ppt-new/);
  assert.doesNotMatch(html, /mw-btn--secondary"[^>]*data-form-new/);
  assert.doesNotMatch(html, /mw-btn--secondary"[^>]*data-dataset-new/);
  assert.doesNotMatch(html, /mw-btn--secondary"[^>]*data-ppt-new/);
  assert.match(html, /class="form-identity"/);
  assert.match(html, /class="dataset-identity"/);
  assert.match(html, /class="ppt-meta"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /data-ppt-editor-status/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /--tab-tone: var\(--plugin-form/);
  // A form pane arrives with the product's one rise on the state clock; the plugin writes no keyframes of its own.
  assert.match(renderMolisWorkWorkbenchStylesheet(), /@keyframes craft-rise \{/);
  assert.match(FORM_STYLES, /\[data-form-pane\]:not\(\[hidden\]\) \{ animation: craft-rise var\(--dur-move\)/);
  assert.doesNotMatch(FORM_STYLES, /@keyframes/);
  assert.ok(!Object.hasOwn(FORM_EN, "1 到 5"));
});

test("工作台客户端脚本在挂上三个创作插件后仍能解析", () => {
  const script = renderMolisWorkWorkbenchClientScript();
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes("const PERSONAL_PLUGIN_IDS = " + JSON.stringify([...PERSONAL_PLUGIN_IDS])));
  assert.doesNotMatch(formSource("save.ts"), /fillEditor/);
  assert.doesNotMatch(between(datasetSource("editor.ts"), "const drain", "page.queueSave"), /fillEditor/);
  assert.doesNotMatch(between(pptSource("editor.ts"), "const drain", "page.queueSave"), /fillEditor/);
  // Form serialization and stale-response preservation are exercised in the actual browser.
  // Dataset save ordering and conflict preservation are exercised in the real browser tests.
  // PPT save ordering and conflict retention are verified through the real browser.
  assert.match(formSource("results.ts"), /seq !== page\.resultsSeq \|\| page\.sel\?\.id !== id/); // the open questionnaire is `sel` (fa63ade24)
  assert.match(between(formSource("list.ts"), "export const fillEditor", "export const closeEditor"), /resetEditing\(page\)/);
  assert.match(between(formSource("list.ts"), "const resetEditing", "export const fillEditor"), /clearTimeout\(page\.saveTimer\)/);
  assert.match(between(datasetSource("editor.ts"), "page.fillEditor = ", "page.closeEditor"), /clearTimeout\(s\.saveTimer\)/);
  assert.match(between(pptSource("editor.ts"), "page.fillEditor = ", "page.closeEditor"), /clearTimeout\(s\.saveTimer\)/);
  assert.match(datasetSource("commands.ts"), /closest\("\[data-column-type\]"\)/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /data-question-move/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /mw-check/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /form-preview-rating/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /data-option-remove/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /data-form-result-list/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /form\.fill\.missing-required/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /form\.result\.loading/);
  assert.match(pptSource("slides.ts"), /ppt-card-notes/);
  assert.match(pptSource("slides.ts"), /ppt-card-empty/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /feed-stage-entry directory-list-row/);
  assert.match(datasetSource("list.ts"), /feed-stage-entry directory-list-row/);
  assert.match(pptSource("list.ts"), /feed-stage-entry directory-list-row/);
  // Rows no longer repeat the plugin's name as a chip; their only label is the record's state (plugin-e2e-review §4 X2).
  for (const [script, cell] of [[formSource("list.ts"), /fixedCell\(L, record\)/], [datasetSource("list.ts"), /fixedCell\(record\)/], [pptSource("list.ts"), /fixedCell\(page, record\)/]] as const) {
    assert.doesNotMatch(script, /kindChip\(/);
    assert.doesNotMatch(script, /plugin-stage-kind/);
    assert.match(script, cell);
    assert.match(script, /L\("(?:固定版本|form\.fixed\.label|dataset\.fixed\.label|ppt\.fixed\.label)"\) \+ " v" \+ record\.artifact_version/);
    // The row-level "存为固定版本" control is gone: it looked like share and was the least-used action; the editor keeps it.
    assert.doesNotMatch(script, /creative-artifact-act/);
  }
  assert.match(datasetSource("list.ts"), /L\("dataset\.list\.empty-table"\)/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /is-arriving/);
  assert.match(datasetSource("page.ts"), /is-arriving/);
  assert.match(pptSource("page.ts"), /is-arriving/);
  assert.match(formSource("list.ts"), /mw-status mw-status--plain mw-status--" \+ \(published/);
  assert.match(pptSource("slides.ts"), /ppt-slide-index/);
  // The PPT row carries no placeholder status span any more; its state cell is fixedCell (asserted above).
  assert.doesNotMatch(pptSource("list.ts"), /mw-status--quiet feed-entry-status/);
  assert.doesNotMatch(pptSource("list.ts"), /L\("草稿"\)/);
  assert.doesNotMatch(formSource("list.ts"), /className = "form-row/);
  assert.doesNotMatch(datasetSource("list.ts"), /className = "dataset-row/);
  assert.doesNotMatch(pptSource("list.ts"), /className = "ppt-row/);
});

test("Dataset：删行丢掉，筛选藏着的行留下；页面包用同一合并函数", () => {
  const columns = [{ id: "name" }];
  const deleted = mergeDatasetDraftRows(
    [
      { id: "keep-hidden", cells: { name: "苹果" } },
      { id: "deleted", cells: { name: "香蕉" } },
      { id: "visible", cells: { name: "香蕉派" } },
    ],
    [{ id: "visible", cells: { name: "香蕉派改" } }],
    columns,
    "香蕉",
  );
  assert.deepEqual(deleted.map((row) => row.id), ["keep-hidden", "visible"]);
  assert.equal(deleted.find((row) => row.id === "visible")?.cells?.name, "香蕉派改");
  assert.equal(deleted.find((row) => row.id === "keep-hidden")?.cells?.name, "苹果");

  const filtered = mergeDatasetDraftRows(
    [
      { id: "hidden", cells: { name: "苹果" } },
      { id: "shown", cells: { name: "香蕉" } },
    ],
    [{ id: "shown", cells: { name: "香蕉" } }],
    columns,
    "香蕉",
  );
  assert.deepEqual(filtered.map((row) => row.id), ["hidden", "shown"]);

  const appended = mergeDatasetDraftRows(
    [{ id: "old", cells: { name: "一" } }],
    [
      { id: "old", cells: { name: "一" } },
      { id: "new", cells: { name: "二" } },
    ],
    columns,
    "",
  );
  assert.deepEqual(appended.map((row) => row.id), ["old", "new"]);

  const clearedFilterTooSoon = mergeDatasetDraftRows(
    [
      { id: "hidden", cells: { name: "苹果" } },
      { id: "shown", cells: { name: "香蕉" } },
    ],
    [{ id: "shown", cells: { name: "香蕉" } }],
    columns,
    "",
  );
  assert.deepEqual(clearedFilterTooSoon.map((row) => row.id), ["shown"], "空筛选只能描述当前 DOM；隐藏行要用画出 DOM 时的旧筛选提交");

  // The page's code takes the same function from the package's source (the bundle includes it) and hands it the filter the rows
  // were drawn with (filterSeen), not the one being typed.
  assert.match(datasetSource("table.ts"), /import \{ mergeDatasetDraftRows \} from "\.\.\/row-merge\.js"/);
  assert.match(datasetSource("table.ts"), /mergeDatasetDraftRows\(s\.selected\?\.rows \|\| \[\], page\.rowsFromDom\(\), columns, s\.filterSeen\)/);
  assert.match(datasetSource("page.ts"), /filterSeen: ""/);
  // Actual type switching (including textarea replacement) is covered by Dataset browser tests.
  assert.match(datasetSource("table-commands.ts"), /filter\(\(item\) => item\.id !== id\)/);
});

test("Forms：建题、预览提交、结果计数，重开还在；出题是本地 stub", async () => {
  await withHome(async (home) => {
    const store = openFormStore(home);
    // Form's routes are its Runtime plugin's now (tests/form-runtime-routes.test.ts); the same steps through its actions.
    const { actions } = formTestPorts(store, PROJECT);
    const created = await actions.invoke(formActions.create, { title: "周报" });
    const id = created.form.id;
    assert.equal(created.form.project_id, PROJECT);
    await actions.invoke(formActions.update, { id,
      questions: [{ id: "q1", type: "singleChoice", title: "用得最多的工具", required: true, order: 1, options: [{ id: "a", label: "编辑器" }, { id: "b", label: "终端" }] }] });
    const generatedForm = (await actions.invoke(formActions.generate, { id, prompt: "你最常用的工具是什么" })).form;
    assert.equal(generatedForm.questions.at(-1)?.title, "你最常用的工具是什么");
    assert.equal(generatedForm.questions.at(-1)?.type, "text");
    await actions.invoke(formActions.publish, { id });
    await assert.rejects(
      () => actions.invoke(formActions.submit, { id, answers: {} }),
      (error: Error) => error.message.includes("请回答"),
    );
    await actions.invoke(formActions.submit, { id, answers: { q1: "编辑器" } });
    const results = await actions.invoke(formActions.results, { id });
    assert.equal(results.analysis.submission_count, 1);
    store.close();

    const reopened = openFormStore(home);
    const listed = reopened.list(PROJECT);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.title, "周报");
    assert.equal(reopened.analyze(id).submission_count, 1);
    reopened.close();
  });
});

test("Dataset：行列、CSV、导出、版本回滚，重开还在；加列是本地 stub", async () => {
  await withHome(async (home) => {
    const store = openDatasetStore(home);
    const { actions } = datasetTestPorts(store, PROJECT);
    const created = await actions.invoke(datasetActions.create, { title: "成绩" });
    const id = created.dataset.id;
    const imported = await actions.invoke(datasetActions.import, { id, csv: "姓名,分数\n一骏,95\n小陈,88" });
    const table = imported.dataset;
    assert.equal(table.columns.length, 2);
    assert.equal(table.rows.length, 2);
    assert.equal(table.columns[0]?.type, "text");
    assert.equal(table.columns[1]?.type, "number");
    const generated = await actions.invoke(datasetActions.generate, { id, prompt: "完成日期" });
    const withColumn = generated.dataset;
    assert.equal(withColumn.columns.at(-1)?.name, "完成日期");
    assert.equal(withColumn.columns.at(-1)?.type, "text");
    await actions.invoke(datasetActions.snapshot, { id, note: "导入后" });
    await actions.invoke(datasetActions.update, { id, rows: [] });
    const versions = await actions.invoke(datasetActions.versions, { id });
    const versionId = versions.versions[0]?.id ?? "";
    const rolled = await actions.invoke(datasetActions.rollback, { id, version_id: versionId });
    const restored = rolled.dataset;
    assert.equal(restored.rows.length, 2);
    const exported = await actions.invoke(datasetActions.export, { id });
    const csv = exported.csv;
    assert.match(csv, /姓名/);
    assert.match(csv, /一骏/);
    const parsed = parseCsv(csv);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parseCsv("日期\n2026-09-21\n2026-09-22").columns[0]?.type, "date");
    assert.equal(parseCsv("备注\n1\n待定").columns[0]?.type, "text");
    const quoted = parseCsv('备注\n"a""b"');
    assert.equal(Object.values(quoted.rows[0]?.cells ?? {})[0], 'a"b');
    assert.match(toCsv(store.get(id)), /95/);
    store.close();

    const reopened = openDatasetStore(home);
    assert.equal(reopened.get(id).rows.length, 2);
    reopened.close();
  });
});

test("PPT：多页编辑、主题色、JSON 导出字段，重开还在", async () => {
  await withHome(async (home) => {
    const store = openPptStore(home);
    const { actions } = pptTestPorts(store, PROJECT);
    const created = await actions.invoke(pptActions.create, { title: "季度回顾" });
    const id = created.presentation.id;
    const updated = await actions.invoke(pptActions.update, {
      id,
      color_primary: "#5e6ad2",
      slides: [
        { id: "s1", title: "开场", bullets: ["这一季做了什么"], notes: "慢一点", order: 1 },
        { id: "s2", title: "下一步", bullets: ["把问卷接回来", "把表格接回来"], notes: "", order: 2 },
      ],
    });
    const deck = updated.presentation;
    assert.equal(deck.slides.length, 2);
    assert.equal(deck.slides[1]?.title, "下一步");
    assert.deepEqual(deck.slides[0]?.bullets, ["这一季做了什么"]);
    assert.equal(deck.color_primary, "#5e6ad2");
    const exported = await actions.invoke(pptActions.export, { id });
    assert.match(exported.content, /开场/);
    assert.match(exported.content, /把表格接回来/);
    store.close();

    const reopened = openPptStore(home);
    assert.equal(reopened.get(id).slides.length, 2);
    reopened.close();
  });
});

test("问卷、数据表、演示稿按项目隔离", async () => {
  await withHome(async (home) => {
    const forms = openFormStore(home);
    const datasets = openDatasetStore(home);
    const ppts = openPptStore(home);
    const formA = forms.create({ project_id: PROJECT, title: "项目甲问卷" });
    forms.create({ project_id: OTHER, title: "项目乙问卷" });
    datasets.create({ project_id: PROJECT, title: "项目甲表" });
    datasets.create({ project_id: OTHER, title: "项目乙表" });
    ppts.create({ project_id: PROJECT, title: "项目甲演示" });
    ppts.create({ project_id: OTHER, title: "项目乙演示" });
    assert.deepEqual(forms.list(PROJECT).map((item) => item.title), ["项目甲问卷"]);
    assert.deepEqual(forms.list(OTHER).map((item) => item.title), ["项目乙问卷"]);
    assert.deepEqual(datasets.list(PROJECT).map((item) => item.title), ["项目甲表"]);
    assert.deepEqual(ppts.list(OTHER).map((item) => item.title), ["项目乙演示"]);
    assert.throws(() => forms.get(formA.id, OTHER));
    // A page asking Forms in one project for another project's forms is refused by the route: tests/form-runtime-routes.test.ts.
    forms.close();
    datasets.close();
    ppts.close();
  });
});
