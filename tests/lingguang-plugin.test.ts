import { pluginDocuments } from "./fixtures/plugin-documents.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  islandEntries, pluginMarketCards, railEntries,
} from "@molis-ai/molis-work-app-workbench";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import {
  LINGGUANG_CLIENT_FACTORY_SCRIPT,
  LINGGUANG_UI_CONTRIBUTION_ID,
  LINGGUANG_PROJECT_PLUGIN_ID,
  lingguangActions,
  lingguangManifest,
  openLingguangStore,
} from "@molis-ai/molis-work-plugin-lingguang";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  renderMolisWorkWeb,
  renderMolisWorkWorkbenchClientScript,
  type MolisWorkWebView,
} from "./workbench-renderer-fixture.js";

import { serveLingguang } from "./fixtures/lingguang-runtime.js";
import type { LingguangSpark } from "@molis-ai/molis-work-contracts/modules/lingguang";
import type { LingguangConversationState } from "@molis-ai/molis-work-plugin-lingguang";
import { PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS, builtinMarketDirectory } from "@molis-ai/molis-work-app-local-host";
import { withHostPluginFacts } from "./fixtures/host-plugin-facts.js";
const PROJECT = "project-lingguang";

test("PRR-10 material.read reports each extraction progress once", { timeout: 120_000 }, async t => {
  const f = await serveLingguang(t);
  const events: unknown[] = [];
  const caller = { ...f.caller, on_progress: (event: unknown) => { events.push(event); } };
  const bound = bindActionClient(f.client, () => caller);
  await bound.invoke(lingguangActions.readFile, { file_name: "note.md", data_base64: Buffer.from("# Note\n\n正文").toString("base64") });
  assert.ok(events.length > 0, "the extraction reports progress");
  const keys = events.map(event => JSON.stringify(event));
  assert.equal(new Set(keys).size, keys.length, `the same progress reached the caller twice: ${keys.join(" ")}`);
});

test("PRR-11 each Lingguang route has its own body limit", () => {
  const limits = Object.fromEntries((lingguangManifest.routes ?? []).map(route => [route.route_id, route.max_body_bytes]));
  assert.equal(limits["lingguang.material_read"], 36_000_000);
  for (const [route, bytes] of Object.entries(limits)) {
    if (bytes === undefined || route === "lingguang.material_read") continue;
    assert.ok(bytes <= 1_000_000, `${route} accepts ${bytes} bytes`);
  }
});

/** 灵光's page code is TypeScript in `src/browser/`; what it does is read in the sources, not in the minified bundle. */
const browserSource = (file: string) => readFileSync(fileURLToPath(new URL(`../plugins/native/lingguang/src/browser/${file}`, import.meta.url)), "utf8");

function saveFunctionSource(): string {
  const source = browserSource("editor.ts");
  const start = source.indexOf("page.save = async");
  const end = source.indexOf("page.queueSave", start);
  assert.ok(start >= 0 && end > start, "找不到 save()");
  return source.slice(start, end);
}

function emptyView(): MolisWorkWebView {
  return {
    snapshot: {
      board: {
        project_id: "board-lingguang",
        title: "灵光",
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
    project: { project_id: PROJECT, display_name: "灵光" },
    projects: [{ project_id: PROJECT, display_name: "灵光" }],
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

test("灵光是个人插件，不进项目启用名单，岛上叫灵光、图标用 idea", () => {
  assert.equal(PERSONAL_PLUGIN_IDS.includes(LINGGUANG_PROJECT_PLUGIN_ID), true);
  assert.equal(PROJECT_SCOPED_PLUGIN_IDS.includes("lingguang"), false);
  const enabled = ["goals", ...PERSONAL_PLUGIN_IDS, "artifacts"] as const;
  assert.equal(railEntries([...enabled]).some((item) => item.id === "lingguang"), false);
  const entry = islandEntries([...enabled]).find((item) => item.id === "lingguang");
  assert.equal(entry?.label, "灵光");
  assert.equal(entry?.glyph, "idea");
  const market = pluginMarketCards({}, builtinMarketDirectory()).find((card) => card.id === "lingguang");
  assert.equal(market?.personal, true);
  assert.equal(market?.copy, "先记下想法，再决定留下或丢掉。");
  parsePluginManifest(lingguangManifest);
  assert.ok(lingguangManifest.ui.views?.some(view => view.slot === "stage" && view.view_id === "workbench"));
});

test("PRR-12 the Manifest fallback only renders stages no host path already rendered, and only for shown plugins", () => {
  // A stage the host lists as already rendered (here Lingguang's own, standing in for the host's Coding panels) is kept once.
  const view = {
    ...emptyView(),
    enabled_plugins: ["goals", "lingguang", "issues"],
    plugin_stage_ids: [LINGGUANG_UI_CONTRIBUTION_ID],
    plugin_stages: ['<section data-work-surface="lingguang" data-stage="host"></section>'],
  } as MolisWorkWebView;
  const owner = renderMolisWorkWeb(withHostPluginFacts(view));
  const html = owner + pluginDocuments(owner).join("\n");
  assert.equal((html.match(/data-stage="host"/g) ?? []).length, 1, "the host's stage is kept once");
  assert.doesNotMatch(html, /data-lingguang="directory"/, "the fallback did not render a second Lingguang stage");
  assert.match(html, /data-issue-root/, "Issues, which needs no model, still comes from the Manifest stage");
  assert.match(pluginDocuments(renderMolisWorkWeb(withHostPluginFacts({ ...view, plugin_stage_ids: [], plugin_stages: [] } as MolisWorkWebView))).join("\n"), /data-lingguang="directory"/,
    "without the host's stage, Lingguang comes from its Manifest stage");

  const hiddenIssues = { ...view, enabled_plugins: ["goals", "lingguang"], hidden_plugins: ["issues"] } as MolisWorkWebView;
  assert.doesNotMatch(pluginDocuments(renderMolisWorkWeb(withHostPluginFacts(hiddenIssues))).join("\n"), /data-issue-root/, "a plugin the project does not show gets no fallback stage");
});

test("PRR-12 工作台挂上灵光空态、确认框和快记区，工作面由 Manifest 的 stage view 渲染", () => {
  const owner = renderMolisWorkWeb(withHostPluginFacts(emptyView()));
  const html = owner + pluginDocuments(owner).join("\n");
  assert.match(html, /data-plugin-id="lingguang"/);
  // Unified bottom bar: the plugin switcher (every entry of the project) at the left, the assistant in the middle, the
  // side panel's one button beside the project button (side-shelf §3.1). 灵光 is a tab of the side panel, right after Shelf,
  // the 常开插件, and still opens as a full stage from the switcher.
  const stack = html.slice(html.indexOf('class="workbench-bar"'), html.indexOf('id="goal-tree-pane"'));
  const stripAt = stack.indexOf("data-plugin-strip"), assistantAt = stack.indexOf("data-assistant-island");
  const sideAt = stack.indexOf("data-side-toggle"), projectAt = stack.indexOf("data-project-island");
  assert.ok(stripAt >= 0 && assistantAt > stripAt && sideAt > assistantAt && projectAt > sideAt, "底栏：插件切换在最左、助手居中、侧栏按钮紧贴项目圆钮");
  assert.doesNotMatch(stack, /data-bar-resident/);
  const tabs = [...stack.matchAll(/data-side-tab="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(tabs.slice(0, 6), ["plugin:shelf/side", "plugin:lingguang/side", "files", "browser", "computer", "discussion"], "侧栏的格按 order 排：Shelf（常开插件）、灵光、文件、浏览器、电脑、讨论，没写 order 的插件格排在后面");
  assert.match(stack.slice(stripAt, assistantAt), /data-plugin-id="lingguang"/, "插件切换列表是项目的全部入口，灵光也在其中");
  assert.match(stack, /data-assistant-island/);
  assert.doesNotMatch(stack, /data-assistant-toggle/, "助手是 Dock 里的一个容器，不再是浮窗开关");
  assert.match(stack, /data-assistant-composer/);
  assert.match(stack, /<input class="assistant-composer-input"/);
  assert.doesNotMatch(stack, /assistant-composer-toolbar/);
  assert.doesNotMatch(stack, /<textarea class="assistant-composer-input"/);
  assert.match(stack, /data-assistant-thread/);
  assert.match(stack, /data-assistant-target/, "输入框前说明下一次发送去哪项工作");
  assert.match(stack, /data-assistant-send/);
  assert.match(html, /data-lingguang="workbench"/);
  assert.match(html, /data-lingguang-confirm/);
  assert.match(html, /dialog class="mw-dialog/);
  assert.match(html, /还没有灵光/);
  assert.match(html, /data-lingguang-capture/);
  assert.match(html, /data-lingguang-brainstorm/);
  // The action says what it does: copy the text. No dialog pretends to hand it to Inbox, Goal or Functions.
  assert.match(html, /data-lingguang-dispatch>复制内容</);
  assert.doesNotMatch(html, /lingguang-dispatch-candidates/);
  assert.doesNotMatch(html, /window\.confirm/);
  const contents = pluginDocuments(owner).join("\n");
  const lingguang = contents.slice(contents.indexOf('data-lingguang="workbench"'), contents.indexOf("data-lingguang-confirm"));
  assert.match(lingguang, /plugin-stage-list feed-stage-list feed-stage-tree/);
  assert.match(lingguang, /tree-create/);
  assert.match(lingguang, /class="mw-empty"/);
  assert.match(lingguang, /mw-empty__mark[\s\S]*#icon-idea/);
  assert.doesNotMatch(lingguang, /lingguang-field/);
});

test("工作台客户端脚本挂上灵光后仍能解析，保存不重绘编辑器，确认不用 window.confirm", () => {
  const script = renderMolisWorkWorkbenchClientScript();
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /data-assistant-composer/);
  assert.doesNotMatch(saveFunctionSource(), /fillEditor/, "保存不重绘编辑器");
  assert.match(LINGGUANG_CLIENT_FACTORY_SCRIPT, /feed-stage-entry directory-list-row/);
  assert.doesNotMatch(LINGGUANG_CLIENT_FACTORY_SCRIPT, /window\.confirm/);
  assert.doesNotMatch(LINGGUANG_CLIENT_FACTORY_SCRIPT, /openai|anthropic|api\.openai/i);
  assert.match(browserSource("page.ts"), /showNote\(text: string/, "failures are said in the page's note");
  assert.match(browserSource("page.ts"), /dialog\.showModal\(\)/, "the confirmation is the page's own dialog, not a browser one");
});

test("RAC-31 RAC-32 快记、重开还在；项目隔离；丢掉后离开列表", async t => {
  const f = await serveLingguang(t), projectId = f.project.project_id;
  const spark = (await f.http<{ spark: LingguangSpark }>("", { title: "窗边的光", body: "下午三点，灰尘在亮里转。" })).spark;
  assert.deepEqual([spark.project_id, spark.source_kind, spark.status], [projectId, "manual", "inbox"]);
  const second = (await f.http<{ spark: LingguangSpark }>("", { body: "再丢一条没有标题的" })).spark;
  const third = (await f.http<{ spark: LingguangSpark }>("", { title: "要丢掉的", body: "确认后离开" })).spark;
  const listed = await f.http<{ sparks: LingguangSpark[] }>("");
  assert.deepEqual(new Set(listed.sparks.map(item => item.title)), new Set(["要丢掉的", "再丢一条没有标题的", "窗边的光"]));
  assert.equal((await f.request("?project_id=other")).status, 403);
  assert.equal((await f.request("", { project_id: "other", title: "Denied" })).status, 403);
  assert.equal((await f.http<{ sparks: LingguangSpark[] }>("")).sparks.length, 3, "identity comes from the Runtime instance");
  assert.deepEqual(await f.http("/discard", { ids: [third.id, second.id] }), { ok: true });
  await f.host.closeProject(f.project.reference);
  const kept = await f.http<{ sparks: LingguangSpark[] }>("");
  assert.equal(kept.sparks.length, 1);
  assert.equal(kept.sparks[0]?.body, "下午三点，灰尘在亮里转。");
  const reopened = openLingguangStore(f.home);
  try { assert.deepEqual(reopened.list(projectId), kept.sparks); assert.deepEqual(reopened.list("other"), []); } finally { reopened.close(); }
});

test("RAC-31 改正文会写入原库；头脑风暴使用注入模型并保存真实回复", async t => {
  const f = await serveLingguang(t, { completeText: async () => "可以先记录明天窗边光线的变化。" });
  const { spark } = await f.http<{ spark: LingguangSpark }>("", { title: "种子", body: "从这一句往下聊" });
  const updated = await f.http<{ spark: LingguangSpark }>(`/${spark.id}`, { title: "种子", body: "改过的正文", expected_updated_at: spark.updated_at });
  assert.equal(updated.spark.body, "改过的正文");
  const opened = await f.http<LingguangConversationState>("/conversations", { spark_ids: [spark.id] });
  assert.equal(opened.sparks[0]?.body, "改过的正文");
  const replied = await f.http<LingguangConversationState>(`/conversations/${opened.conversation.id}/messages`, { body: "明天试试" });
  assert.deepEqual(replied.messages.map(row => [row.role, row.body]), [["user", "明天试试"], ["assistant", "可以先记录明天窗边光线的变化。"]]);
  const reopened = openLingguangStore(f.home);
  try { assert.deepEqual(reopened.openConversation([spark.id], f.project.project_id).messages, replied.messages); } finally { reopened.close(); }
});
