import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  FEED_ARCHIVE_BEHAVIOR_ID,
  FEED_CAPTURE_SCENE_ID,
  FEED_OPEN_BEHAVIOR_ID,
  FEED_PROMOTE_BEHAVIOR_ID,
  FEED_REAUTH_BEHAVIOR_ID,
  FEED_SAVE_BEHAVIOR_ID,
  HOME_ASK_BEHAVIOR_ID,
  HOME_CONTINUE_BEHAVIOR_ID,
  HOME_DOCK_SCENE_ID,
  HOME_TALK_BEHAVIOR_ID,
  INBOX_ADMIT_BEHAVIOR_ID,
  INBOX_DONE_BEHAVIOR_ID,
  INBOX_DISMISS_BEHAVIOR_ID,
  INBOX_NEXT_SCENE_ID,
  SYSTEM_HOME_DOCK_FUNCTION_KEY,
  SYSTEM_INBOX_ADMIT_FUNCTION_KEY,
  SYSTEM_INBOX_NEXT_FUNCTION_KEY,
  filterSuggestedBehaviorIds,
  functionFitsScene,
  mapJudgmentChoice,
  visibleDockBehaviorIds,
  defaultHomeDockBehaviorIds,
  defaultInboxNextBehaviorIds,
  defaultFeedCaptureBehaviorIds,
  offeredHomeDockBehaviorIds,
  homeDockSubjectKinds,
  suggestedAuthoringBehaviors,
  visibleFeedDispositionIds,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { mcpPublicToolName } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  FunctionsError,
  createFunctionsService,
  openFunctionsStore,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-module-functions";
import { createFunctionsService as createPluginFunctionsService } from "@molis-ai/molis-work-plugin-functions";
import { feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { assembleHostBehaviorCatalog, hostFunctionAuthoringCatalog } from "../apps/local-host/src/behavior-catalog.ts";
import { buildHomeEvents } from "../apps/workbench/src/home-flow.ts";
import { assertContributionMatchesManifest, PluginContributionError } from "@molis-ai/molis-work-plugin-runtime";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const LIST = mcpPublicToolName("functions", "list");
const DESCRIBE = mcpPublicToolName("functions", "describe");
const INVOKE = mcpPublicToolName("functions", "invoke");

function memorySecrets(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    put(ref: string, value: string) { map.set(ref, value); },
    get(ref: string) { return map.get(ref) ?? null; },
    delete(ref: string) { return map.delete(ref); },
  };
}

function fixtureProvider(choice: string | null): TypeSafeProvider {
  return {
    async evaluate(_apiKey, record) {
      return {
        primitive: record.primitive,
        choice: record.primitive === "choice" ? choice : null,
        noul: null,
        score: null,
        legend: null,
        probabilities: choice ? { [choice]: 1 } : {},
        confidence: 1,
        model: "jev-1.13.0",
      };
    },
  };
}

async function withHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "molis-work-functions-system-"));
  try {
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function publishChoice(
  home: string,
  input: { name: string; function_key: string; keys: readonly string[]; provider?: TypeSafeProvider },
) {
  const store = openFunctionsStore(home);
  const service = createFunctionsService({
    store,
    secrets: memorySecrets(),
    env: { TYPESAFE_API_KEY: "sk-test" },
    provider: input.provider ?? fixtureProvider(input.keys[0] ?? null),
    allowed_behavior_ids: [...input.keys],
  });
  const created = service.createChoice({ name: input.name, function_key: input.function_key });
  const criteria = input.keys.map((key) => ({ key, description: key }));
  service.updateDraft(created.id, {
    instructions: "挑一个已登记行为",
    criteria,
  });
  await service.preview(created.id, "样例");
  const published = service.publish(created.id);
  return { store, service, published };
}

test("filterSuggestedBehaviorIds keeps registered Choice keys and drops talk plus unknowns", () => {
  assert.deepEqual(
    filterSuggestedBehaviorIds(
      [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID],
      [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID],
      HOME_CONTINUE_BEHAVIOR_ID,
    ),
    [HOME_CONTINUE_BEHAVIOR_ID],
  );
  assert.deepEqual(
    filterSuggestedBehaviorIds(
      [HOME_CONTINUE_BEHAVIOR_ID],
      [HOME_CONTINUE_BEHAVIOR_ID],
      "not-a-behavior",
    ),
    [],
  );
  assert.deepEqual(
    filterSuggestedBehaviorIds([HOME_TALK_BEHAVIOR_ID], [HOME_TALK_BEHAVIOR_ID], HOME_TALK_BEHAVIOR_ID),
    [],
  );
});

test("visibleDockBehaviorIds fall back to defaults when suggestions are empty or illegal", () => {
  const defaults = [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID];
  assert.deepEqual(visibleDockBehaviorIds([], defaults), defaults);
  assert.deepEqual(visibleDockBehaviorIds(["invented"], defaults), defaults);
  assert.deepEqual(visibleDockBehaviorIds([HOME_CONTINUE_BEHAVIOR_ID, "invented"], defaults), [HOME_CONTINUE_BEHAVIOR_ID]);
  assert.deepEqual(defaultInboxNextBehaviorIds(true), [INBOX_DONE_BEHAVIOR_ID, INBOX_DISMISS_BEHAVIOR_ID]);
  assert.deepEqual(defaultInboxNextBehaviorIds(false), []);
  assert.deepEqual(
    visibleDockBehaviorIds([INBOX_DONE_BEHAVIOR_ID], defaultInboxNextBehaviorIds(true)),
    [INBOX_DONE_BEHAVIOR_ID],
  );
  assert.deepEqual(defaultFeedCaptureBehaviorIds(true), [
    INBOX_ADMIT_BEHAVIOR_ID,
    FEED_SAVE_BEHAVIOR_ID,
    FEED_PROMOTE_BEHAVIOR_ID,
    FEED_ARCHIVE_BEHAVIOR_ID,
    FEED_OPEN_BEHAVIOR_ID,
  ]);
  assert.deepEqual(defaultFeedCaptureBehaviorIds(false), []);
  assert.deepEqual(
    visibleDockBehaviorIds([FEED_OPEN_BEHAVIOR_ID], defaultFeedCaptureBehaviorIds(true)),
    [FEED_OPEN_BEHAVIOR_ID],
  );
  assert.deepEqual(visibleFeedDispositionIds([], true), [
    INBOX_ADMIT_BEHAVIOR_ID,
    FEED_SAVE_BEHAVIOR_ID,
    FEED_PROMOTE_BEHAVIOR_ID,
    FEED_ARCHIVE_BEHAVIOR_ID,
  ]);
  assert.deepEqual(visibleFeedDispositionIds([FEED_OPEN_BEHAVIOR_ID], true), [
    FEED_SAVE_BEHAVIOR_ID,
    FEED_PROMOTE_BEHAVIOR_ID,
    FEED_ARCHIVE_BEHAVIOR_ID,
  ]);
  assert.deepEqual(visibleFeedDispositionIds([FEED_PROMOTE_BEHAVIOR_ID], true), [FEED_PROMOTE_BEHAVIOR_ID]);
  assert.deepEqual(visibleFeedDispositionIds(["invented.behavior"], true), [
    INBOX_ADMIT_BEHAVIOR_ID,
    FEED_SAVE_BEHAVIOR_ID,
    FEED_PROMOTE_BEHAVIOR_ID,
    FEED_ARCHIVE_BEHAVIOR_ID,
  ]);
});

test("Module persists a judgment and latest query returns it", async () => {
  await withHome(async (home) => {
    const { store, service, published } = await publishChoice(home, {
      name: "卡底",
      function_key: "pick_dock",
      keys: [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID],
      provider: fixtureProvider(HOME_CONTINUE_BEHAVIOR_ID),
    });
    try {
      const judged = await service.judge({
        function_key: published.function_key,
        input: "这条 Inbox 还没做完",
        subject: { kind: "inbox_entry", id: "att-1", board_id: "board" },
        scene_id: HOME_DOCK_SCENE_ID,
        offered_behavior_ids: [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID],
      });
      assert.equal(judged.outcome, "ok");
      assert.deepEqual(judged.suggested_behavior_ids, [HOME_CONTINUE_BEHAVIOR_ID]);
      const latest = service.latestJudgment("inbox_entry", "att-1", "board");
      assert.equal(latest?.judgment_id, judged.judgment_id);
      assert.equal(latest?.function_version, 1);
    } finally {
      store.close();
    }
  });
});

test("judge maps a custom Choice onto the Inbox button pool", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    const service = createFunctionsService({
      store,
      secrets: memorySecrets(),
      env: { TYPESAFE_API_KEY: "sk-test" },
      provider: fixtureProvider("urgent"),
      allowed_behavior_ids: [INBOX_DONE_BEHAVIOR_ID, INBOX_DISMISS_BEHAVIOR_ID],
    });
    try {
      const created = service.createChoice({ name: "急不急", function_key: "mail_urgency" });
      service.updateDraft(created.id, {
        instructions: "这封邮件急吗？",
        criteria: [
          { key: "urgent", description: "急" },
          { key: "later", description: "不急" },
        ],
        scene_id: INBOX_NEXT_SCENE_ID,
        subject_kinds: ["inbox_entry"],
        scene_map: {
          urgent: INBOX_DONE_BEHAVIOR_ID,
          later: INBOX_DISMISS_BEHAVIOR_ID,
        },
      });
      await service.preview(created.id, "三天没人回");
      service.publish(created.id);
      const bound = service.bindScene(INBOX_NEXT_SCENE_ID, "mail_urgency", "board");
      assert.equal(bound.function_key, "mail_urgency");
      const judged = await service.judge({
        function_key: "mail_urgency",
        input: "三天没人回",
        subject: { kind: "inbox_entry", id: "mail-1", board_id: "board" },
        scene_id: INBOX_NEXT_SCENE_ID,
        offered_behavior_ids: [INBOX_DONE_BEHAVIOR_ID, INBOX_DISMISS_BEHAVIOR_ID],
      });
      assert.equal(judged.outcome, "ok");
      assert.deepEqual(judged.suggested_behavior_ids, [INBOX_DONE_BEHAVIOR_ID]);
    } finally {
      store.close();
    }
  });
});

test("latest judgment is scoped to a scene so later home.dock does not cover inbox.next or feed.capture", async () => {
  await withHome(async (home) => {
    const offered = [
      HOME_CONTINUE_BEHAVIOR_ID,
      INBOX_DONE_BEHAVIOR_ID,
      FEED_REAUTH_BEHAVIOR_ID,
      HOME_ASK_BEHAVIOR_ID,
      INBOX_DISMISS_BEHAVIOR_ID,
      INBOX_ADMIT_BEHAVIOR_ID,
      FEED_OPEN_BEHAVIOR_ID,
    ];
    const store = openFunctionsStore(home);
    const service = createFunctionsService({
      store,
      secrets: memorySecrets(),
      env: { TYPESAFE_API_KEY: "sk-test" },
      allowed_behavior_ids: offered,
      provider: {
        async evaluate(_apiKey, record) {
          const choice = record.function_key === SYSTEM_INBOX_NEXT_FUNCTION_KEY
            ? INBOX_DONE_BEHAVIOR_ID
            : record.function_key === SYSTEM_INBOX_ADMIT_FUNCTION_KEY
              ? FEED_OPEN_BEHAVIOR_ID
              : HOME_CONTINUE_BEHAVIOR_ID;
          return {
            primitive: record.primitive,
            choice,
            noul: null,
            score: null,
            legend: null,
            probabilities: { [choice]: 1 },
            confidence: 1,
            model: "jev-1.13.0",
          };
        },
      },
    });
    try {
      const inbox = { kind: "inbox_entry" as const, id: "att-scene", board_id: "board" };
      const feed = { kind: "feed_item" as const, id: "item-scene", board_id: "board" };
      await service.judge({
        function_key: SYSTEM_INBOX_NEXT_FUNCTION_KEY,
        input: "Inbox 下一步",
        subject: inbox,
        scene_id: INBOX_NEXT_SCENE_ID,
        offered_behavior_ids: offered,
      });
      await service.judge({
        function_key: SYSTEM_HOME_DOCK_FUNCTION_KEY,
        input: "首页卡底",
        subject: inbox,
        scene_id: HOME_DOCK_SCENE_ID,
        offered_behavior_ids: offered,
      });
      await service.judge({
        function_key: SYSTEM_INBOX_ADMIT_FUNCTION_KEY,
        input: "Feed 捕捉",
        subject: feed,
        scene_id: FEED_CAPTURE_SCENE_ID,
        offered_behavior_ids: offered,
      });
      await service.judge({
        function_key: SYSTEM_HOME_DOCK_FUNCTION_KEY,
        input: "首页卡底",
        subject: feed,
        scene_id: HOME_DOCK_SCENE_ID,
        offered_behavior_ids: offered,
      });
      assert.deepEqual(
        service.latestJudgment("inbox_entry", "att-scene", "board", INBOX_NEXT_SCENE_ID)?.suggested_behavior_ids,
        [INBOX_DONE_BEHAVIOR_ID],
      );
      assert.deepEqual(
        service.latestJudgment("inbox_entry", "att-scene", "board", HOME_DOCK_SCENE_ID)?.suggested_behavior_ids,
        [HOME_CONTINUE_BEHAVIOR_ID],
      );
      assert.deepEqual(
        service.latestJudgment("feed_item", "item-scene", "board", FEED_CAPTURE_SCENE_ID)?.suggested_behavior_ids,
        [FEED_OPEN_BEHAVIOR_ID],
      );
      assert.deepEqual(
        service.latestJudgment("feed_item", "item-scene", "board", HOME_DOCK_SCENE_ID)?.suggested_behavior_ids,
        [HOME_CONTINUE_BEHAVIOR_ID],
      );
    } finally {
      store.close();
    }
  });
});

test("illegal Choice keys are dropped; missing key or failure keeps empty suggestions", async () => {
  await withHome(async (home) => {
    const { store, service } = await publishChoice(home, {
      name: "卡底",
      function_key: "pick_dock_filter",
      keys: [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID],
      provider: fixtureProvider("invented.behavior"),
    });
    try {
      const illegal = await service.judge({
        function_key: "pick_dock_filter",
        input: "乱发明",
        subject: { kind: "home_event", id: "evt-1" },
        scene_id: HOME_DOCK_SCENE_ID,
        offered_behavior_ids: [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID],
      });
      assert.deepEqual(illegal.suggested_behavior_ids, []);
    } finally {
      store.close();
    }

    const noKey = openFunctionsStore(home);
    const failing = createFunctionsService({
      store: noKey,
      secrets: { put() {}, get() { return null; }, delete() { return false; } },
      env: {},
      allowed_behavior_ids: [HOME_CONTINUE_BEHAVIOR_ID],
    });
    try {
      const judged = await failing.judge({
        function_key: SYSTEM_HOME_DOCK_FUNCTION_KEY,
        input: "没 Key",
        subject: { kind: "inbox_entry", id: "att-2" },
        scene_id: HOME_DOCK_SCENE_ID,
        offered_behavior_ids: [HOME_CONTINUE_BEHAVIOR_ID],
      });
      assert.equal(judged.outcome, "needs_review");
      assert.deepEqual(judged.suggested_behavior_ids, []);
      assert.equal(judged.error_code, "functions.provider_not_configured");
    } finally {
      noKey.close();
    }
  });
});

test("plugin UI path can still publish via the thinned plugin entry", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    const service = createPluginFunctionsService({
      store,
      secrets: memorySecrets(),
      env: { TYPESAFE_API_KEY: "sk-test" },
      provider: fixtureProvider("yes"),
    });
    try {
      const created = service.createChoice({ name: "账单", function_key: "billing_route" });
      service.updateDraft(created.id, {
        instructions: "是账单吗",
        criteria: [
          { key: "yes", description: "账单" },
          { key: "no", description: "其他" },
        ],
      });
      await service.preview(created.id, "请退款");
      const published = service.publish(created.id);
      assert.equal(published.status, "published");
      assert.equal(published.version, 1);
    } finally {
      store.close();
    }
  });
});

test("Host behavior catalog includes Functions MCP tools and home/Inbox dock actions", () => {
  const ids = assembleHostBehaviorCatalog().map((row) => row.behavior_id);
  assert.ok(ids.includes(LIST));
  assert.ok(ids.includes(DESCRIBE));
  assert.ok(ids.includes(INVOKE));
  assert.ok(ids.includes(HOME_CONTINUE_BEHAVIOR_ID));
  assert.ok(ids.includes(INBOX_DONE_BEHAVIOR_ID));
  assert.ok(ids.includes(FEED_REAUTH_BEHAVIOR_ID));
  assert.ok(ids.includes(HOME_ASK_BEHAVIOR_ID));
  assert.ok(ids.includes(INBOX_ADMIT_BEHAVIOR_ID));
  assert.ok(ids.includes(FEED_OPEN_BEHAVIOR_ID));
  assert.ok(ids.includes(FEED_SAVE_BEHAVIOR_ID));
  assert.ok(ids.includes(FEED_PROMOTE_BEHAVIOR_ID));
  assert.ok(ids.includes(FEED_ARCHIVE_BEHAVIOR_ID));
  assert.equal(ids.includes(HOME_TALK_BEHAVIOR_ID), false);
  assert.equal(ids.includes("github.whoami"), false);
});

test("authoring catalog exposes event destinations, MCP tools, and plugin actions", () => {
  const catalog = hostFunctionAuthoringCatalog();
  const dest = Object.fromEntries(catalog.destinations.map((row) => [row.destination_id, row]));
  assert.equal(dest["home.dock"]?.kind, "event");
  assert.match(dest["home.dock"]?.when ?? "", /亮哪些按钮/);
  assert.match(dest["home.dock"]?.configure_at ?? "", /发布后打开/);
  assert.match(dest["home.dock"]?.effect ?? "", /亮哪些按钮/);
  assert.match(dest["feed.capture"]?.when ?? "", /升格还是忽略/);
  assert.ok(dest["feed.capture"]?.behavior_ids.includes(FEED_SAVE_BEHAVIOR_ID));
  assert.ok(dest["feed.capture"]?.behavior_ids.includes(FEED_PROMOTE_BEHAVIOR_ID));
  assert.ok(dest["feed.capture"]?.behavior_ids.includes(FEED_ARCHIVE_BEHAVIOR_ID));
  assert.equal(dest["agent.mcp"]?.kind, "mcp");
  assert.ok(catalog.subjects.some((row) => row.subject_kind === "home_event"));
  const byId = Object.fromEntries(catalog.behaviors.map((row) => [row.behavior_id, row]));
  assert.equal(byId[HOME_CONTINUE_BEHAVIOR_ID]?.source, "system");
  assert.equal(byId[HOME_CONTINUE_BEHAVIOR_ID]?.clickable, true);
  assert.equal(byId[FEED_SAVE_BEHAVIOR_ID]?.clickable, true);
  assert.equal(byId[FEED_PROMOTE_BEHAVIOR_ID]?.clickable, true);
  assert.equal(byId[FEED_ARCHIVE_BEHAVIOR_ID]?.clickable, true);
  assert.equal(byId[INVOKE]?.source, "mcp");
  assert.equal(byId[INVOKE]?.clickable, false);
  assert.equal(byId[mcpPublicToolName("form", "create")]?.source, "mcp");
  assert.equal(byId[mcpPublicToolName("form", "create")]?.effect, "write");
  assert.equal(byId[mcpPublicToolName("form", "create")]?.title, "Forms · create");
  assert.match(byId[mcpPublicToolName("form", "create")]?.hint ?? "", /新建一份草稿问卷/);
  assert.ok(dest["agent.mcp"]?.behavior_ids.includes(INVOKE));
});

test("unbound home events keep the previous continue/reauth act", () => {
  const now = new Date(2026, 8, 19, 13, 20);
  const events = buildHomeEvents({
    now,
    locale: "zh-CN",
    inbox: [{
      entry_id: "att-1",
      subject_type: "feed_item",
      subject_id: "pr-1",
      reason: "source_rule",
      status: "open",
      revision: 1,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }],
    feedItems: [{
      item_id: "pr-1",
      title: "PR",
      summary: "摘要",
      body: "正文",
      source_id: "gh",
      source_kind: "github",
      source_label: "GitHub",
      imported_at: now.toISOString(),
      source_created_at: now.toISOString(),
      author: null,
      url: null,
      linked_goal_id: null,
    }],
    sources: [],
    sessions: [],
  });
  assert.equal(events[0]?.act, "continue");
  assert.deepEqual(events[0]?.suggested_behavior_ids ?? [], []);
});

test("bound Choice suggestions ride on the home event without hiding 说一句", () => {
  const now = new Date(2026, 8, 19, 13, 20);
  const events = buildHomeEvents({
    now,
    locale: "zh-CN",
    inbox: [{
      entry_id: "att-2",
      subject_type: "feed_item",
      subject_id: "pr-2",
      reason: "source_rule",
      status: "open",
      revision: 1,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      suggested_behavior_ids: [HOME_CONTINUE_BEHAVIOR_ID],
    }],
    feedItems: [{
      item_id: "pr-2",
      title: "PR",
      summary: null,
      body: null,
      source_id: "gh",
      source_kind: "github",
      source_label: "GitHub",
      imported_at: now.toISOString(),
      source_created_at: now.toISOString(),
      author: null,
      url: null,
      linked_goal_id: null,
    }],
    sources: [],
    sessions: [],
  });
  assert.deepEqual(events[0]?.suggested_behavior_ids, [HOME_CONTINUE_BEHAVIOR_ID]);
  assert.equal(
    visibleDockBehaviorIds(events[0]?.suggested_behavior_ids, [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID]).includes(HOME_TALK_BEHAVIOR_ID),
    false,
  );
});

test("built-in function keys exist in the Module store", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    try {
      const keys = store.list().map((row) => row.function_key);
      assert.ok(keys.includes(SYSTEM_HOME_DOCK_FUNCTION_KEY));
      assert.ok(keys.includes(SYSTEM_INBOX_ADMIT_FUNCTION_KEY));
      assert.ok(keys.includes(SYSTEM_INBOX_NEXT_FUNCTION_KEY));
      const homeDock = store.requirePublishedByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY);
      assert.equal(homeDock.status, "published");
      assert.ok(
        Array.isArray(homeDock.criteria)
        && homeDock.criteria.some((row) => "key" in row && row.key === INBOX_DISMISS_BEHAVIOR_ID),
      );
    } finally {
      store.close();
    }
  });
});

test("functionFitsScene keeps every Choice option inside the scene pool", () => {
  const homeDock = {
    primitive: "choice" as const,
    criteria: [
      { key: HOME_CONTINUE_BEHAVIOR_ID, description: "接着做" },
      { key: INBOX_DONE_BEHAVIOR_ID, description: "做完了" },
      { key: FEED_REAUTH_BEHAVIOR_ID, description: "重新授权" },
      { key: HOME_ASK_BEHAVIOR_ID, description: "问问" },
    ],
  };
  const admit = {
    primitive: "choice" as const,
    criteria: [
      { key: INBOX_ADMIT_BEHAVIOR_ID, description: "进 Inbox" },
      { key: FEED_OPEN_BEHAVIOR_ID, description: "留在 Feed" },
    ],
  };
  const next = {
    primitive: "choice" as const,
    criteria: [
      { key: INBOX_DONE_BEHAVIOR_ID, description: "已处理" },
      { key: INBOX_DISMISS_BEHAVIOR_ID, description: "忽略" },
    ],
  };
  assert.equal(functionFitsScene(homeDock, HOME_DOCK_SCENE_ID), true);
  assert.equal(functionFitsScene(homeDock, INBOX_NEXT_SCENE_ID), false);
  assert.equal(functionFitsScene(homeDock, FEED_CAPTURE_SCENE_ID), false);
  assert.equal(functionFitsScene(admit, FEED_CAPTURE_SCENE_ID), true);
  assert.equal(functionFitsScene(admit, INBOX_NEXT_SCENE_ID), false);
  assert.equal(functionFitsScene(admit, HOME_DOCK_SCENE_ID), false);
  assert.equal(functionFitsScene(next, INBOX_NEXT_SCENE_ID), true);
  assert.equal(functionFitsScene(next, HOME_DOCK_SCENE_ID), false);
  assert.equal(functionFitsScene(next, FEED_CAPTURE_SCENE_ID), false);
  const continueDismiss = {
    primitive: "choice" as const,
    criteria: [
      { key: HOME_CONTINUE_BEHAVIOR_ID, description: "接着做" },
      { key: INBOX_DISMISS_BEHAVIOR_ID, description: "忽略" },
    ],
  };
  assert.equal(functionFitsScene(continueDismiss, HOME_DOCK_SCENE_ID), true);
  assert.equal(functionFitsScene(continueDismiss, INBOX_NEXT_SCENE_ID), false);
  assert.equal(functionFitsScene({ primitive: "noul", criteria: { true_description: "是", false_description: "否" } }, HOME_DOCK_SCENE_ID), false);
  assert.equal(functionFitsScene(admit, "unknown.scene"), true);
  assert.equal(functionFitsScene({ ...admit, scene_id: FEED_CAPTURE_SCENE_ID }, INBOX_NEXT_SCENE_ID), false);
  assert.equal(functionFitsScene({
    primitive: "choice" as const,
    criteria: [
      { key: "molis_work_v1_form_create", description: "建问卷" },
      { key: "molis_work_v1_functions_invoke", description: "调判断" },
    ],
    scene_id: "agent.mcp",
  }, INBOX_NEXT_SCENE_ID), false);
  assert.equal(functionFitsScene({
    primitive: "choice" as const,
    criteria: [
      { key: "molis_work_v1_form_create", description: "建问卷" },
      { key: "molis_work_v1_functions_invoke", description: "调判断" },
    ],
    scene_id: "agent.mcp",
  }, "agent.mcp"), true);
  assert.equal(functionFitsScene({
    primitive: "choice" as const,
    criteria: [
      { key: "urgent", description: "急" },
      { key: "later", description: "不急" },
    ],
    scene_id: INBOX_NEXT_SCENE_ID,
  }, INBOX_NEXT_SCENE_ID), false);
  assert.equal(functionFitsScene({
    primitive: "choice" as const,
    criteria: [
      { key: "urgent", description: "急" },
      { key: "later", description: "不急" },
    ],
    scene_id: INBOX_NEXT_SCENE_ID,
    scene_map: {
      urgent: INBOX_DONE_BEHAVIOR_ID,
      later: INBOX_DISMISS_BEHAVIOR_ID,
    },
  }, INBOX_NEXT_SCENE_ID), true);
  assert.equal(functionFitsScene({
    primitive: "noul" as const,
    criteria: { true_description: "够", false_description: "不够" },
    scene_id: INBOX_NEXT_SCENE_ID,
    scene_map: {
      true: INBOX_DONE_BEHAVIOR_ID,
      false: INBOX_DISMISS_BEHAVIOR_ID,
    },
  }, INBOX_NEXT_SCENE_ID), true);
  assert.equal(mapJudgmentChoice({
    primitive: "choice",
    criteria: [
      { key: "urgent", description: "急" },
      { key: "later", description: "不急" },
    ],
    scene_map: { urgent: INBOX_DONE_BEHAVIOR_ID, later: INBOX_DISMISS_BEHAVIOR_ID },
  }, { choice: "urgent" }), INBOX_DONE_BEHAVIOR_ID);
  assert.equal(mapJudgmentChoice({
    primitive: "noul",
    criteria: { true_description: "够", false_description: "不够" },
    scene_map: { true: INBOX_DONE_BEHAVIOR_ID, false: INBOX_DISMISS_BEHAVIOR_ID },
  }, { noul: 0.8 }), INBOX_DONE_BEHAVIOR_ID);
});

test("bindScene rejects a published function whose options miss the scene pool", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    const service = createFunctionsService({
      store,
      secrets: memorySecrets(),
    });
    try {
      assert.throws(
        () => service.bindScene(INBOX_NEXT_SCENE_ID, SYSTEM_INBOX_ADMIT_FUNCTION_KEY, "board"),
        (error: unknown) => error instanceof FunctionsError && error.code === "functions.scene_mismatch",
      );
      const bound = service.bindScene(INBOX_NEXT_SCENE_ID, SYSTEM_INBOX_NEXT_FUNCTION_KEY, "board");
      assert.equal(bound.function_key, SYSTEM_INBOX_NEXT_FUNCTION_KEY);
      assert.equal(store.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY)?.scene_id, HOME_DOCK_SCENE_ID);
      assert.ok((store.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY)?.subject_kinds ?? []).includes("home_event"));
    } finally {
      store.close();
    }
  });
});

test("agent.mcp functions cannot bind to a site scene", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    const service = createFunctionsService({
      store,
      secrets: memorySecrets(),
      env: { TYPESAFE_API_KEY: "sk-test" },
      provider: fixtureProvider("molis_work_v1_form_create"),
    });
    try {
      const created = service.createChoice({ name: "挑工具", function_key: "pick_tool" });
      service.updateDraft(created.id, {
        instructions: "Agent 该调哪个工具",
        criteria: [
          { key: "molis_work_v1_form_create", description: "建问卷" },
          { key: "molis_work_v1_dataset_create", description: "建表" },
        ],
        scene_id: "agent.mcp",
        subject_kinds: ["mcp_invoke"],
      });
      await service.preview(created.id, "样例");
      service.publish(created.id);
      assert.throws(
        () => service.bindScene(INBOX_NEXT_SCENE_ID, "pick_tool", "board"),
        (error: unknown) => error instanceof FunctionsError && error.code === "functions.scene_mismatch",
      );
    } finally {
      store.close();
    }
  });
});

test("authoring suggestions follow destination and subject kinds", () => {
  const catalog = hostFunctionAuthoringCatalog();
  assert.deepEqual(
    suggestedAuthoringBehaviors(catalog, INBOX_NEXT_SCENE_ID, []).map((row) => row.behavior_id),
    ["inbox.compose", "inbox.verify", INBOX_DONE_BEHAVIOR_ID, INBOX_DISMISS_BEHAVIOR_ID],
  );
  assert.deepEqual(
    suggestedAuthoringBehaviors(catalog, FEED_CAPTURE_SCENE_ID, []).map((row) => row.behavior_id),
    [
      INBOX_ADMIT_BEHAVIOR_ID,
      FEED_SAVE_BEHAVIOR_ID,
      FEED_PROMOTE_BEHAVIOR_ID,
      FEED_ARCHIVE_BEHAVIOR_ID,
      FEED_OPEN_BEHAVIOR_ID,
    ],
  );
  assert.deepEqual(suggestedAuthoringBehaviors(catalog, INBOX_NEXT_SCENE_ID, ["feed_item"]), []);
  const homeInbox = suggestedAuthoringBehaviors(catalog, HOME_DOCK_SCENE_ID, ["inbox_entry"]).map((row) => row.behavior_id);
  assert.ok(homeInbox.includes(INBOX_DONE_BEHAVIOR_ID));
  assert.ok(homeInbox.includes(HOME_CONTINUE_BEHAVIOR_ID));
  assert.equal(homeInbox.includes(INBOX_ADMIT_BEHAVIOR_ID), false);
  const homeFeed = suggestedAuthoringBehaviors(catalog, HOME_DOCK_SCENE_ID, ["feed_item"]).map((row) => row.behavior_id);
  assert.ok(homeFeed.includes(FEED_OPEN_BEHAVIOR_ID));
  assert.ok(homeFeed.includes(HOME_CONTINUE_BEHAVIOR_ID));
  assert.equal(homeFeed.includes(INBOX_DONE_BEHAVIOR_ID), false);
  assert.equal(homeFeed.includes(FEED_SAVE_BEHAVIOR_ID), false);
  assert.equal(homeFeed.includes(FEED_PROMOTE_BEHAVIOR_ID), false);
  assert.deepEqual(suggestedAuthoringBehaviors(catalog, "", []), []);
  assert.ok(
    suggestedAuthoringBehaviors(catalog, "", ["inbox_entry"]).some((row) => row.behavior_id === INBOX_DONE_BEHAVIOR_ID),
  );
});

test("home dock offered set is collected from catalog subjects, not the unbound default pair", () => {
  const catalog = assembleHostBehaviorCatalog();
  assert.deepEqual(
    homeDockSubjectKinds({ act: "continue", hasInbox: true, plugin: "inbox", openPlugin: "feed" }),
    ["inbox_entry", "feed_item"],
  );
  const offered = offeredHomeDockBehaviorIds(catalog, ["inbox_entry", "feed_item"]);
  assert.ok(offered.includes(INBOX_DISMISS_BEHAVIOR_ID));
  assert.ok(offered.includes(INBOX_DONE_BEHAVIOR_ID));
  assert.ok(offered.includes(HOME_CONTINUE_BEHAVIOR_ID));
  assert.ok(offered.includes(FEED_OPEN_BEHAVIOR_ID));
  assert.equal(offered.includes(INBOX_ADMIT_BEHAVIOR_ID), false);
  assert.equal(offered.includes(FEED_SAVE_BEHAVIOR_ID), false);
  assert.equal(offered.includes(FEED_PROMOTE_BEHAVIOR_ID), false);
  assert.equal(offered.includes(FEED_ARCHIVE_BEHAVIOR_ID), false);
  assert.equal(offered.includes(LIST), false);
  const defaults = defaultHomeDockBehaviorIds("continue", true);
  assert.deepEqual(defaults, [HOME_CONTINUE_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID]);
  assert.deepEqual(
    visibleDockBehaviorIds([INBOX_DISMISS_BEHAVIOR_ID], offered, defaults),
    [INBOX_DISMISS_BEHAVIOR_ID],
  );
  assert.deepEqual(visibleDockBehaviorIds([], offered, defaults), defaults);
});

test("Feed and Inbox declare scenes without naming the Functions plugin implementation", () => {
  assert.equal(feedManifest.function_scenes?.[0]?.scene_id, FEED_CAPTURE_SCENE_ID);
  assert.ok(feedManifest.requires?.some((row) => row.capability_id === "functions.evaluate"));
  assert.ok(feedManifest.behaviors?.some((row) => row.behavior_id === "save"));
  assert.ok(feedManifest.behaviors?.some((row) => row.behavior_id === "promote"));
  assert.ok(feedManifest.behaviors?.some((row) => row.behavior_id === "archive"));
  assert.equal(inboxManifest.function_scenes?.[0]?.scene_id, "inbox.next");
  assert.equal(inboxManifest.plugin_id.includes("functions"), false);
});

test("Feed, Inbox and home do not import the Functions plugin implementation", async () => {
  const files = [
    "plugins/native/feed/src/application.ts",
    "plugins/native/feed/src/application-ports.ts",
    "plugins/native/feed/src/manifest.ts",
    "plugins/native/feed/src/ui.ts",
    "plugins/native/feed/src/out-rule-route-handlers.ts",
    "plugins/native/inbox/src/manifest.ts",
    "plugins/native/inbox/src/projection.ts",
    "plugins/native/inbox/src/ui.ts",
    "plugins/native/inbox/src/route-handlers.ts",
    "plugins/native/inbox/src/routes.ts",
    "apps/workbench/src/home-flow.ts",
    "apps/workbench/src/inbox-projection-ui.ts",
    "apps/workbench/src/feed-projection-ui.ts",
    "apps/workbench/src/scripts/client/project-home.ts",
    "apps/workbench/src/scripts/client/navigation-inbox.ts",
    "apps/workbench/src/scripts/client/navigation-feed.ts",
    "apps/workbench/src/scripts/client/events-primary.ts",
    "apps/local-host/src/home-dock-http.ts",
    "apps/local-host/src/feed-native-plugin-http.ts",
    "apps/local-host/src/web-view.ts",
  ];
  for (const relative of files) {
    const source = await readFile(join(ROOT, "..", relative), "utf8");
    assert.equal(
      source.includes("@molis-ai/molis-work-plugin-functions"),
      false,
      relative,
    );
  }
  const webView = await readFile(join(ROOT, "..", "apps/local-host/src/web-view.ts"), "utf8");
  assert.match(webView, /latestJudgment\("inbox_entry", entry\.entry_id, boardId, INBOX_NEXT_SCENE_ID\)/);
  assert.match(webView, /item\.item_id, FEED_CAPTURE_SCENE_ID/);
  assert.match(webView, /home_dock_suggested_behavior_ids/);
});

test("home dock HTTP binds a published function at the scene without executing writes", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-home-dock-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const created = await catalog.createProject({ display_name: "卡底绑定", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const token = "home-dock-test-token-0123456789012345";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
  let sequence = 0;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    catalog.close();
    await rm(homeDirectory, { recursive: true, force: true });
  });

  const webFetch = (input: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET") return fetch(input, init);
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    headers.set("x-molis-work-control-token", token);
    if (!headers.has("x-molis-work-idempotency-key")) {
      sequence += 1;
      headers.set("x-molis-work-idempotency-key", `home-dock-${sequence}`);
    }
    return fetch(input, { ...init, headers });
  };

  const listed = await webFetch(`${origin}${prefix}/api/home/dock-judgment`);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json() as {
    function_key: string | null;
    functions: Array<{ function_key: string }>;
  };
  assert.equal(listedBody.function_key, null);
  assert.ok(listedBody.functions.some((row) => row.function_key === SYSTEM_HOME_DOCK_FUNCTION_KEY));
  assert.equal(listedBody.functions.some((row) => row.function_key === SYSTEM_INBOX_ADMIT_FUNCTION_KEY), false);
  assert.equal(listedBody.functions.some((row) => row.function_key === SYSTEM_INBOX_NEXT_FUNCTION_KEY), false);

  const page = await (await webFetch(`${origin}${prefix}/`)).text();
  assert.match(page, /"function_scenes"/);
  assert.match(page, /"home_dock":null/);
  assert.match(page, /"home_dock_functions"/);
  const homeClient = await readFile(join(ROOT, "..", "apps/workbench/src/scripts/client/project-home.ts"), "utf8");
  const functionsClient = await readFile(join(ROOT, "..", "plugins/native/functions/src/client.ts"), "utf8");
  assert.doesNotMatch(homeClient, /data-home-dock-judgment/);
  assert.match(functionsClient, /\/api\/home\/dock-judgment/);
  assert.match(functionsClient, /\/api\/inbox\/judgment/);
  assert.match(functionsClient, /用在 Inbox/);
  assert.match(functionsClient, /用在首页/);
  assert.match(homeClient, /home_dock_suggested_behavior_ids/);
  assert.match(homeClient, /dock_behaviors/);
  assert.match(homeClient, /data-home-behavior/);
  assert.match(homeClient, /data-home-dismiss/);
  assert.match(page, /"dock_behaviors"/);

  const mismatched = await webFetch(`${origin}${prefix}/api/home/dock-judgment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ function_key: SYSTEM_INBOX_ADMIT_FUNCTION_KEY }),
  });
  assert.equal(mismatched.status, 400);

  const bound = await webFetch(`${origin}${prefix}/api/home/dock-judgment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ function_key: SYSTEM_HOME_DOCK_FUNCTION_KEY }),
  });
  assert.equal(bound.status, 200);
  assert.equal((await bound.json() as { function_key: string }).function_key, SYSTEM_HOME_DOCK_FUNCTION_KEY);

  const reread = await webFetch(`${origin}${prefix}/api/home/dock-judgment`);
  assert.equal((await reread.json() as { function_key: string }).function_key, SYSTEM_HOME_DOCK_FUNCTION_KEY);

  const board = await (await webFetch(`${origin}${prefix}/api/board`)).json() as {
    function_scenes?: { home_dock: string | null };
  };
  assert.equal(board.function_scenes?.home_dock, SYSTEM_HOME_DOCK_FUNCTION_KEY);

  const unpublished = await webFetch(`${origin}${prefix}/api/home/dock-judgment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ function_key: "not_a_published_function" }),
  });
  assert.equal(unpublished.status, 400);

  const unbound = await webFetch(`${origin}${prefix}/api/home/dock-judgment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ function_key: null }),
  });
  assert.equal(unbound.status, 200);
  assert.equal((await unbound.json() as { function_key: string | null }).function_key, null);
});

test("undeclared behavior handlers are refused", () => {
  assert.throws(
    () => assertContributionMatchesManifest(feedManifest, {
      kind: "app",
      views: [],
      behaviors: [{ behavior_id: "invented", handle: () => undefined }],
    }),
    (error: unknown) => error instanceof PluginContributionError && error.message.includes("invented"),
  );
});

test("app plugins must redeem declared behavior handlers", () => {
  const manifest = {
    ...feedManifest,
    kind: "app" as const,
    plugin_id: "io.molis.work.demo-dock",
    ui: { contributions: [], views: [] },
    behaviors: [{ behavior_id: "pin", title: "挂到 Goal", effect: "write" as const, subject_kinds: ["inbox_entry"] }],
    mcp_exports: [],
    routes: [],
    function_scenes: [],
  };
  assert.throws(
    () => assertContributionMatchesManifest(manifest, { kind: "app", views: [] }),
    (error: unknown) => error instanceof PluginContributionError && String(error.message).includes("pin"),
  );
  assertContributionMatchesManifest(manifest, {
    kind: "app",
    views: [],
    behaviors: [{ behavior_id: "pin", handle: () => undefined }],
  });
});

test("FunctionsError still surfaces from the Module", () => {
  assert.equal(new FunctionsError("functions.invalid", "x").code, "functions.invalid");
});
