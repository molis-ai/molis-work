import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PERSONAL_PLUGIN_IDS,
  PROJECT_SCOPED_PLUGIN_IDS,
  pluginMarketCards,
  railEntries,
} from "@molis-ai/molis-work-app-workbench";
import {
  DATASET_CLIENT_FACTORY_SCRIPT,
  DatasetPluginRouteTable,
  createDatasetRouteHandlers,
  mergeDatasetDraftRows,
  openDatasetStore,
  parseCsv,
  toCsv,
} from "@molis-ai/molis-work-plugin-dataset";
import {
  FORM_CLIENT_FACTORY_SCRIPT,
  FORM_EN,
  FORM_STYLES,
  FormPluginRouteTable,
  createFormRouteHandlers,
  openFormStore,
} from "@molis-ai/molis-work-plugin-form";
import {
  PPT_CLIENT_FACTORY_SCRIPT,
  PptPluginRouteTable,
  createPptRouteHandlers,
  openPptStore,
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

function saveFunctionSource(script: string): string {
  const start = script.indexOf("const save = async");
  const end = script.indexOf("const queueSave", start);
  assert.ok(start >= 0 && end > start, "找不到 save()");
  return script.slice(start, end);
}

function fillEditorSource(script: string): string {
  const start = script.indexOf("const fillEditor");
  const end = script.indexOf("const closeEditor", start);
  assert.ok(start >= 0 && end > start, "找不到 fillEditor()");
  return script.slice(start, end);
}

function emptyView(): MolisWorkWebView {
  return {
    snapshot: {
      board: {
        board_id: "board-creative-tools",
        title: "创作工具",
        active_goal_id: null,
        created_at: "2026-09-21T00:00:00.000Z",
        updated_at: "2026-09-21T00:00:00.000Z",
      },
      cursor: 0,
      goals: [],
      relations: [],
      impacts: [],
      risks: [],
      claims: [],
      runs: [],
      evidence: [],
      review_obligations: [],
      reviews: [],
      candidates: [],
      contract_proposals: [],
      rewires: [],
      clarification_sessions: [],
      clarification_turns: [],
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
    coverage: [],
    input_bindings: [],
    policy_bindings: [],
    events: [],
    feed: {
      sources: [],
      feed_items: [],
      inbox_entries: [],
      runs: [],
      contract_migrations: [],
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
  assert.deepEqual([...PERSONAL_PLUGIN_IDS], ["shelf", "lingguang", "functions", "pages", "form", "dataset", "ppt"]);
  for (const id of ["form", "dataset", "ppt"]) {
    assert.equal(PROJECT_SCOPED_PLUGIN_IDS.includes(id), false, `${id} 不该要项目添加`);
  }
  const rail = railEntries(["goals", ...PERSONAL_PLUGIN_IDS, "artifacts"]).map((entry) => entry.id);
  assert.deepEqual(
    rail.filter((id) => ["form", "dataset", "ppt"].includes(id)),
    ["form", "dataset", "ppt"],
  );
  const market = pluginMarketCards();
  assert.deepEqual(market.filter((card) => card.personal).map((card) => card.id), [...PERSONAL_PLUGIN_IDS]);
  assert.equal(market.find((card) => card.id === "form")?.copy, "建问卷，预览填写，看结果。");
});

test("工作台 HTML 挂上三个创作入口，确认与工具条不在 label 里", () => {
  const html = renderMolisWorkWeb(emptyView());
  assert.match(html, /data-plugin-id="form"/);
  assert.match(html, /data-plugin-id="dataset"/);
  assert.match(html, /data-plugin-id="ppt"/);
  assert.match(html, /data-form="workbench"/);
  assert.match(html, /data-dataset="workbench"/);
  assert.match(html, /data-ppt="workbench"/);
  assert.match(html, /data-project-id="project-creative-tools"/);
  assert.match(html, /data-form-confirm/);
  assert.match(html, /data-dataset-confirm/);
  assert.match(html, /data-ppt-confirm/);
  assert.match(html, /data-form-result-list/);
  assert.match(html, /class="mw-textarea"/);
  assert.match(html, /class="mw-select"/);
  assert.match(html, /还没有列。先加一列，或打开下面粘贴 CSV。/);
  assert.match(html, /data-dataset-filter-empty/);
  assert.match(html, /没有匹配的格子/);
  assert.match(html, /placeholder="可选"/);
  assert.match(html, /讲者备注/);
  assert.match(html, /class="form-prompt"/);
  assert.match(html, /class="dataset-prompt"/);
  assert.match(html, /粘贴 CSV 会覆盖当前表/);
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
  assert.match(renderMolisWorkWorkbenchStylesheet(), /creative-arrive/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /creative-pane/);
  assert.match(FORM_STYLES, /\[data-form-pane\]:not\(\[hidden\]\) \{ animation: creative-pane/);
  assert.doesNotMatch(FORM_STYLES, /\[data-form-pane\]:not\(\[hidden\]\) \{ animation: creative-arrive/);
  assert.ok(!Object.hasOwn(FORM_EN, "1 到 5"));
});

test("工作台客户端脚本在挂上三个创作插件后仍能解析", () => {
  const script = renderMolisWorkWorkbenchClientScript();
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /\["shelf","lingguang","functions","pages","form","dataset","ppt"\]/);
  assert.doesNotMatch(saveFunctionSource(FORM_CLIENT_FACTORY_SCRIPT), /fillEditor/);
  assert.doesNotMatch(saveFunctionSource(DATASET_CLIENT_FACTORY_SCRIPT), /fillEditor/);
  assert.doesNotMatch(saveFunctionSource(PPT_CLIENT_FACTORY_SCRIPT), /fillEditor/);
  assert.match(saveFunctionSource(FORM_CLIENT_FACTORY_SCRIPT), /seq !== saveSeq/);
  assert.match(saveFunctionSource(DATASET_CLIENT_FACTORY_SCRIPT), /seq !== saveSeq/);
  assert.match(saveFunctionSource(PPT_CLIENT_FACTORY_SCRIPT), /seq !== saveSeq/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /seq !== resultsSeq \|\| selected\?\.id !== id/);
  assert.match(fillEditorSource(FORM_CLIENT_FACTORY_SCRIPT), /clearTimeout\(saveTimer\)/);
  assert.match(fillEditorSource(DATASET_CLIENT_FACTORY_SCRIPT), /clearTimeout\(saveTimer\)/);
  assert.match(fillEditorSource(PPT_CLIENT_FACTORY_SCRIPT), /clearTimeout\(saveTimer\)/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /closest\("\[data-column-type\]"\)/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /data-question-move/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /mw-check/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /form-preview-rating/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /data-option-remove/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /data-form-result-list/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /还有必填题没填/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /载入中/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /ppt-card-notes/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /ppt-card-empty/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /feed-stage-entry directory-list-row/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /feed-stage-entry directory-list-row/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /feed-stage-entry directory-list-row/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /plugin-stage-kind/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /plugin-stage-kind/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /plugin-stage-kind/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /kindChip\("form"/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /kindChip\("dataset"/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /kindChip\("ppt"/);
  assert.doesNotMatch(FORM_CLIENT_FACTORY_SCRIPT, /mw-status--plain feed-entry-status/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /is-arriving/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /is-arriving/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /is-arriving/);
  assert.match(FORM_CLIENT_FACTORY_SCRIPT, /mw-status mw-status--" \+ \(published/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /ppt-slide-index/);
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /className = "feed-entry-status"/);
  assert.doesNotMatch(PPT_CLIENT_FACTORY_SCRIPT, /mw-status--quiet feed-entry-status/);
  assert.doesNotMatch(PPT_CLIENT_FACTORY_SCRIPT, /L\("草稿"\)/);
  assert.doesNotMatch(FORM_CLIENT_FACTORY_SCRIPT, /className = "form-row/);
  assert.doesNotMatch(DATASET_CLIENT_FACTORY_SCRIPT, /className = "dataset-row/);
  assert.doesNotMatch(PPT_CLIENT_FACTORY_SCRIPT, /className = "ppt-row/);
});

test("Dataset：删行丢掉，筛选藏着的行留下；工作台内联同一合并函数", () => {
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

  assert.ok(DATASET_CLIENT_FACTORY_SCRIPT.includes(mergeDatasetDraftRows.toString()));
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /mergeDatasetDraftRows\(selected\?\.rows \|\| \[\], rowsFromDom\(\), columns, renderedFilter\)/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /let renderedFilter = ""/);
  const changeStart = DATASET_CLIENT_FACTORY_SCRIPT.indexOf('addEventListener("change"');
  const changeEnd = DATASET_CLIENT_FACTORY_SCRIPT.indexOf("void loadList", changeStart);
  assert.ok(changeStart >= 0 && changeEnd > changeStart);
  const changeHandler = DATASET_CLIENT_FACTORY_SCRIPT.slice(changeStart, changeEnd);
  assert.match(changeHandler, /input\.type = type === "number"/);
  assert.doesNotMatch(changeHandler, /renderTable/);
  assert.match(DATASET_CLIENT_FACTORY_SCRIPT, /filter\(\(item\) => item\.id !== id\)/);
});

test("Forms：建题、预览提交、结果计数，重开还在；出题是本地 stub", async () => {
  await withHome(async (home) => {
    const store = openFormStore(home);
    const routes = new FormPluginRouteTable(createFormRouteHandlers(store));
    const created = await routes.handle({ method: "POST", pathname: "/api/form", query: projectQuery(), body: projectBody({ title: "周报" }) });
    const id = (created?.body as { form: { id: string; project_id: string } }).form.id;
    assert.equal((created?.body as { form: { project_id: string } }).form.project_id, PROJECT);
    await routes.handle({
      method: "POST",
      pathname: `/api/form/${id}`,
      query: projectQuery(),
      body: projectBody({
        questions: [{ id: "q1", type: "singleChoice", title: "用得最多的工具", required: true, order: 1, options: [{ id: "a", label: "编辑器" }, { id: "b", label: "终端" }] }],
      }),
    });
    const generated = await routes.handle({
      method: "POST",
      pathname: `/api/form/${id}/generate-questions`,
      query: projectQuery(),
      body: projectBody({ prompt: "你最常用的工具是什么" }),
    });
    const generatedForm = (generated?.body as { form: { questions: Array<{ title: string; type: string }> } }).form;
    assert.equal(generatedForm.questions.at(-1)?.title, "你最常用的工具是什么");
    assert.equal(generatedForm.questions.at(-1)?.type, "text");
    await routes.handle({ method: "POST", pathname: `/api/form/${id}/publish`, query: projectQuery(), body: projectBody() });
    await assert.rejects(
      () => routes.handle({
        method: "POST",
        pathname: `/api/form/${id}/submit`,
        query: projectQuery(),
        body: projectBody({ answers: {} }),
      }),
      (error: Error) => error.message.includes("请回答"),
    );
    await routes.handle({
      method: "POST",
      pathname: `/api/form/${id}/submit`,
      query: projectQuery(),
      body: projectBody({ answers: { q1: "编辑器" } }),
    });
    const results = await routes.handle({ method: "GET", pathname: `/api/form/${id}/results`, query: projectQuery(), body: {} });
    assert.equal((results?.body as { analysis: { submission_count: number } }).analysis.submission_count, 1);
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
    const routes = new DatasetPluginRouteTable(createDatasetRouteHandlers(store));
    const created = await routes.handle({ method: "POST", pathname: "/api/dataset", query: projectQuery(), body: projectBody({ title: "成绩" }) });
    const id = (created?.body as { dataset: { id: string } }).dataset.id;
    const imported = await routes.handle({
      method: "POST",
      pathname: `/api/dataset/${id}/import-csv`,
      query: projectQuery(),
      body: projectBody({ csv: "姓名,分数\n一骏,95\n小陈,88" }),
    });
    const table = (imported?.body as { dataset: { columns: Array<{ name: string; type: string }>; rows: unknown[] } }).dataset;
    assert.equal(table.columns.length, 2);
    assert.equal(table.rows.length, 2);
    assert.equal(table.columns[0]?.type, "text");
    assert.equal(table.columns[1]?.type, "number");
    const generated = await routes.handle({
      method: "POST",
      pathname: `/api/dataset/${id}/generate-column`,
      query: projectQuery(),
      body: projectBody({ prompt: "完成日期" }),
    });
    const withColumn = (generated?.body as { dataset: { columns: Array<{ name: string; type: string }> } }).dataset;
    assert.equal(withColumn.columns.at(-1)?.name, "完成日期");
    assert.equal(withColumn.columns.at(-1)?.type, "text");
    await routes.handle({
      method: "POST",
      pathname: `/api/dataset/${id}/versions`,
      query: projectQuery(),
      body: projectBody({ note: "导入后" }),
    });
    await routes.handle({
      method: "POST",
      pathname: `/api/dataset/${id}`,
      query: projectQuery(),
      body: projectBody({ rows: [] }),
    });
    const versions = await routes.handle({ method: "GET", pathname: `/api/dataset/${id}/versions`, query: projectQuery(), body: {} });
    const versionId = (versions?.body as { versions: Array<{ id: string }> }).versions[0]?.id ?? "";
    const rolled = await routes.handle({
      method: "POST",
      pathname: `/api/dataset/${id}/rollback`,
      query: projectQuery(),
      body: projectBody({ version_id: versionId }),
    });
    const restored = (rolled?.body as { dataset: { rows: unknown[] } }).dataset;
    assert.equal(restored.rows.length, 2);
    const exported = await routes.handle({ method: "GET", pathname: `/api/dataset/${id}/export`, query: projectQuery(), body: {} });
    const csv = (exported?.body as { csv: string }).csv;
    assert.match(csv, /姓名/);
    assert.match(csv, /一骏/);
    const parsed = parseCsv(csv);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parseCsv("日期\n2026-09-21\n2026-09-22").columns[0]?.type, "date");
    assert.equal(parseCsv("备注\n1\n待定").columns[0]?.type, "text");
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
    const routes = new PptPluginRouteTable(createPptRouteHandlers(store));
    const created = await routes.handle({ method: "POST", pathname: "/api/ppt", query: projectQuery(), body: projectBody({ title: "季度回顾" }) });
    const id = (created?.body as { presentation: { id: string; slides: Array<{ id: string }> } }).presentation.id;
    const updated = await routes.handle({
      method: "POST",
      pathname: `/api/ppt/${id}`,
      query: projectQuery(),
      body: projectBody({
        color_primary: "#5e6ad2",
        slides: [
          { id: "s1", title: "开场", bullets: ["这一季做了什么"], notes: "慢一点", order: 1 },
          { id: "s2", title: "下一步", bullets: ["把问卷接回来", "把表格接回来"], notes: "", order: 2 },
        ],
      }),
    });
    const deck = (updated?.body as { presentation: { title: string; slides: Array<{ title: string; bullets: string[] }>; color_primary: string } }).presentation;
    assert.equal(deck.slides.length, 2);
    assert.equal(deck.slides[1]?.title, "下一步");
    assert.deepEqual(deck.slides[0]?.bullets, ["这一季做了什么"]);
    assert.equal(deck.color_primary, "#5e6ad2");
    const exported = JSON.stringify(store.get(id));
    assert.match(exported, /开场/);
    assert.match(exported, /把表格接回来/);
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
    await assert.rejects(() => new FormPluginRouteTable(createFormRouteHandlers(forms)).handle({
      method: "GET",
      pathname: "/api/form",
      query: new URLSearchParams(),
      body: {},
    }));
    forms.close();
    datasets.close();
    ppts.close();
  });
});
