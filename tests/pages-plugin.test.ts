import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
  PAGES_CLIENT_FACTORY_SCRIPT,
  PAGES_PROJECT_PLUGIN_ID,
  PAGES_STYLES,
  PAGES_TEMPLATES,
  PagesPluginRouteTable,
  createPagesRouteHandlers,
  extractFromPagesBody,
  openPagesStore,
  pagesSchema,
  runPagesAi,
} from "@molis-ai/molis-work-plugin-pages";
import {
  renderMolisWorkWeb,
  renderMolisWorkWorkbenchClientScript,
  type MolisWorkWebView,
} from "./workbench-renderer-fixture.js";

const PROJECT = "project-pages";
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
        board_id: "board-pages",
        title: "文档",
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
    project: { project_id: PROJECT, display_name: "文档" },
    projects: [{ project_id: PROJECT, display_name: "文档" }],
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
  const home = await mkdtemp(join(tmpdir(), "pages-plugin-"));
  try {
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test("Pages 是个人插件，不进项目启用名单", () => {
  assert.equal(PERSONAL_PLUGIN_IDS.includes(PAGES_PROJECT_PLUGIN_ID), true);
  assert.equal(PROJECT_SCOPED_PLUGIN_IDS.includes("pages"), false);
  const rail = railEntries(["goals", ...PERSONAL_PLUGIN_IDS, "artifacts"]);
  const entry = rail.find((item) => item.id === "pages");
  assert.equal(entry?.label, "Pages");
  assert.equal(entry?.glyph, "note");
  const market = pluginMarketCards().find((card) => card.id === "pages");
  assert.equal(market?.personal, true);
  assert.equal(market?.copy, "写文档，用块和格式，保存在这台电脑。");
});

test("工作台 HTML 挂上 Pages 舞台和编辑器内核脚本", () => {
  const html = renderMolisWorkWeb(emptyView());
  assert.match(html, /data-plugin-id="pages"/);
  assert.match(html, /data-pages="workbench"/);
  assert.match(html, /data-pages-editor/);
  assert.match(html, /data-pages-confirm/);
  assert.match(html, /molis-work-pages-editor\.js/);
  const pages = html.slice(html.indexOf('data-pages="workbench"'), html.indexOf("data-pages-confirm"));
  assert.match(pages, /还没有文档/);
  assert.match(pages, /mw-empty__mark[\s\S]*#icon-note/);
  assert.match(html, /data-pages-title data-plain-field/);
  assert.match(html, /class="pages-search mw-input-group"/);
  assert.match(html, /class="mw-input"[^>]*data-pages-search/);
  assert.doesNotMatch(html, /tree-search pages-search/);
  assert.match(html, /data-pages-new-folder/);
  assert.match(html, /data-pages-move-menu/);
  assert.match(html, /data-pages-templates/);
  assert.match(html, /data-pages-template="meeting-notes"/);
  assert.match(html, /会议纪要/);
  assert.match(html, /data-pages-goal/);
  assert.match(html, /data-pages-promote/);
  assert.match(html, /data-pages-extract/);
  assert.match(html, /data-pages-more/);
  assert.match(html, /data-pages-create-more/);
  assert.match(html, /pages-template-mark/);
  assert.doesNotMatch(html, /select[^>]*data-pages-folder/);
  assert.match(html, /plugin-stage-list feed-stage-list feed-stage-tree" data-pages="directory"/);
  assert.match(html, /class="mw-btn mw-btn--ghost tree-create"[^>]*data-pages-new/);
  assert.doesNotMatch(html, /mw-btn--secondary"[^>]*data-pages-new/);
});

test("编辑器内核是 IIFE，不是 tsc 的 ESM", () => {
  const source = readFileSync(createRequire(import.meta.url).resolve("@molis-ai/molis-work-plugin-pages/editor"), "utf8");
  assert.match(source, /\bMolisWorkPagesEditor\b/);
  assert.match(source, /\bmount\b/);
  assert.match(source, /hoverHandlePlugin/);
  assert.match(source, /NodeSelection/);
  assert.match(source, /href="#icon-/);
  assert.doesNotMatch(source.slice(0, 80), /^import /);
});

test("阅读面没有粗左边线和后台表单顶栏", () => {
  assert.doesNotMatch(PAGES_STYLES, /border-left:\s*3px/);
  assert.doesNotMatch(PAGES_STYLES, /pages-search:focus-within/);
  assert.doesNotMatch(PAGES_STYLES, /tree-search\.pages-search/);
  assert.match(PAGES_STYLES, /pages-more-menu/);
  assert.match(PAGES_STYLES, /pages-block-menu/);
  assert.match(PAGES_STYLES, /ProseMirror-selectednode/);
  assert.match(PAGES_STYLES, /is-block-hover/);
  assert.match(PAGES_STYLES, /--content-select/);
  assert.match(PAGES_STYLES, /outline:\s*none !important/);
  assert.doesNotMatch(PAGES_STYLES, /pages-handle-tray/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /data-pages-more/);
});

test("工作台客户端保存不重挂内核", () => {
  const script = renderMolisWorkWorkbenchClientScript();
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /\["shelf","lingguang","functions","characters","pages","form","dataset","ppt"\]/);
  assert.doesNotMatch(saveFunctionSource(PAGES_CLIENT_FACTORY_SCRIPT), /fillEditor/);
  assert.doesNotMatch(saveFunctionSource(PAGES_CLIENT_FACTORY_SCRIPT), /setDoc/);
  assert.match(fillEditorSource(PAGES_CLIENT_FACTORY_SCRIPT), /clearTimeout\(saveTimer\)/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /feed-stage-entry directory-list-row/);
  assert.doesNotMatch(PAGES_CLIENT_FACTORY_SCRIPT, /plugin-stage-kind/);
  assert.doesNotMatch(PAGES_CLIENT_FACTORY_SCRIPT, /dataset\.kind = "page"/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /ICON\("star"\)/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /ICON\("note"\)/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /data-pages-move/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /data-pages-drop/);
  assert.doesNotMatch(PAGES_CLIENT_FACTORY_SCRIPT, /data-pages-folder[^\-]/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /data-pages-promote/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /runAi/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /dataset\.routePrefix/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /route\(withProject\(/);
  assert.doesNotMatch(PAGES_CLIENT_FACTORY_SCRIPT, /className = "pages-row"/);
  assert.doesNotMatch(PAGES_CLIENT_FACTORY_SCRIPT, /window\.prompt|window\.confirm/);
});

test("Pages：新建、改标题和正文、重开还在", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    const routes = new PagesPluginRouteTable(createPagesRouteHandlers(store));
    const created = await routes.handle({ method: "POST", pathname: "/api/pages", query: projectQuery(), body: projectBody({ title: "周记" }) });
    const document = (created?.body as { document: { id: string; project_id: string; title: string; body: { type: string } } }).document;
    assert.equal(document.project_id, PROJECT);
    assert.equal(document.title, "周记");
    assert.equal(document.body.type, "doc");
    const body = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", marks: [{ type: "strong" }], text: "加粗一段" }],
      }],
    };
    await routes.handle({
      method: "POST",
      pathname: `/api/pages/${document.id}`,
      query: projectQuery(),
      body: projectBody({ title: "周记 · 改过", body }),
    });
    store.close();

    const reopened = openPagesStore(home);
    const listed = reopened.list(PROJECT);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.title, "周记 · 改过");
    assert.equal(JSON.stringify(listed[0]?.body), JSON.stringify(body));
    reopened.close();
  });
});

test("文档按项目隔离，缺项目拒绝，跨项目找不到", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    const pageA = store.create({ project_id: PROJECT, title: "项目甲" });
    store.create({ project_id: OTHER, title: "项目乙" });
    assert.deepEqual(store.list(PROJECT).map((item) => item.title), ["项目甲"]);
    assert.deepEqual(store.list(OTHER).map((item) => item.title), ["项目乙"]);
    assert.throws(() => store.get(pageA.id, OTHER));
    await assert.rejects(() => new PagesPluginRouteTable(createPagesRouteHandlers(store)).handle({
      method: "GET",
      pathname: "/api/pages",
      query: new URLSearchParams(),
      body: {},
    }));
    store.close();
  });
});

test("文件夹删了之后文档回到未分类，收藏和模板会落库", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    const folder = store.createFolder({ project_id: PROJECT, title: "产品" });
    store.createFolder({ project_id: OTHER, title: "别的项目" });
    assert.deepEqual(store.listFolders(PROJECT).map((item) => item.title), ["产品"]);
    const created = store.create({
      project_id: PROJECT,
      folder_id: folder.id,
      template_id: "meeting-notes",
      starred: true,
    });
    assert.equal(created.folder_id, folder.id);
    assert.equal(created.starred, true);
    assert.equal(created.title, "会议纪要");
    assert.equal(created.body.content?.[0]?.type, "toc");
    store.deleteFolder(folder.id, PROJECT);
    const after = store.get(created.id, PROJECT);
    assert.equal(after.folder_id, "");
    assert.equal(after.starred, true);
    assert.throws(() => store.create({ project_id: PROJECT, template_id: "no-such" }));
    const templateIds = [
      "meeting-notes", "weekly-report", "project-plan", "prd", "sprint-retro",
      "user-interview", "okr", "postmortem", "tech-design", "competitor",
    ];
    const createdIds = templateIds.map((id) => store.create({ project_id: PROJECT, template_id: id }).id);
    store.close();
    const reopened = openPagesStore(home);
    for (const id of createdIds) {
      const page = reopened.get(id, PROJECT);
      pagesSchema.nodeFromJSON(page.body);
      assert.ok(page.title.length > 0);
    }
    reopened.close();
  });
});

test("WI3 块进 schema，十份模板都能被内核吃进去", () => {
  const sample = {
    type: "doc",
    content: [
      { type: "callout", attrs: { tone: "info" }, content: [{ type: "paragraph" }] },
      { type: "task_list", content: [{ type: "task_item", attrs: { checked: false }, content: [{ type: "paragraph" }] }] },
      { type: "code_block" },
      { type: "table", content: [{ type: "table_row", content: [{ type: "table_cell", content: [{ type: "paragraph" }] }] }] },
      { type: "toggle", attrs: { open: true }, content: [{ type: "paragraph" }] },
      { type: "horizontal_rule" },
      { type: "toc" },
    ],
  };
  assert.deepEqual(
    pagesSchema.nodeFromJSON(sample).content.content.map((node) => node.type.name),
    ["callout", "task_list", "code_block", "table", "toggle", "horizontal_rule", "toc"],
  );
  const kinds = ["callout", "task_list", "code_block", "table", "toggle", "horizontal_rule", "toc"];
  assert.equal(PAGES_TEMPLATES.length, 10);
  for (const template of PAGES_TEMPLATES) {
    pagesSchema.nodeFromJSON(template.body);
    const json = JSON.stringify(template.body);
    assert.ok(kinds.some((kind) => json.includes(`"type":"${kind}"`)), template.id);
  }
});

test("HTTP 能从模板新建、改收藏，搜和文件夹入口挂在工作台", async () => {
  await withHome(async (home) => {
    const store = openPagesStore(home);
    const routes = new PagesPluginRouteTable(createPagesRouteHandlers(store));
    const templates = await routes.handle({ method: "GET", pathname: "/api/pages/templates", query: projectQuery(), body: {} });
    assert.equal((templates?.body as { templates: Array<{ id: string }> }).templates.length, 10);
    const created = await routes.handle({
      method: "POST",
      pathname: "/api/pages",
      query: projectQuery(),
      body: projectBody({ template_id: "weekly-report" }),
    });
    const document = (created?.body as { document: { id: string; title: string; starred: boolean } }).document;
    assert.equal(document.title, "周报");
    const starred = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${document.id}`,
      query: projectQuery(),
      body: projectBody({ starred: true }),
    });
    assert.equal((starred?.body as { document: { starred: boolean } }).document.starred, true);
    const folder = await routes.handle({
      method: "POST",
      pathname: "/api/pages/folders",
      query: projectQuery(),
      body: projectBody({ title: "产品" }),
    });
    const folderId = (folder?.body as { folder: { id: string; title: string } }).folder.id;
    assert.equal((folder?.body as { folder: { title: string } }).folder.title, "产品");
    await routes.handle({
      method: "POST",
      pathname: `/api/pages/folders/${folderId}`,
      query: projectQuery(),
      body: projectBody({ title: "产品组" }),
    });
    const moved = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${document.id}`,
      query: projectQuery(),
      body: projectBody({ folder_id: folderId }),
    });
    assert.equal((moved?.body as { document: { folder_id: string } }).document.folder_id, folderId);
    await routes.handle({
      method: "POST",
      pathname: `/api/pages/folders/${folderId}/delete`,
      query: projectQuery(),
      body: projectBody(),
    });
    const listed = await routes.handle({ method: "GET", pathname: "/api/pages", query: projectQuery(), body: {} });
    const payload = listed?.body as { documents: Array<{ starred: boolean; folder_id: string }>; folders: unknown[] };
    assert.equal(payload.documents[0]?.starred, true);
    assert.equal(payload.documents[0]?.folder_id, "");
    assert.deepEqual(payload.folders, []);
    store.close();
  });
});

test("备注、评论、提及和卡能进 schema，抽取会写出任务卡和新文档", () => {
  const sample = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "comment", attrs: { id: "c1", text: "改口径" } }], text: "对外稿" },
          { type: "page_mention", attrs: { page_id: "p1", title: "会议纪要" } },
        ],
      },
      { type: "paragraph", attrs: { note: "别外发" } },
      { type: "page_ref", attrs: { page_id: "p1", title: "会议纪要" } },
      { type: "task_card", attrs: { title: "交稿", description: "", status: "todo", due: "2026-09-26" } },
      { type: "event_card", attrs: { title: "评审", at: "2026-09-26" } },
      { type: "calendar" },
    ],
  };
  assert.deepEqual(
    pagesSchema.nodeFromJSON(sample).content.content.map((node) => node.type.name),
    ["paragraph", "paragraph", "page_ref", "task_card", "event_card", "calendar"],
  );
  assert.equal(pagesSchema.nodeFromJSON(sample).content.child(0).child(0).marks[0]?.type.name, "comment");
  const extracted = extractFromPagesBody("周报", {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "完成" }] },
      { type: "paragraph", content: [{ type: "text", text: "把发布清单写清楚，并核对验收。" }] },
      { type: "task_list", content: [{ type: "task_item", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "周五交稿" }] }] }] },
    ],
  });
  assert.equal(extracted.cards, 1);
  assert.equal(extracted.knowledge.length, 1);
  assert.equal(extracted.knowledge[0]?.title.includes("完成"), true);
  assert.ok(JSON.stringify(extracted.body).includes("task_card"));
});

test("AI 无模型标明未接模型，Promote 经端口发出 Artifact，也能只挂 Goal", async () => {
  const stub = await runPagesAi({ command: "summarize", text: "第一句。第二句。" });
  assert.equal(stub.stub, true);
  assert.match(stub.text, /未接模型/);
  await withHome(async (home) => {
    const store = openPagesStore(home);
    const created = store.create({
      project_id: PROJECT,
      title: "周报",
      body: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "完成" }] },
          { type: "paragraph", content: [{ type: "text", text: "核对发布清单并写清验收。" }] },
          { type: "task_list", content: [{ type: "task_item", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "交稿" }] }] }] },
        ],
      },
    });
    const published: Array<{ page_id: string; version: number; goal_id: string }> = [];
    const routes = new PagesPluginRouteTable(createPagesRouteHandlers(store, {
      publishArtifact: (input) => {
        published.push({ page_id: input.page_id, version: input.version, goal_id: input.goal_id });
        return { artifact_id: "pages-" + input.page_id, version: input.version };
      },
    }));
    const linked = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${created.id}`,
      query: projectQuery(),
      body: projectBody({ goal_id: "GOAL-SHIP" }),
    });
    assert.equal((linked?.body as { document: { goal_id: string } }).document.goal_id, "GOAL-SHIP");
    const promoted = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${created.id}/promote`,
      query: projectQuery(),
      body: projectBody({ goal_id: "GOAL-SHIP" }),
    });
    const document = (promoted?.body as { document: { artifact_id: string; artifact_version: number } }).document;
    assert.equal(document.artifact_id, "pages-" + created.id);
    assert.equal(document.artifact_version, 1);
    assert.deepEqual(published[0], { page_id: created.id, version: 1, goal_id: "GOAL-SHIP" });
    const again = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${created.id}/promote`,
      query: projectQuery(),
      body: projectBody(),
    });
    assert.equal((again?.body as { document: { artifact_version: number } }).document.artifact_version, 2);
    const extracted = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${created.id}/extract`,
      query: projectQuery(),
      body: projectBody(),
    });
    const extractBody = extracted?.body as { cards: number; created: Array<{ title: string }> };
    assert.equal(extractBody.cards, 1);
    assert.equal(extractBody.created.length, 1);
    const extractedAgain = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${created.id}/extract`,
      query: projectQuery(),
      body: projectBody(),
    });
    assert.equal((extractedAgain?.body as { created: unknown[] }).created.length, 0);
    assert.equal(store.list(PROJECT).filter((item) => item.title.includes("完成")).length, 1);
    const ai = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${created.id}/ai`,
      query: projectQuery(),
      body: projectBody({ command: "outline", text: "先写目标再写范围" }),
    });
    assert.equal((ai?.body as { stub: boolean }).stub, true);
    store.close();
  });
  await withHome(async (home) => {
    const store = openPagesStore(home);
    const page = store.create({ project_id: PROJECT, title: "只挂" });
    const routes = new PagesPluginRouteTable(createPagesRouteHandlers(store));
    const missing = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${page.id}/promote`,
      query: projectQuery(),
      body: projectBody({ goal_id: "GOAL-ONLY" }),
    });
    assert.equal(missing?.status, 409);
    assert.equal(store.get(page.id, PROJECT).goal_id, "GOAL-ONLY");
    store.close();
  });
});
