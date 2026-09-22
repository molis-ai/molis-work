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
  convertedBlocks,
  createPagesRouteHandlers,
  deleteBlock,
  deleteRow,
  deleteSpan,
  dragRows,
  duplicateBlock,
  duplicateRow,
  duplicateEnclosingRow,
  duplicateSpan,
  exitWrappedBlock,
  extractFromPagesBody,
  indentListItem,
  leaveCodeDown,
  leaveCodeUp,
  linkAt,
  markdownBlock,
  markdownWrapMark,
  moveRow,
  moveSpan,
  nudgeSpan,
  openPagesStore,
  addTableColumn,
  addTableRow,
  atLastTableCell,
  deleteTableColumn,
  deleteTableRow,
  pasteMarkdown,
  previewDrop,
  previewSpan,
  spanRoots,
  outdentListItem,
  pagesSchema,
  replaceEnclosingRow,
  reorderTopLevel,
  runPagesAi,
  PAGES_CODE_LANGUAGES,
  PAGES_TONES,
  blockPlaceholder,
  calloutIconFor,
  safePagesCalloutIcon,
  safePagesCalloutTone,
  setCalloutStyle,
  safePagesHref,
  safePagesLanguage,
  safePagesTone,
  selectBlockThenAll,
  selectEnclosingBlock,
  setBlockTone,
  setLink,
  setTone,
  toneAt,
  turnBlockInto,
  turnRowInto,
  unwrapAtStart,
} from "@molis-ai/molis-work-plugin-pages";
import { highlightRanges } from "@molis-ai/molis-work-plugin-pages/code-highlight";
import { EditorState, NodeSelection, TextSelection, type Command } from "prosemirror-state";
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
  assert.match(source, /Decoration\.node/);
  assert.match(source, /is-block-hover/);
  assert.match(source, /pages-block-ghost/);
  assert.match(source, /pages-drop-line/);
  assert.match(source, /nudgeSpan/);
  assert.match(source, /Mod-Shift-ArrowUp/);
  assert.match(source, /leaveCodeDown/);
  assert.doesNotMatch(source, /pages-block-glow/);
  assert.doesNotMatch(source, /classList\.add\("is-block-hover"\)/);
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
  assert.match(PAGES_STYLES, /\.is-block-hover/);
  assert.match(PAGES_STYLES, /\.is-block-selected/);
  assert.match(PAGES_STYLES, /pages-block-ghost/);
  assert.match(PAGES_STYLES, /pages-drop-line/);
  assert.match(PAGES_STYLES, /--pages-gutter/);
  assert.doesNotMatch(PAGES_STYLES, /margin-left:\s*-44px/);
  assert.doesNotMatch(PAGES_STYLES, /pages-block-glow/);
  assert.match(PAGES_STYLES, /--content-select/);
  assert.match(PAGES_STYLES, /outline:\s*none !important/);
  assert.doesNotMatch(PAGES_STYLES, /pages-handle-tray/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /data-pages-more/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /dialog\[open\]/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /closeMore\(\);\s*moreButton\?\.focus\(\)/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /if \(moveMenu && !moveMenu\.hidden\)/);
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /if \(createMenu && !createMenu\.hidden\)/);
});

test("工作台客户端保存不重挂内核", () => {
  const script = renderMolisWorkWorkbenchClientScript();
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes(JSON.stringify(PERSONAL_PLUGIN_IDS)));
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

test("顶层块按落点重排，原地放下不变", () => {
  const para = (text: string) => pagesSchema.node("paragraph", null, [pagesSchema.text(text)]);
  const doc = pagesSchema.node("doc", null, [para("a"), para("b"), para("c")]);
  const toEnd = reorderTopLevel(doc, 0, 3);
  assert.equal(toEnd.child(0).textContent, "b");
  assert.equal(toEnd.child(1).textContent, "c");
  assert.equal(toEnd.child(2).textContent, "a");
  const toFront = reorderTopLevel(doc, 2, 0);
  assert.equal(toFront.child(0).textContent, "c");
  assert.equal(toFront.child(1).textContent, "a");
  assert.equal(toFront.child(2).textContent, "b");
  assert.equal(reorderTopLevel(doc, 1, 1), doc);
  assert.equal(reorderTopLevel(doc, 1, 2), doc);
});

test("拖拽右移嵌进上一个容器，左移再提出来", () => {
  const para = (value: string, marks: ReturnType<typeof pagesSchema.marks.strong.create>[] = []) => (
    pagesSchema.node("paragraph", null, value ? [pagesSchema.text(value, marks)] : [])
  );
  const item = (value: string, marks: ReturnType<typeof pagesSchema.marks.strong.create>[] = []) => (
    pagesSchema.node("list_item", null, [para(value, marks)])
  );
  const row = (doc: ReturnType<typeof pagesSchema.node>, text: string) => {
    const found = dragRows(doc).findLast((entry) => doc.nodeAt(entry.pos)?.textContent === text);
    assert.ok(found, text);
    return found;
  };

  const flat = pagesSchema.node("doc", null, [para("a"), para("b"), para("c")]);
  const b = row(flat, "b");
  const toEnd = previewDrop(flat, b.pos, dragRows(flat).length, 0);
  assert.equal(toEnd?.doc.child(2).textContent, "b");
  assert.equal(toEnd?.doc.child(1).textContent, "c");
  assert.equal(previewDrop(flat, b.pos, 1, 0), null);
  assert.equal(previewDrop(flat, b.pos, 2, 0), null);
  const flatState = pagesState(flat);
  assert.equal(run(flatState, moveRow(b.pos, 1, 0)).ok, false);

  const noted = pagesSchema.node("doc", null, [
    pagesSchema.node("callout", { tone: "warn" }, [para("内")]),
    para("外"),
  ]);
  const outer = row(noted, "外");
  const intoCallout = previewDrop(noted, outer.pos, dragRows(noted).findIndex((entry) => entry.pos === outer.pos), 5);
  assert.equal(intoCallout?.doc.childCount, 1);
  assert.equal(intoCallout?.doc.child(0).type.name, "callout");
  assert.equal(intoCallout?.doc.child(0).attrs.tone, "warn");
  assert.deepEqual(intoCallout?.doc.child(0).content.content.map((node) => node.textContent), ["内", "外"]);
  assert.equal(previewDrop(noted, dragRows(noted)[0].pos, 1, 1), null);

  const strong = pagesSchema.marks.strong.create();
  const listed = pagesSchema.node("doc", null, [
    pagesSchema.node("bullet_list", null, [item("甲"), item("乙")]),
    para("丙", [strong]),
  ]);
  const bing = row(listed, "丙");
  const sunk = previewDrop(listed, bing.pos, dragRows(listed).findIndex((entry) => entry.pos === bing.pos), 8);
  assert.equal(sunk?.doc.childCount, 1);
  const host = sunk?.doc.child(0);
  assert.equal(host?.child(1).childCount, 2);
  assert.equal(host?.child(1).child(1).type.name, "bullet_list");
  assert.equal(host?.child(1).child(1).textContent, "丙");
  assert.ok(host?.child(1).child(1).firstChild?.firstChild?.firstChild?.marks.some((mark) => mark.type === pagesSchema.marks.strong));

  const headed = pagesSchema.node("doc", null, [
    pagesSchema.node("bullet_list", null, [item("甲")]),
    pagesSchema.node("heading", { level: 2 }, [pagesSchema.text("题")]),
  ]);
  const title = row(headed, "题");
  const asItem = previewDrop(headed, title.pos, dragRows(headed).findIndex((entry) => entry.pos === title.pos), 1);
  assert.equal(asItem?.doc.child(0).childCount, 2);
  assert.equal(asItem?.doc.child(0).child(1).type.name, "list_item");
  assert.equal(asItem?.doc.child(0).child(1).textContent, "题");

  const lifted = pagesSchema.node("doc", null, [
    para("引"),
    pagesSchema.node("bullet_list", null, [item("甲"), item("乙")]),
  ]);
  const yi = row(lifted, "乙");
  const out = previewDrop(lifted, yi.pos, dragRows(lifted).length, 0);
  assert.deepEqual(out?.doc.content.content.map((node) => [node.type.name, node.textContent]), [
    ["paragraph", "引"],
    ["bullet_list", "甲"],
    ["paragraph", "乙"],
  ]);

  const tasks = pagesSchema.node("doc", null, [
    pagesSchema.node("task_list", null, [
      pagesSchema.node("task_item", { checked: true }, [para("已")]),
      pagesSchema.node("task_item", { checked: false }, [para("未")]),
    ]),
  ]);
  const pending = row(tasks, "未");
  const swapped = previewDrop(tasks, pending.pos, 0, dragRows(tasks)[0].indent);
  assert.deepEqual(swapped?.doc.child(0).content.content.map((node) => [node.attrs.checked, node.textContent]), [
    [false, "未"],
    [true, "已"],
  ]);

  const mixed = pagesSchema.node("doc", null, [
    pagesSchema.node("bullet_list", null, [item("甲")]),
    pagesSchema.node("code_block", null, [pagesSchema.text("x")]),
  ]);
  const code = dragRows(mixed).find((entry) => mixed.nodeAt(entry.pos)?.type.name === "code_block");
  assert.ok(code);
  const codeGap = dragRows(mixed).findIndex((entry) => entry.pos === code.pos);
  assert.equal(previewDrop(mixed, code.pos, codeGap, 1), null);
  const inside = previewDrop(mixed, code.pos, codeGap, 2);
  assert.equal(inside?.doc.childCount, 1);
  assert.equal(inside?.doc.child(0).child(0).lastChild?.type.name, "code_block");

  const boxed = pagesSchema.node("doc", null, [
    pagesSchema.node("callout", { tone: "info" }, [para("内")]),
    para("外"),
  ]);
  const inner = row(boxed, "内");
  const outerRow = row(boxed, "外");
  const left = previewDrop(boxed, inner.pos, dragRows(boxed).findIndex((entry) => entry.pos === outerRow.pos), 0);
  assert.equal(left?.doc.child(0).type.name, "callout");
  assert.equal(left?.doc.child(0).textContent, "");
  assert.equal(left?.doc.child(1).textContent, "内");
  assert.equal(left?.doc.child(2).textContent, "外");

  const single = pagesSchema.node("doc", null, [
    para("留"),
    pagesSchema.node("bullet_list", null, [item("走")]),
  ]);
  const leaving = row(single, "走");
  const removed = previewDrop(single, leaving.pos, 0, 0);
  assert.deepEqual(removed?.doc.content.content.map((node) => node.textContent), ["走", "留"]);
  assert.equal(removed?.doc.child(0).type.name, "paragraph");

  const listState = pagesState(pagesSchema.node("doc", null, [
    pagesSchema.node("bullet_list", null, [item("甲")]),
  ]));
  const only = dragRows(listState.doc)[0];
  const duplicated = run(listState, duplicateRow(only.pos));
  assert.equal(duplicated.state.doc.child(0).childCount, 2);
  const deleted = run(listState, deleteRow(only.pos));
  assert.equal(deleted.ok, true);
  assert.equal(deleted.state.doc.child(0).type.name, "paragraph");
  assert.equal(deleted.state.doc.child(0).content.size, 0);
});

test("多块选择一起移动、复制和删除，选中父块时不重复处理子块", () => {
  const para = (value: string) => pagesSchema.node("paragraph", null, [pagesSchema.text(value)]);
  const item = (value: string) => pagesSchema.node("list_item", null, [para(value)]);
  const at = (doc: ReturnType<typeof pagesSchema.node>, text: string) => {
    const found = dragRows(doc).findLast((entry) => doc.nodeAt(entry.pos)?.textContent === text);
    assert.ok(found, text);
    return found.pos;
  };

  const flat = pagesSchema.node("doc", null, [para("a"), para("b"), para("c")]);
  const moved = previewSpan(flat, at(flat, "b"), at(flat, "c"), 0, 0);
  assert.deepEqual(moved?.doc.content.content.map((node) => node.textContent), ["b", "c", "a"]);
  assert.equal(previewSpan(flat, at(flat, "b"), at(flat, "c"), 1, 0), null);
  assert.equal(run(pagesState(flat), moveSpan(at(flat, "b"), at(flat, "c"), 1, 0)).ok, false);

  const noted = pagesSchema.node("doc", null, [
    pagesSchema.node("callout", { tone: "info" }, [para("内")]),
    para("甲"),
    para("乙"),
  ]);
  const sunk = previewSpan(noted, at(noted, "甲"), at(noted, "乙"), dragRows(noted).findIndex((entry) => entry.pos === at(noted, "甲")), 5);
  assert.equal(sunk?.doc.childCount, 1);
  assert.deepEqual(sunk?.doc.child(0).content.content.map((node) => node.textContent), ["内", "甲", "乙"]);

  const copied = run(pagesState(flat), duplicateSpan(at(flat, "a"), at(flat, "b")));
  assert.deepEqual(copied.state.doc.content.content.map((node) => node.textContent), ["a", "b", "a", "b", "c"]);

  const removed = run(pagesState(flat), deleteSpan(at(flat, "a"), at(flat, "b")));
  assert.deepEqual(removed.state.doc.content.content.map((node) => node.textContent), ["c"]);
  const cleared = run(pagesState(flat), deleteSpan(at(flat, "a"), at(flat, "c")));
  assert.equal(cleared.state.doc.childCount, 1);
  assert.equal(cleared.state.doc.child(0).content.size, 0);

  const boxed = pagesSchema.node("doc", null, [
    pagesSchema.node("callout", { tone: "warn" }, [para("内")]),
    para("外"),
  ]);
  const roots = spanRoots(boxed, dragRows(boxed)[0].pos, at(boxed, "内"));
  assert.deepEqual(roots.map((row) => boxed.nodeAt(row.pos)?.type.name), ["callout"]);
  const once = run(pagesState(boxed), deleteSpan(dragRows(boxed)[0].pos, at(boxed, "内")));
  assert.deepEqual(once.state.doc.content.content.map((node) => node.textContent), ["外"]);

  const list = pagesSchema.node("doc", null, [
    pagesSchema.node("bullet_list", null, [item("甲"), item("乙")]),
  ]);
  const lifted = previewSpan(list, at(list, "甲"), at(list, "乙"), 0, 0);
  assert.deepEqual(lifted?.doc.content.content.map((node) => [node.type.name, node.textContent]), [
    ["paragraph", "甲"],
    ["paragraph", "乙"],
  ]);
});

test("上移下移在同级兄弟之间换位，到头就停，选区跟着走", () => {
  const para = (value: string) => pagesSchema.node("paragraph", null, [pagesSchema.text(value)]);
  const item = (value: string, checked = false) => pagesSchema.node("task_item", { checked }, [para(value)]);
  const at = (doc: ReturnType<typeof pagesSchema.node>, text: string) => {
    const found = dragRows(doc).findLast((entry) => doc.nodeAt(entry.pos)?.textContent === text);
    assert.ok(found, text);
    return found.pos;
  };
  const texts = (doc: ReturnType<typeof pagesSchema.node> | undefined) => doc?.content.content.map((node) => node.textContent);

  const flat = pagesSchema.node("doc", null, [para("a"), para("b"), para("c")]);
  const up = nudgeSpan(flat, at(flat, "b"), at(flat, "b"), -1);
  assert.deepEqual(texts(up?.doc), ["b", "a", "c"]);
  assert.equal(up?.doc.nodeAt(up.anchor)?.textContent, "b");
  const down = nudgeSpan(flat, at(flat, "b"), at(flat, "b"), 1);
  assert.deepEqual(texts(down?.doc), ["a", "c", "b"]);
  assert.equal(nudgeSpan(flat, at(flat, "a"), at(flat, "a"), -1), null);
  assert.equal(nudgeSpan(flat, at(flat, "c"), at(flat, "c"), 1), null);

  const pair = nudgeSpan(flat, at(flat, "a"), at(flat, "b"), 1);
  assert.deepEqual(texts(pair?.doc), ["c", "a", "b"]);
  assert.equal(pair?.doc.nodeAt(pair.anchor)?.textContent, "a");
  assert.equal(pair?.doc.nodeAt(pair.head)?.textContent, "b");

  const tasks = pagesSchema.node("doc", null, [
    pagesSchema.node("task_list", null, [item("已", true), item("未", false)]),
  ]);
  const swapped = nudgeSpan(tasks, at(tasks, "未"), at(tasks, "未"), -1);
  assert.deepEqual(swapped?.doc.child(0).content.content.map((node) => [node.attrs.checked, node.textContent]), [
    [false, "未"],
    [true, "已"],
  ]);
  assert.equal(nudgeSpan(tasks, at(tasks, "已"), at(tasks, "已"), -1), null);
});

test("敲 --- 或代码围栏会变成对应的块，代码块边缘的方向键能走出去", () => {
  const typed = (text: string) => {
    const doc = pagesSchema.node("doc", null, [
      pagesSchema.node("paragraph", null, [pagesSchema.text(text)]),
    ]);
    const state = EditorState.create({ schema: pagesSchema, doc });
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length)));
  };
  const applied = (text: string) => {
    const state = typed(text);
    const tr = markdownBlock(state, 1);
    assert.ok(tr, text);
    return state.apply(tr);
  };

  for (const marker of ["---", "***", "___"]) {
    const next = applied(marker);
    assert.equal(next.doc.child(0).type.name, "horizontal_rule");
    assert.equal(next.doc.child(1).type.name, "paragraph");
    assert.equal(next.doc.child(1).content.size, 0);
    assert.equal(next.selection.$from.parent.type.name, "paragraph");
  }

  const typescript = applied("```ts");
  assert.equal(typescript.doc.child(0).type.name, "code_block");
  assert.equal(typescript.doc.child(0).attrs.language, "typescript");
  assert.equal(typescript.selection.$from.parent.type.name, "code_block");
  assert.equal(applied("```nope").doc.child(0).attrs.language, "");
  assert.equal(markdownBlock(typed("hello"), 1), null);

  const item = pagesSchema.node("list_item", null, [
    pagesSchema.node("paragraph", null, [pagesSchema.text("---")]),
  ]);
  const listed = EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [pagesSchema.node("bullet_list", null, [item])]),
  });
  assert.equal(markdownBlock(listed, 3), null);

  const code = pagesSchema.node("code_block", { language: "" }, [pagesSchema.text("ab")]);
  const alone = EditorState.create({ schema: pagesSchema, doc: pagesSchema.node("doc", null, [code]) });
  const atEnd = alone.apply(alone.tr.setSelection(TextSelection.create(alone.doc, 3)));
  const stepped = run(atEnd, leaveCodeDown);
  assert.equal(stepped.ok, true);
  assert.equal(stepped.state.doc.child(1).type.name, "paragraph");
  assert.equal(stepped.state.selection.$from.parent.type.name, "paragraph");
  const mid = alone.apply(alone.tr.setSelection(TextSelection.create(alone.doc, 2)));
  assert.equal(run(mid, leaveCodeDown).ok, false);

  const followed = EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [code, pagesSchema.node("paragraph", null, [pagesSchema.text("后")])]),
  });
  const out = run(followed.apply(followed.tr.setSelection(TextSelection.create(followed.doc, 3))), leaveCodeDown);
  assert.equal(out.state.doc.childCount, 2);
  assert.equal(out.state.selection.$from.parent.textContent, "后");

  const lead = pagesSchema.node("paragraph", null, [pagesSchema.text("前")]);
  const before = EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [lead, code]),
  });
  const up = run(before.apply(before.tr.setSelection(TextSelection.create(before.doc, lead.nodeSize + 1))), leaveCodeUp);
  assert.equal(up.ok, true);
  assert.equal(up.state.doc.childCount, 2);
  assert.equal(up.state.selection.$from.parent.textContent, "前");
});

test("空行粘贴 Markdown 会变成块，普通多行和写到一半的段落保持原样", () => {
  const empty = () => EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [pagesSchema.node("paragraph")]),
  });
  const sample = [
    "# 标题",
    "",
    "- 甲",
    "- **乙**",
    "",
    "1. 第一",
    "",
    "[] 待办",
    "[x] 完成",
    "",
    "---",
    "",
    "```ts",
    "const n = 1",
    "```",
    "",
    "见 [文档](https://molis.ai/docs) 和 [坏](javascript:alert(1))",
  ].join("\n");
  const tr = pasteMarkdown(empty(), sample);
  assert.ok(tr);
  const next = empty().apply(tr);
  assert.deepEqual(next.doc.content.content.map((node) => node.type.name), [
    "heading", "bullet_list", "ordered_list", "task_list", "horizontal_rule", "code_block", "paragraph",
  ]);
  assert.equal(next.doc.child(0).attrs.level, 1);
  assert.equal(next.doc.child(0).textContent, "标题");
  assert.equal(next.doc.child(1).child(1).textContent, "乙");
  assert.ok(next.doc.child(1).child(1).firstChild?.firstChild?.marks.some((mark) => mark.type === pagesSchema.marks.strong));
  assert.deepEqual(
    next.doc.child(3).content.content.map((node) => [node.attrs.checked, node.textContent]),
    [[false, "待办"], [true, "完成"]],
  );
  assert.equal(next.doc.child(5).attrs.language, "typescript");
  assert.equal(next.doc.child(5).textContent, "const n = 1");
  let href = "";
  next.doc.child(6).forEach((node) => {
    const mark = node.marks.find((item) => item.type === pagesSchema.marks.link);
    if (mark) href = String(mark.attrs.href);
  });
  assert.equal(href, "https://molis.ai/docs");
  assert.match(next.doc.child(6).textContent, /javascript:alert/);

  assert.equal(pasteMarkdown(empty(), "hello\nworld"), null);
  const writing = EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("写到一半")])]),
  });
  assert.equal(pasteMarkdown(writing, "# 标题"), null);
  const item = pagesSchema.node("list_item", null, [pagesSchema.node("paragraph")]);
  const listed = EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [pagesSchema.node("bullet_list", null, [item])]),
  });
  assert.equal(pasteMarkdown(listed, "# 标题"), null);
});

test("空行粘贴 GFM 表格会变成表头加正文，分隔行不进格子", () => {
  const empty = () => EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [pagesSchema.node("paragraph")]),
  });
  const sample = ["| 甲 | 乙 |", "| --- | --- |", "| 1 | **2** |", "", "说明"].join("\n");
  const tr = pasteMarkdown(empty(), sample);
  assert.ok(tr);
  const doc = empty().apply(tr).doc;
  assert.deepEqual(doc.content.content.map((node) => node.type.name), ["table", "paragraph"]);
  const table = doc.child(0);
  assert.equal(table.childCount, 2);
  assert.equal(table.child(0).child(0).type.name, "table_header");
  assert.equal(table.child(0).textContent, "甲乙");
  assert.equal(table.child(1).child(0).type.name, "table_cell");
  assert.equal(table.child(1).child(0).textContent, "1");
  assert.equal(table.child(1).child(1).textContent, "2");
  assert.ok(table.child(1).child(1).firstChild?.firstChild?.marks.some((mark) => mark.type === pagesSchema.marks.strong));
  assert.equal(doc.child(1).textContent, "说明");
  assert.equal(pasteMarkdown(empty(), "| 只有一格 |"), null);
});

test("表格能加行加列，最后一格才算走到头，删到只剩一格时表格消失", () => {
  const cell = (value: string, header = false) => pagesSchema.node(header ? "table_header" : "table_cell", null, [
    pagesSchema.node("paragraph", null, value ? [pagesSchema.text(value)] : []),
  ]);
  const row = (...cells: ReturnType<typeof cell>[]) => pagesSchema.node("table_row", null, cells);
  const table = pagesSchema.node("table", null, [
    row(cell("甲", true), cell("乙", true)),
    row(cell("1"), cell("2")),
  ]);
  const base = EditorState.create({ schema: pagesSchema, doc: pagesSchema.node("doc", null, [table]) });
  const at = (doc: ReturnType<typeof pagesSchema.node>, text: string) => {
    let found = -1;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === text) found = pos;
    });
    assert.ok(found >= 0, text);
    return found;
  };
  const inCell = (state: EditorState, text: string) => (
    state.apply(state.tr.setSelection(TextSelection.create(state.doc, at(state.doc, text))))
  );
  const corner = inCell(base, "2");
  assert.equal(atLastTableCell(corner), true);
  assert.equal(atLastTableCell(inCell(base, "1")), false);

  const grown = corner.apply(addTableRow(corner)!);
  assert.equal(grown.doc.child(0).childCount, 3);
  const added = grown.doc.child(0).child(2);
  assert.equal(added.childCount, 2);
  assert.equal(added.child(0).type.name, "table_cell");
  assert.equal(added.child(0).textContent, "");
  assert.equal(grown.selection.$from.parent.type.name, "paragraph");

  const wider = inCell(base, "乙").apply(addTableColumn(inCell(base, "乙"))!);
  assert.equal(wider.doc.child(0).child(0).childCount, 3);
  assert.equal(wider.doc.child(0).child(0).child(2).type.name, "table_header");
  assert.equal(wider.doc.child(0).child(1).childCount, 3);
  assert.equal(wider.doc.child(0).child(1).child(2).type.name, "table_cell");

  const dropped = inCell(base, "1").apply(deleteTableRow(inCell(base, "1"))!);
  assert.equal(dropped.doc.child(0).childCount, 1);
  assert.equal(dropped.doc.child(0).textContent, "甲乙");
  const gone = dropped.apply(deleteTableRow(dropped)!);
  assert.equal(gone.doc.child(0).type.name, "paragraph");

  const narrowed = inCell(base, "乙").apply(deleteTableColumn(inCell(base, "乙"))!);
  assert.equal(narrowed.doc.child(0).child(0).childCount, 1);
  assert.equal(narrowed.doc.child(0).textContent, "甲1");
  const plain = EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [pagesSchema.node("paragraph")]),
  });
  assert.equal(addTableRow(plain), null);
  const onTable = base.apply(base.tr.setSelection(NodeSelection.create(base.doc, 0)));
  const trimmed = onTable.apply(deleteTableRow(onTable, 0)!);
  assert.equal(trimmed.doc.child(0).childCount, 1);
  assert.equal(trimmed.doc.child(0).textContent, "甲乙");
});

test("敲 > 空格变成引用，连续的引用行粘在同一块里", () => {
  const typed = (text: string) => {
    const doc = pagesSchema.node("doc", null, [
      pagesSchema.node("paragraph", null, [pagesSchema.text(text)]),
    ]);
    const state = EditorState.create({ schema: pagesSchema, doc });
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length)));
  };
  const quote = typed("> ");
  const tr = markdownBlock(quote, 1);
  assert.ok(tr);
  const next = quote.apply(tr);
  assert.equal(next.doc.child(0).type.name, "blockquote");
  assert.equal(next.doc.child(0).child(0).type.name, "paragraph");
  assert.equal(next.doc.child(0).child(0).content.size, 0);
  assert.equal(next.selection.$from.parent.type.name, "paragraph");

  const item = pagesSchema.node("list_item", null, [
    pagesSchema.node("paragraph", null, [pagesSchema.text("> ")]),
  ]);
  const listed = EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [pagesSchema.node("bullet_list", null, [item])]),
  });
  assert.equal(markdownBlock(listed, 3), null);

  const empty = EditorState.create({
    schema: pagesSchema,
    doc: pagesSchema.node("doc", null, [pagesSchema.node("paragraph")]),
  });
  const pasted = pasteMarkdown(empty, ["> 甲", "> **乙**", "", "普通"].join("\n"));
  assert.ok(pasted);
  const doc = empty.apply(pasted).doc;
  assert.equal(doc.child(0).type.name, "blockquote");
  assert.deepEqual(doc.child(0).content.content.map((node) => node.textContent), ["甲", "乙"]);
  assert.ok(doc.child(0).child(1).firstChild?.marks.some((mark) => mark.type === pagesSchema.marks.strong));
  assert.equal(doc.child(1).type.name, "paragraph");
  assert.equal(doc.child(1).textContent, "普通");

  const source = pagesSchema.node("paragraph", null, [pagesSchema.text("一句")]);
  const turned = convertedBlocks("blockquote", source);
  assert.equal(turned?.[0].type.name, "blockquote");
  assert.equal(turned?.[0].textContent, "一句");
  assert.equal(convertedBlocks("paragraph", turned![0])?.[0].textContent, "一句");

  const holder = pagesSchema.node("doc", null, [
    pagesSchema.node("blockquote", null, [pagesSchema.node("paragraph")]),
  ]);
  assert.equal(blockPlaceholder(holder.resolve(2)), "引用");
  const rendered = pagesSchema.nodes.blockquote.spec.toDOM?.(holder.child(0));
  assert.equal(Array.isArray(rendered) ? rendered[0] : "", "blockquote");
  assert.equal(Array.isArray(rendered) ? (rendered[1] as { class?: string }).class : "", "pages-quote");
});

test("空行回车和行首退格能离开引用、Callout，不拆掉折叠块的标题", () => {
  const para = (value: string) => pagesSchema.node("paragraph", null, value ? [pagesSchema.text(value)] : []);
  const caret = (doc: ReturnType<typeof pagesSchema.node>, pos: number) => (
    pagesState(doc).apply(pagesState(doc).tr.setSelection(TextSelection.create(doc, pos)))
  );

  const quote = pagesSchema.node("doc", null, [pagesSchema.node("blockquote", null, [para("甲")])]);
  const peeled = run(caret(quote, 2), unwrapAtStart);
  assert.equal(peeled.ok, true);
  assert.equal(peeled.state.doc.child(0).type.name, "paragraph");
  assert.equal(peeled.state.doc.child(0).textContent, "甲");

  const emptyQuote = pagesSchema.node("doc", null, [pagesSchema.node("blockquote", null, [para("")])]);
  const exited = run(caret(emptyQuote, 2), exitWrappedBlock);
  assert.equal(exited.ok, true);
  assert.equal(exited.state.doc.child(0).type.name, "paragraph");
  assert.equal(exited.state.doc.child(0).content.size, 0);

  const trailing = pagesSchema.node("doc", null, [
    pagesSchema.node("blockquote", null, [para("甲"), para("")]),
  ]);
  const out = run(caret(trailing, 2 + para("甲").nodeSize), exitWrappedBlock);
  assert.equal(out.ok, true);
  assert.equal(out.state.doc.child(0).type.name, "blockquote");
  assert.equal(out.state.doc.child(0).textContent, "甲");
  assert.equal(out.state.doc.child(1).type.name, "paragraph");

  const noted = pagesSchema.node("doc", null, [
    pagesSchema.node("callout", { tone: "info" }, [para("注意")]),
  ]);
  const callout = run(caret(noted, 2), unwrapAtStart);
  assert.equal(callout.state.doc.child(0).type.name, "paragraph");
  assert.equal(callout.state.doc.child(0).textContent, "注意");

  const folded = pagesSchema.node("doc", null, [
    pagesSchema.node("toggle", { open: true }, [para("标题"), para("里面")]),
  ]);
  assert.equal(run(caret(folded, 2), unwrapAtStart).ok, false);
  const onlySummary = pagesSchema.node("doc", null, [
    pagesSchema.node("toggle", { open: true }, [para("")]),
  ]);
  const opened = run(caret(onlySummary, 2), exitWrappedBlock);
  assert.equal(opened.ok, true);
  assert.equal(opened.state.doc.child(0).type.name, "paragraph");
});

test("斜杠换的是光标下这一行，列表里的其他项还在", () => {
  const para = (value: string) => pagesSchema.node("paragraph", null, value ? [pagesSchema.text(value)] : []);
  const item = (value: string) => pagesSchema.node("list_item", null, [para(value)]);
  const heading = pagesSchema.nodes.heading.create({ level: 2 });
  const list = pagesSchema.node("doc", null, [
    pagesSchema.node("bullet_list", null, [item("甲"), item("乙"), item("丙")]),
  ]);
  const inYi = pagesState(list).apply(pagesState(list).tr.setSelection(TextSelection.create(list, 2 + item("甲").nodeSize + 1)));
  assert.equal(inYi.selection.$from.parent.textContent, "乙");
  const replaced = replaceEnclosingRow(inYi, heading);
  assert.ok(replaced);
  const next = inYi.apply(replaced);
  assert.deepEqual(next.doc.content.content.map((node) => [node.type.name, node.textContent]), [
    ["bullet_list", "甲"],
    ["heading", ""],
    ["bullet_list", "丙"],
  ]);
  assert.equal(next.selection.$from.parent.type.name, "heading");

  const only = pagesSchema.node("doc", null, [pagesSchema.node("bullet_list", null, [item("乙")])]);
  const alone = pagesState(only).apply(pagesState(only).tr.setSelection(TextSelection.create(only, 3)));
  const one = alone.apply(replaceEnclosingRow(alone, heading)!);
  assert.equal(one.doc.childCount, 1);
  assert.equal(one.doc.child(0).type.name, "heading");

  const noted = pagesSchema.node("doc", null, [
    pagesSchema.node("callout", { tone: "info" }, [para("内"), para("外")]),
  ]);
  const inWai = pagesState(noted).apply(
    pagesState(noted).tr.setSelection(TextSelection.create(noted, 2 + para("内").nodeSize + 1)),
  );
  assert.equal(inWai.selection.$from.parent.textContent, "外");
  const callout = inWai.apply(replaceEnclosingRow(inWai, heading)!);
  assert.equal(callout.doc.childCount, 1);
  assert.equal(callout.doc.child(0).type.name, "callout");
  assert.equal(callout.doc.child(0).child(0).textContent, "内");
  assert.equal(callout.doc.child(0).child(1).type.name, "heading");
});

test("复制和转换也只动光标下这一行，列表项的文字会带过去", () => {
  const para = (value: string) => pagesSchema.node("paragraph", null, [pagesSchema.text(value)]);
  const item = (value: string) => pagesSchema.node("list_item", null, [para(value)]);
  const list = pagesSchema.node("doc", null, [
    pagesSchema.node("bullet_list", null, [item("甲"), item("乙")]),
  ]);
  const inYi = pagesState(list).apply(
    pagesState(list).tr.setSelection(TextSelection.create(list, 2 + item("甲").nodeSize + 1)),
  );
  const copied = inYi.apply(duplicateEnclosingRow(inYi)!);
  assert.equal(copied.doc.child(0).type.name, "bullet_list");
  assert.deepEqual(
    copied.doc.child(0).content.content.map((node) => node.textContent),
    ["甲", "乙", "乙"],
  );

  const turned = turnRowInto(inYi, "heading2");
  assert.ok(turned);
  const next = inYi.apply(turned);
  assert.deepEqual(next.doc.content.content.map((node) => [node.type.name, node.textContent]), [
    ["bullet_list", "甲"],
    ["heading", "乙"],
  ]);
  assert.equal(next.doc.child(1).attrs.level, 2);
});

test("打完 **甲**、*乙*、~~删~~、`码` 会变成对应的行内样式并去掉记号", () => {
  const wrap = (text: string, open: string, close: string, markName: "strong" | "em" | "code" | "strike") => {
    const doc = pagesSchema.node("doc", null, [
      pagesSchema.node("paragraph", null, [pagesSchema.text(text)]),
    ]);
    const state = EditorState.create({ schema: pagesSchema, doc });
    const tr = markdownWrapMark(state, 1, 1 + text.length, open, close, markName);
    assert.ok(tr, text);
    return state.apply(tr);
  };
  const bold = wrap("**甲**", "**", "**", "strong");
  assert.equal(bold.doc.textContent, "甲");
  assert.ok(bold.doc.child(0).firstChild?.marks.some((mark) => mark.type === pagesSchema.marks.strong));
  const em = wrap("*乙*", "*", "*", "em");
  assert.equal(em.doc.textContent, "乙");
  assert.ok(em.doc.child(0).firstChild?.marks.some((mark) => mark.type === pagesSchema.marks.em));
  const strike = wrap("~~删~~", "~~", "~~", "strike");
  assert.equal(strike.doc.textContent, "删");
  assert.ok(strike.doc.child(0).firstChild?.marks.some((mark) => mark.type === pagesSchema.marks.strike));
  const code = wrap("`码`", "`", "`", "code");
  assert.equal(code.doc.textContent, "码");
  assert.ok(code.doc.child(0).firstChild?.marks.some((mark) => mark.type === pagesSchema.marks.code));

  const doc = pagesSchema.node("doc", null, [
    pagesSchema.node("paragraph", null, [pagesSchema.text("**甲**")]),
  ]);
  const state = EditorState.create({ schema: pagesSchema, doc });
  assert.equal(markdownWrapMark(state, 1, 1 + "**甲**".length, "*", "*", "em"), null);

  const fenced = pagesSchema.node("doc", null, [
    pagesSchema.node("code_block", null, [pagesSchema.text("**甲**")]),
  ]);
  const inCode = EditorState.create({ schema: pagesSchema, doc: fenced });
  assert.equal(markdownWrapMark(inCode, 1, 1 + "**甲**".length, "**", "**", "strong"), null);
});

test("转换为：按行拆开与合并，正文和行内 mark 都带过去", () => {
  const strong = pagesSchema.marks.strong.create();
  const list = pagesSchema.node("bullet_list", null, [
    pagesSchema.node("list_item", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("一", [strong])])]),
    pagesSchema.node("list_item", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("二")])]),
  ]);

  const headings = convertedBlocks("heading2", list);
  assert.deepEqual(headings?.map((node) => [node.type.name, node.attrs.level, node.textContent]), [
    ["heading", 2, "一"],
    ["heading", 2, "二"],
  ]);
  assert.ok(headings?.[0].firstChild?.marks.some((mark) => mark.type === pagesSchema.marks.strong));

  const tasks = convertedBlocks("task_list", list);
  assert.equal(tasks?.length, 1);
  assert.equal(tasks?.[0].type.name, "task_list");
  assert.deepEqual(
    tasks?.[0].content.content.map((item) => [item.attrs.checked, item.textContent]),
    [[false, "一"], [false, "二"]],
  );

  const code = convertedBlocks("code_block", list);
  assert.equal(code?.[0].type.name, "code_block");
  assert.equal(code?.[0].textContent, "一二");
  assert.equal(code?.[0].firstChild?.marks.length, 0);

  const back = convertedBlocks("paragraph", pagesSchema.node("callout", { tone: "info" }, [
    pagesSchema.node("paragraph", null, [pagesSchema.text("提示")]),
  ]));
  assert.deepEqual(back?.map((node) => [node.type.name, node.textContent]), [["paragraph", "提示"]]);

  assert.equal(convertedBlocks("table", list), null);
  assert.equal(
    convertedBlocks("paragraph", pagesSchema.node("horizontal_rule"))?.[0].textContent,
    "",
  );
});

function pagesState(doc: ReturnType<typeof pagesSchema.node>): EditorState {
  return EditorState.create({ schema: pagesSchema, doc });
}

/** Run a command the way a keymap would and hand back the resulting state. */
function run(state: EditorState, command: Command): { ok: boolean; state: EditorState } {
  let next = state;
  const ok = command(state, (tr) => { next = state.apply(tr); });
  return { ok, state: next };
}

function blockNames(state: EditorState): string[] {
  return state.doc.content.content.map((node) => node.type.name);
}

test("块命令：复制插在原块之后，删除到最后一块退化成空段落", () => {
  const para = (text: string) => pagesSchema.node("paragraph", null, [pagesSchema.text(text)]);
  const three = pagesState(pagesSchema.node("doc", null, [para("a"), para("b"), para("c")]));

  const dup = run(three, duplicateBlock(1));
  assert.equal(dup.ok, true);
  assert.deepEqual(dup.state.doc.content.content.map((node) => node.textContent), ["a", "b", "b", "c"]);
  assert.equal(dup.state.selection.$from.node(1).textContent, "b");

  const gone = run(three, deleteBlock(1));
  assert.equal(gone.ok, true);
  assert.deepEqual(gone.state.doc.content.content.map((node) => node.textContent), ["a", "c"]);

  const only = pagesState(pagesSchema.node("doc", null, [para("唯一一块")]));
  const emptied = run(only, deleteBlock(0));
  assert.equal(emptied.ok, true);
  assert.equal(emptied.state.doc.childCount, 1);
  assert.equal(emptied.state.doc.child(0).type.name, "paragraph");
  assert.equal(emptied.state.doc.child(0).textContent, "");

  assert.equal(run(three, deleteBlock(9)).ok, false);
  assert.equal(run(three, duplicateBlock(-1)).ok, false);
});

test("块命令：转换为落到文档上，不认的块型不动文档", () => {
  const list = pagesSchema.node("bullet_list", null, [
    pagesSchema.node("list_item", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("甲")])]),
    pagesSchema.node("list_item", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("乙")])]),
  ]);
  const state = pagesState(pagesSchema.node("doc", null, [pagesSchema.node("paragraph"), list]));

  const headings = run(state, turnBlockInto(1, "heading3"));
  assert.equal(headings.ok, true);
  assert.deepEqual(blockNames(headings.state), ["paragraph", "heading", "heading"]);
  assert.deepEqual(headings.state.doc.content.content.map((node) => node.textContent), ["", "甲", "乙"]);
  assert.ok(headings.state.selection.$from.node(1).type === pagesSchema.nodes.heading);

  const untouched = run(state, turnBlockInto(1, "table"));
  assert.equal(untouched.ok, false);
  assert.deepEqual(blockNames(untouched.state), ["paragraph", "bullet_list"]);
});

test("行首 Backspace 先脱一层：标题回段落、列表项提出来", () => {
  const heading = pagesSchema.node("heading", { level: 2 }, [pagesSchema.text("小标题")]);
  const before = pagesSchema.node("paragraph", null, [pagesSchema.text("上一块")]);
  const doc = pagesSchema.node("doc", null, [before, heading]);
  const atStart = pagesState(doc).apply(
    pagesState(doc).tr.setSelection(TextSelection.create(doc, 1 + before.nodeSize)),
  );
  assert.equal(atStart.selection.$from.parent.type.name, "heading");
  assert.equal(atStart.selection.$from.parentOffset, 0);

  const peeled = run(atStart, unwrapAtStart);
  assert.equal(peeled.ok, true);
  assert.deepEqual(blockNames(peeled.state), ["paragraph", "paragraph"]);
  assert.equal(peeled.state.doc.child(1).textContent, "小标题");

  // Second press has nothing left to peel, so the default Backspace can merge.
  assert.equal(run(peeled.state, unwrapAtStart).ok, false);

  const listDoc = pagesSchema.node("doc", null, [pagesSchema.node("bullet_list", null, [
    pagesSchema.node("list_item", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("一项")])]),
  ])]);
  const inItem = pagesState(listDoc).apply(pagesState(listDoc).tr.setSelection(TextSelection.create(listDoc, 3)));
  assert.equal(inItem.selection.$from.parentOffset, 0);
  const lifted = run(inItem, unwrapAtStart);
  assert.equal(lifted.ok, true);
  assert.deepEqual(blockNames(lifted.state), ["paragraph"]);
  assert.equal(lifted.state.doc.child(0).textContent, "一项");

  const middle = pagesState(doc).apply(
    pagesState(doc).tr.setSelection(TextSelection.create(doc, 1 + before.nodeSize + 2)),
  );
  assert.equal(run(middle, unwrapAtStart).ok, false);
});

test("Esc 把光标提成整块选中，再按不重复选", () => {
  const doc = pagesSchema.node("doc", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("一段话")])]);
  const caret = pagesState(doc).apply(pagesState(doc).tr.setSelection(TextSelection.create(doc, 2)));
  const picked = run(caret, selectEnclosingBlock);
  assert.equal(picked.ok, true);
  assert.ok(picked.state.selection instanceof NodeSelection);
  assert.equal((picked.state.selection as NodeSelection).node.type.name, "paragraph");
  assert.equal(run(picked.state, selectEnclosingBlock).ok, false);
});

test("链接命令：加链、改链、移除，脏地址等于移除", () => {
  const doc = pagesSchema.node("doc", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("看这里")])]);
  const state = pagesState(doc);

  const added = run(state, setLink(1, 4, "molis.ai"));
  assert.equal(added.ok, true);
  assert.deepEqual(
    added.state.doc.child(0).firstChild?.marks.map((mark) => [mark.type.name, mark.attrs.href]),
    [["link", "https://molis.ai/"]],
  );

  const inLink = added.state.apply(added.state.tr.setSelection(TextSelection.create(added.state.doc, 2)));
  assert.deepEqual(linkAt(inLink.doc, inLink.selection), { from: 1, to: 4, href: "https://molis.ai/" });

  const changed = run(added.state, setLink(1, 4, "https://molis.ai/docs"));
  assert.equal(changed.state.doc.child(0).firstChild?.marks[0].attrs.href, "https://molis.ai/docs");

  const removed = run(added.state, setLink(1, 4, ""));
  assert.equal(removed.state.doc.child(0).firstChild?.marks.length, 0);

  const rejected = run(added.state, setLink(1, 4, "javascript:alert(1)"));
  assert.equal(rejected.state.doc.child(0).firstChild?.marks.length, 0);

  const plain = state.apply(state.tr.setSelection(TextSelection.create(doc, 2)));
  assert.equal(linkAt(plain.doc, plain.selection), null);
  assert.deepEqual(
    linkAt(state.doc, TextSelection.create(doc, 1, 3)),
    { from: 1, to: 3, href: "" },
  );
  assert.equal(run(state, setLink(2, 2, "https://molis.ai")).ok, false);
});

test("链接只收可导航地址，脚本伪协议被丢掉", () => {
  assert.equal(safePagesHref("https://molis.ai/a?b=1#c"), "https://molis.ai/a?b=1#c");
  assert.equal(safePagesHref("  molis.ai/docs "), "https://molis.ai/docs");
  assert.equal(safePagesHref("mailto:a@b.com"), "mailto:a@b.com");
  assert.equal(safePagesHref("/projects/p1"), "/projects/p1");
  assert.equal(safePagesHref("javascript:alert(1)"), "");
  assert.equal(safePagesHref("JaVaScRiPt:alert(1)"), "");
  assert.equal(safePagesHref("data:text/html,<script>"), "");
  assert.equal(safePagesHref("随便写点字"), "");
  assert.equal(safePagesHref(""), "");

  const mark = pagesSchema.marks.link.create({ href: "javascript:alert(1)" });
  assert.equal(pagesSchema.marks.link.spec.toDOM?.(mark, false)[0], "span");
  const safe = pagesSchema.marks.link.create({ href: "https://molis.ai" });
  const dom = pagesSchema.marks.link.spec.toDOM?.(safe, false) as [string, Record<string, string>];
  assert.equal(dom[0], "a");
  assert.equal(dom[1].href, "https://molis.ai/");
  assert.equal(dom[1].rel, "noreferrer noopener");
});

test("Tab 嵌套对待办列表同样生效，Shift-Tab 能原路退回", () => {
  const item = (type: "list_item" | "task_item", text: string) =>
    pagesSchema.node(type, type === "task_item" ? { checked: true } : null, [
      pagesSchema.node("paragraph", null, [pagesSchema.text(text)]),
    ]);
  const depths = (state: EditorState) => {
    const found: Array<[string, number]> = [];
    state.doc.descendants((node, _pos, _parent) => {
      if (node.type.name === "list_item" || node.type.name === "task_item") found.push([node.textContent, 0]);
    });
    return found.map(([text]) => text);
  };
  const nestedUnder = (state: EditorState, listType: string) => {
    let count = 0;
    state.doc.descendants((node) => { if (node.type.name === listType) count += 1; });
    return count;
  };

  for (const [listType, itemType] of [["task_list", "task_item"], ["bullet_list", "list_item"]] as const) {
    const doc = pagesSchema.node("doc", null, [
      pagesSchema.node(listType, null, [item(itemType, "一"), item(itemType, "二")]),
    ]);
    const state = pagesState(doc);
    // Caret inside the second item, the only place Tab may nest from.
    const inSecond = state.apply(state.tr.setSelection(TextSelection.create(doc, doc.content.size - 3)));
    assert.equal(inSecond.selection.$from.parent.textContent, "二", listType);

    const nested = run(inSecond, indentListItem);
    assert.equal(nested.ok, true, listType + " 应能嵌套");
    assert.equal(nestedUnder(nested.state, listType), 2, listType + " 嵌套后应有内层列表");
    assert.deepEqual(depths(nested.state), ["一二", "二"], listType);
    if (itemType === "task_item") {
      let checked: unknown;
      nested.state.doc.descendants((node) => {
        if (node.type.name === "task_item" && node.textContent === "二") checked = node.attrs.checked;
      });
      assert.equal(checked, true, "嵌套不该丢掉勾选状态");
    }

    const back = run(nested.state, outdentListItem);
    assert.equal(back.ok, true, listType + " 应能退回");
    assert.equal(nestedUnder(back.state, listType), 1, listType + " 退回后内层列表应消失");
    assert.deepEqual(back.state.doc.toJSON(), doc.toJSON(), listType + " 退回应回到原结构");
  }

  const plain = pagesState(pagesSchema.node("doc", null, [
    pagesSchema.node("paragraph", null, [pagesSchema.text("普通段落")]),
  ]));
  assert.equal(run(plain, indentListItem).ok, false, "段落不该被 Tab 缩进");
});

test("Callout 的图标和颜色各自独立，四个旧色调渲染不变", () => {
  // The four tones every existing document and template was written with.
  const legacy: Array<[string, string, string]> = [
    ["info", "cyan", "info"],
    ["warn", "orange", "alert"],
    ["success", "green", "check"],
    ["plain", "gray", "idea"],
  ];
  for (const [stored, hue, icon] of legacy) {
    assert.equal(safePagesCalloutTone(stored), hue, stored + " 应折到 " + hue);
    assert.equal(calloutIconFor("", stored), icon, stored + " 的默认图标不该变");
    const node = pagesSchema.node("callout", { tone: stored }, [pagesSchema.node("paragraph")]);
    const dom = pagesSchema.nodes.callout.spec.toDOM?.(node) as [string, Record<string, string>, unknown];
    assert.equal(dom[1]["data-pages-callout"], hue);
    assert.equal(dom[1]["data-pages-icon"], icon);
  }

  assert.equal(safePagesCalloutTone("purple"), "purple", "调色板里的九个色应直接可用");
  assert.equal(safePagesCalloutTone("chartreuse"), "cyan", "不认的色退回默认");
  assert.equal(safePagesCalloutIcon("star"), "star");
  assert.equal(safePagesCalloutIcon("skull"), "", "不在图标表里的一律作废");
  assert.equal(calloutIconFor("star", "warn"), "star", "选过图标后不再跟着色调走");
  assert.equal(calloutIconFor("skull", "warn"), "alert", "作废的图标回落到色调默认");

  const doc = pagesSchema.node("doc", null, [
    pagesSchema.node("callout", { tone: "info" }, [pagesSchema.node("paragraph", null, [pagesSchema.text("注意")])]),
  ]);
  const state = pagesState(doc);

  const recoloured = run(state, setCalloutStyle(0, { tone: "purple" }));
  assert.equal(recoloured.ok, true);
  assert.equal(recoloured.state.doc.child(0).attrs.tone, "purple");
  assert.equal(recoloured.state.doc.child(0).attrs.icon, "", "只改颜色不该把图标钉死");
  assert.equal(calloutIconFor(recoloured.state.doc.child(0).attrs.icon, "purple"), "info");
  assert.equal(recoloured.state.doc.child(0).textContent, "注意", "改样式不该动正文");

  const marked = run(recoloured.state, setCalloutStyle(0, { icon: "star" }));
  assert.equal(marked.state.doc.child(0).attrs.icon, "star");
  assert.equal(marked.state.doc.child(0).attrs.tone, "purple", "换图标不该改颜色");

  const reset = run(marked.state, setCalloutStyle(0, { icon: "" }));
  assert.equal(reset.state.doc.child(0).attrs.icon, "", "选回自动应清掉图标");

  const notCallout = pagesState(pagesSchema.node("doc", null, [pagesSchema.node("paragraph")]));
  assert.equal(run(notCallout, setCalloutStyle(0, { tone: "red" })).ok, false);
  assert.equal(run(state, setCalloutStyle(999, { tone: "red" })).ok, false);
});

test("代码语言只认注册过的语法，常见别名折过去", () => {
  assert.equal(safePagesLanguage("TypeScript"), "typescript");
  assert.equal(safePagesLanguage(" ts "), "typescript");
  assert.equal(safePagesLanguage("tsx"), "typescript");
  assert.equal(safePagesLanguage("html"), "xml");
  assert.equal(safePagesLanguage("sh"), "bash");
  assert.equal(safePagesLanguage(""), "");
  assert.equal(safePagesLanguage("brainfuck"), "", "没注册的语法应退回纯文本");
  assert.equal(safePagesLanguage("<script>"), "");
  assert.equal(safePagesLanguage(undefined), "");
  assert.deepEqual(
    PAGES_CODE_LANGUAGES.map((item) => item.id).filter((id) => id && !safePagesLanguage(id)),
    [],
    "菜单里列出的每个语言都得能解析",
  );

  const dirty = pagesSchema.node("code_block", { language: "'; DROP TABLE" }, [pagesSchema.text("x")]);
  const dom = pagesSchema.nodes.code_block.spec.toDOM?.(dirty) as [string, Record<string, string>, unknown];
  assert.equal(dom[1]["data-language"], "", "脏语言名不该写进 DOM 属性");
});

test("代码高亮给出的区间能对回原文，中文也不串位", () => {
  const code = "const answer = 42;";
  const ranges = highlightRanges(code, "javascript");
  const sliced = ranges.map((range) => [code.slice(range.from, range.to), range.className] as const);
  assert.ok(
    sliced.some(([text, cls]) => text === "const" && cls.includes("hljs-keyword")),
    "应把 const 标成关键字，实得 " + JSON.stringify(sliced),
  );
  assert.ok(sliced.some(([text, cls]) => text === "42" && cls.includes("hljs-number")), "应把 42 标成数字");
  for (const range of ranges) {
    assert.ok(range.from >= 0 && range.to <= code.length && range.from < range.to, "区间必须落在原文范围内");
  }

  // Offsets are UTF-16 units on both sides; a multibyte comment ahead of the token
  // is where a byte-based implementation would drift.
  const mixed = "// 说明：这是中文注释\nconst answer = 42;";
  const after = highlightRanges(mixed, "javascript");
  const keyword = after.find((range) => range.className.includes("hljs-keyword"));
  assert.ok(keyword, "中文注释之后仍应识别出关键字");
  assert.equal(mixed.slice(keyword.from, keyword.to), "const", "中文之后的区间不能串位");
  const comment = after.find((range) => range.className.includes("hljs-comment"));
  assert.equal(mixed.slice(comment.from, comment.to), "// 说明：这是中文注释");

  assert.deepEqual(highlightRanges(code, "brainfuck"), [], "没注册的语法不高亮");
  assert.deepEqual(highlightRanges(code, ""), [], "纯文本不高亮");
  assert.deepEqual(highlightRanges("", "javascript"), []);
});

test("占位按块型和它的容器给词，写了字就不再提示", () => {
  const empty = (type: string, attrs?: Record<string, unknown>) => pagesSchema.node(type, attrs ?? null);
  const wrap = (holder: string, inner = empty("paragraph"), attrs?: Record<string, unknown>) =>
    pagesSchema.node(holder, attrs ?? null, [inner]);

  const cases: Array<[string, ReturnType<typeof pagesSchema.node>, string]> = [
    ["顶层空段落", empty("paragraph"), "输入 / 插入块，或直接写"],
    ["空 H1", empty("heading", { level: 1 }), "标题 1"],
    ["空 H3", empty("heading", { level: 3 }), "标题 3"],
    ["列表项", pagesSchema.node("bullet_list", null, [wrap("list_item")]), "列表项"],
    ["待办项", pagesSchema.node("task_list", null, [wrap("task_item", empty("paragraph"), { checked: false })]), "待办事项"],
    ["Callout", wrap("callout", empty("paragraph"), { tone: "info" }), "想强调的话"],
    ["Toggle", wrap("toggle", empty("paragraph"), { open: true }), "折叠起来的内容"],
  ];

  for (const [name, block, expected] of cases) {
    const state = pagesState(pagesSchema.node("doc", null, [block]));
    // Land the caret in the first text position, which is where a typing user sits.
    const caret = TextSelection.near(state.doc.resolve(1));
    assert.equal(blockPlaceholder(caret.$from), expected, name);
  }

  const written = pagesState(pagesSchema.node("doc", null, [
    pagesSchema.node("paragraph", null, [pagesSchema.text("已经写了字")]),
  ]));
  assert.equal(blockPlaceholder(written.doc.resolve(1)), "", "有内容的块不该出现占位");

  const cell = pagesState(pagesSchema.node("doc", null, [
    pagesSchema.node("table", null, [
      pagesSchema.node("table_row", null, [
        pagesSchema.node("table_header", null, [empty("paragraph")]),
        pagesSchema.node("table_cell", null, [empty("paragraph")]),
      ]),
    ]),
  ]));
  assert.equal(blockPlaceholder(TextSelection.near(cell.doc.resolve(1)).$from), "", "表格单元格不给占位");
});

test("Mod-A 先圈住当前块，再按才铺到整篇", () => {
  const para = (text: string) => pagesSchema.node("paragraph", null, [pagesSchema.text(text)]);
  const doc = pagesSchema.node("doc", null, [para("第一段"), para("第二段")]);
  const state = pagesState(doc);
  const caret = state.apply(state.tr.setSelection(TextSelection.create(doc, 7)));

  const block = run(caret, selectBlockThenAll);
  assert.equal(block.ok, true);
  assert.equal(block.state.doc.textBetween(block.state.selection.from, block.state.selection.to), "第二段");

  const whole = run(block.state, selectBlockThenAll);
  assert.equal(whole.state.selection.from, 0);
  assert.equal(whole.state.selection.to, doc.content.size);

  const blank = pagesState(pagesSchema.node("doc", null, [pagesSchema.node("paragraph")]));
  assert.equal(run(blank, selectBlockThenAll).state.selection.to, blank.doc.content.size);
});

test("文字颜色与背景色：同色再点是取消，换色是替换，选区混色读作无色", () => {
  const doc = pagesSchema.node("doc", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("彩色文字")])]);
  const base = pagesState(doc);
  const pick = (state: EditorState, from: number, to: number) =>
    state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
  const marksOn = (state: EditorState) =>
    state.doc.child(0).content.content.map((node) => node.marks.map((mark) => [mark.type.name, mark.attrs.tone]));

  const inked = run(pick(base, 1, 3), setTone("font_color", "red"));
  assert.equal(inked.ok, true);
  assert.deepEqual(marksOn(inked.state), [[["font_color", "red"]], []]);
  assert.equal(toneAt(inked.state, "font_color"), "red");

  const swapped = run(inked.state, setTone("font_color", "blue"));
  assert.deepEqual(marksOn(swapped.state), [[["font_color", "blue"]], []]);

  const cleared = run(inked.state, setTone("font_color", "red"));
  assert.deepEqual(marksOn(cleared.state), [[]]);

  const washed = run(pick(inked.state, 1, 3), setTone("highlight", "yellow"));
  assert.deepEqual(
    washed.state.doc.child(0).firstChild?.marks.map((mark) => mark.type.name).sort(),
    ["font_color", "highlight"],
  );

  assert.equal(toneAt(pick(inked.state, 1, 5), "font_color"), "");
  assert.equal(toneAt(base, "font_color"), "");

  const ignored = run(pick(base, 1, 3), setTone("font_color", "chartreuse"));
  assert.deepEqual(marksOn(ignored.state), [[]]);

  const caret = run(base.apply(base.tr.setSelection(TextSelection.create(doc, 2))), setTone("font_color", "green"));
  assert.equal(caret.state.storedMarks?.[0]?.attrs.tone, "green");
  assert.equal(toneAt(caret.state, "font_color"), "green");
});

test("块菜单上色铺满整块，代码块不接 mark 也不会炸", () => {
  const doc = pagesSchema.node("doc", null, [
    pagesSchema.node("bullet_list", null, [
      pagesSchema.node("list_item", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("第一项")])]),
      pagesSchema.node("list_item", null, [pagesSchema.node("paragraph", null, [pagesSchema.text("第二项")])]),
    ]),
    pagesSchema.node("code_block", null, [pagesSchema.text("const a = 1")]),
  ]);
  const state = pagesState(doc);

  const painted = run(state, setBlockTone(0, "highlight", "yellow"));
  assert.equal(painted.ok, true);
  const tones: string[] = [];
  painted.state.doc.child(0).descendants((node) => {
    if (node.isText) tones.push(String(node.marks.find((mark) => mark.type.name === "highlight")?.attrs.tone ?? ""));
  });
  assert.deepEqual(tones, ["yellow", "yellow"], "整块每一行都应上色");

  const cleared = run(painted.state, setBlockTone(0, "highlight", ""));
  assert.deepEqual(cleared.state.doc.child(0).toJSON(), doc.child(0).toJSON(), "选默认应还原");

  const code = run(state, setBlockTone(1, "font_color", "red"));
  assert.equal(code.ok, true);
  assert.deepEqual(code.state.doc.child(1).toJSON(), doc.child(1).toJSON(), "代码块不收行内 mark，应原样不动");

  assert.equal(run(state, setBlockTone(9, "font_color", "red")).ok, false);
});

test("色调只认设计系统色板，未知色不会写进 DOM", () => {
  assert.equal(safePagesTone(" RED "), "red");
  assert.equal(safePagesTone("chartreuse"), "");
  assert.equal(safePagesTone("var(--ink); background:url(x)"), "");
  assert.equal(safePagesTone(undefined), "");
  assert.deepEqual(PAGES_TONES.map((tone) => tone.id).filter((id) => !safePagesTone(id)), []);

  const ink = pagesSchema.marks.font_color.create({ tone: "green" });
  assert.deepEqual(
    pagesSchema.marks.font_color.spec.toDOM?.(ink, false),
    ["span", { class: "pages-ink", "data-pages-ink": "green" }, 0],
  );
  const bogus = pagesSchema.marks.highlight.create({ tone: "javascript:alert(1)" });
  assert.deepEqual(pagesSchema.marks.highlight.spec.toDOM?.(bogus, false), ["span", {}, 0]);
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
    assert.notEqual(store.get(page.id, PROJECT).goal_id, "GOAL-ONLY");
    store.close();
  });
});
