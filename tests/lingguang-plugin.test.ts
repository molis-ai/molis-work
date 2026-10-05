import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PERSONAL_PLUGIN_IDS,
  PROJECT_SCOPED_PLUGIN_IDS,
  islandEntries,
  pluginMarketCards,
  railEntries,
} from "@molis-ai/molis-work-app-workbench";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  LINGGUANG_CLIENT_FACTORY_SCRIPT,
  LINGGUANG_PROJECT_PLUGIN_ID,
  LingguangPluginRouteTable,
  createLingguangRouteHandlers,
  lingguangManifest,
  openLingguangStore,
} from "@molis-ai/molis-work-plugin-lingguang";
import {
  renderMolisWorkWeb,
  renderMolisWorkWorkbenchClientScript,
  type MolisWorkWebView,
} from "./workbench-renderer-fixture.js";

import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";

const PROJECT = "project-lingguang";
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

function emptyView(): MolisWorkWebView {
  return {
    snapshot: {
      board: {
        board_id: "board-lingguang",
        title: "灵光",
        active_goal_id: null,
        created_at: "2026-09-21T00:00:00.000Z",
        updated_at: "2026-09-21T00:00:00.000Z",
      },
      cursor: 0,
      goals: [],
      relations: [],
      risks: [],
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

async function withHome<T>(run: (home: string, host: MolisWorkLocalHost) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "lingguang-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async () => "可以先记录明天窗边光线的变化。" });
  try {
    return await run(home, host);
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
}

test("灵光是个人插件，不进项目启用名单，岛上叫灵光、图标用 idea", () => {
  assert.equal(PERSONAL_PLUGIN_IDS.includes(LINGGUANG_PROJECT_PLUGIN_ID), true);
  assert.equal(PROJECT_SCOPED_PLUGIN_IDS.includes("lingguang"), false);
  const enabled = ["goals", ...PERSONAL_PLUGIN_IDS, "artifacts"] as const;
  assert.equal(railEntries([...enabled]).some((item) => item.id === "lingguang"), false);
  const entry = islandEntries([...enabled]).find((item) => item.id === "lingguang");
  assert.equal(entry?.label, "灵光");
  assert.equal(entry?.glyph, "idea");
  const market = pluginMarketCards().find((card) => card.id === "lingguang");
  assert.equal(market?.personal, true);
  assert.equal(market?.copy, "先记下想法，再决定留下或丢掉。");
  parsePluginManifest(lingguangManifest);
  assert.equal(lingguangManifest.ui.views?.[0]?.slot, "island");
  assert.equal(lingguangManifest.mcp_exports, undefined);
});

test("工作台挂上灵光空态、确认框和快记区", () => {
  const html = renderMolisWorkWeb(emptyView());
  assert.match(html, /data-plugin-id="lingguang"/);
  // Unified bottom bar: the plugin switcher (every entry of the project) at the left, the assistant in the middle,
  // Shelf and 灵光 as resident buttons right beside the project button. 灵光 itself still opens as a full stage.
  const stack = html.slice(html.indexOf('class="workbench-bar"'), html.indexOf('id="goal-tree-pane"'));
  const stripAt = stack.indexOf("data-plugin-strip"), assistantAt = stack.indexOf("data-assistant-island");
  const residentAt = stack.indexOf('data-bar-resident="lingguang"'), projectAt = stack.indexOf("data-project-island");
  assert.ok(stripAt >= 0 && assistantAt > stripAt && residentAt > assistantAt && projectAt > residentAt, "底栏：插件切换在最左、助手居中、灵光常驻按钮紧贴项目圆钮");
  assert.match(stack.slice(residentAt - 200, projectAt), /data-bar-resident="shelf"[\s\S]*data-bar-resident="lingguang"[\s\S]*data-dock-toggle="im"/);
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
  const lingguang = html.slice(html.indexOf('data-lingguang="workbench"'), html.indexOf("data-lingguang-confirm"));
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
  assert.doesNotMatch(saveFunctionSource(LINGGUANG_CLIENT_FACTORY_SCRIPT), /fillEditor/);
  assert.match(LINGGUANG_CLIENT_FACTORY_SCRIPT, /feed-stage-entry directory-list-row/);
  assert.doesNotMatch(LINGGUANG_CLIENT_FACTORY_SCRIPT, /window\.confirm/);
  assert.doesNotMatch(LINGGUANG_CLIENT_FACTORY_SCRIPT, /openai|anthropic|api\.openai/i);
  assert.match(LINGGUANG_CLIENT_FACTORY_SCRIPT, /showNote/);
  assert.match(LINGGUANG_CLIENT_FACTORY_SCRIPT, /showModal/);
});

test("快记、重开还在；项目隔离；丢掉后离开列表", async () => {
  await withHome(async (home, host) => {
    const store = openLingguangStore(home);
    const routes = new LingguangPluginRouteTable(createLingguangRouteHandlers({ projectId: PROJECT, actions: bindActionClient(host.actionClient(
      molisWorkHostProjectReference({ projectId: PROJECT, boardId: PROJECT, databasePath: join(home, "project.sqlite") })),
      () => ({ actor_id: "test", project_id: PROJECT, audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS })) }));
    const created = await routes.handle({
      method: "POST",
      pathname: "/api/lingguang",
      query: projectQuery(),
      body: projectBody({ title: "窗边的光", body: "下午三点，灰尘在亮里转。" }),
    });
    const spark = (created?.body as { spark: { id: string; project_id: string; title: string; source_kind: string; status: string } }).spark;
    assert.equal(spark.project_id, PROJECT);
    assert.equal(spark.source_kind, "manual");
    assert.equal(spark.status, "inbox");
    const second = await routes.handle({
      method: "POST",
      pathname: "/api/lingguang",
      query: projectQuery(),
      body: projectBody({ body: "再丢一条没有标题的" }),
    });
    const third = await routes.handle({
      method: "POST",
      pathname: "/api/lingguang",
      query: projectQuery(),
      body: projectBody({ title: "要丢掉的", body: "确认后离开" }),
    });
    const listed = await routes.handle({ method: "GET", pathname: "/api/lingguang", query: projectQuery(), body: {} });
    const titles = ((listed?.body as { sparks: Array<{ title: string }> }).sparks).map((item) => item.title);
    assert.equal(titles.length, 3);
    assert.deepEqual(new Set(titles), new Set(["要丢掉的", "再丢一条没有标题的", "窗边的光"]));
    await assert.rejects(() => routes.handle({ method: "GET", pathname: "/api/lingguang",
      query: new URLSearchParams({ project_id: OTHER }), body: {} }), { code: "actions.scope_mismatch" });
    // The bound caller supplies project identity; no untrusted query is required.
    assert.equal(((await routes.handle({ method: "GET", pathname: "/api/lingguang", query: new URLSearchParams(), body: {} }))!.body as { sparks: unknown[] }).sparks.length, 3);
    const discardId = (third?.body as { spark: { id: string } }).spark.id;
    const discarded = await routes.handle({
      method: "POST",
      pathname: "/api/lingguang/discard",
      query: projectQuery(),
      body: projectBody({ ids: [discardId, (second?.body as { spark: { id: string } }).spark.id] }),
    });
    assert.equal((discarded?.body as { ok: boolean }).ok, true);
    assert.equal(store.list(PROJECT).length, 1);
    assert.equal(store.list(PROJECT)[0]?.title, "窗边的光");
    store.close();

    const reopened = openLingguangStore(home);
    assert.equal(reopened.list(PROJECT).length, 1);
    assert.equal(reopened.list(PROJECT)[0]?.body, "下午三点，灰尘在亮里转。");
    assert.equal(reopened.list(OTHER).length, 0);
    reopened.close();
  });
});

test("改正文会写入 store；头脑风暴使用注入模型并保存真实回复", async () => {
  await withHome(async (home, host) => {
    const store = openLingguangStore(home);
    const routes = new LingguangPluginRouteTable(createLingguangRouteHandlers({ projectId: PROJECT, actions: bindActionClient(host.actionClient(
      molisWorkHostProjectReference({ projectId: PROJECT, boardId: PROJECT, databasePath: join(home, "project.sqlite") })),
      () => ({ actor_id: "test", project_id: PROJECT, audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS })) }));
    const created = await routes.handle({
      method: "POST",
      pathname: "/api/lingguang",
      query: projectQuery(),
      body: projectBody({ title: "种子", body: "从这一句往下聊" }),
    });
    const id = (created?.body as { spark: { id: string } }).spark.id;
    const updated = await routes.handle({
      method: "POST",
      pathname: `/api/lingguang/${id}`,
      query: projectQuery(),
      body: projectBody({ title: "种子", body: "改过的正文" }),
    });
    assert.equal((updated?.body as { spark: { body: string } }).spark.body, "改过的正文");
    const opened = await routes.handle({
      method: "POST",
      pathname: "/api/lingguang/conversations",
      query: projectQuery(),
      body: projectBody({ spark_ids: [id] }),
    });
    const conversationId = (opened?.body as { conversation: { id: string }; sparks: Array<{ body: string }> }).conversation.id;
    assert.equal((opened?.body as { sparks: Array<{ body: string }> }).sparks[0]?.body, "改过的正文");
    const replied = await routes.handle({
      method: "POST",
      pathname: `/api/lingguang/conversations/${conversationId}/messages`,
      query: projectQuery(),
      body: projectBody({ body: "明天试试" }),
    });
    const messages = (replied?.body as { messages: Array<{ role: string; body: string }> }).messages;
    assert.equal(messages.at(-2)?.role, "user");
    assert.equal(messages.at(-2)?.body, "明天试试");
    assert.equal(messages.at(-1)?.role, "assistant");
    assert.equal(messages.at(-1)?.body, "可以先记录明天窗边光线的变化。");
    store.close();

    const reopened = openLingguangStore(home);
    const again = reopened.openConversation([id], PROJECT);
    assert.equal(again.messages.at(-1)?.body, "可以先记录明天窗边光线的变化。");
    reopened.close();
  });
});
