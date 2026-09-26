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
  defaultInboxNextBehaviorIds,
  defaultFeedCaptureBehaviorIds,
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
import { feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { liveHostFunctionAuthoringCatalog } from "../apps/local-host/src/behavior-catalog.ts";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectHomeEvents } from "../apps/workbench/src/home-flow.ts";
import { assertContributionMatchesManifest, PluginContributionError } from "@molis-ai/molis-work-plugin-runtime";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

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

test("Feed disposition defaults are offered until a valid choice selects them", () => {
  assert.deepEqual(defaultFeedCaptureBehaviorIds(true), [
    INBOX_ADMIT_BEHAVIOR_ID,
    FEED_SAVE_BEHAVIOR_ID,
    FEED_PROMOTE_BEHAVIOR_ID,
    FEED_ARCHIVE_BEHAVIOR_ID,
    FEED_OPEN_BEHAVIOR_ID,
  ]);
  assert.deepEqual(defaultFeedCaptureBehaviorIds(false), []);
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

test("historical judgments retain original object, project and scene scope", async () => {
  await withHome(async home => {
    const store = openFunctionsStore(home);
    try {
      const write = (scene: string, project: string, result: string) => store.recordJudgment({ function_key: "old-rule", function_version: 1,
        subject: { kind: "inbox_entry", id: "same-object", board_id: project }, scene_id: scene, outcome: "ok", suggested_behavior_ids: [result], error_code: null });
      const inbox = write(INBOX_NEXT_SCENE_ID, "first", INBOX_DONE_BEHAVIOR_ID);
      const home = write(HOME_DOCK_SCENE_ID, "first", HOME_CONTINUE_BEHAVIOR_ID);
      const foreign = write(INBOX_NEXT_SCENE_ID, "other", INBOX_DISMISS_BEHAVIOR_ID);
      assert.deepEqual(store.latestJudgment("inbox_entry", "same-object", "first", INBOX_NEXT_SCENE_ID), inbox);
      assert.deepEqual(store.latestJudgment("inbox_entry", "same-object", "first", HOME_DOCK_SCENE_ID), home);
      assert.deepEqual(store.latestJudgment("inbox_entry", "same-object", "other", INBOX_NEXT_SCENE_ID), foreign);
      assert.deepEqual(store.latestSceneJudgments("first", INBOX_NEXT_SCENE_ID), [inbox]);
    } finally { store.close(); }
  });
});

test("system module can publish using the existing rule store", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    const service = createFunctionsService({
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

const catalogAction = (id: string, version = 1, provider = "example.notes"): ActionView => ({
  capability_id: id, version, operation: "query", provider: { provider_id: provider, kind: "system", title: "Notes" }, availability: { available: true },
  action: { title: "Read note", description: "Read original note", kind: "query", scope: "home", audiences: ["agent", "user"],
    permissions: [], subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "object" } },
});

test("authoring derives exact Agent capabilities from the supplied directory without static aliases or guessed scenes", () => {
  const first = catalogAction("unknown.notes");
  const second = catalogAction("unknown.notes", 2);
  const unavailable = { ...catalogAction("unknown.write"), availability: { available: false as const, code: "notes.offline", reason: "Offline" } };
  const userOnly = { ...catalogAction("private.user"), action: { ...first.action, audiences: ["user" as const] } };
  const catalog = liveHostFunctionAuthoringCatalog([first, second, unavailable, userOnly]);
  assert.deepEqual(catalog.destinations.map(row => row.destination_id), ["agent.mcp"]);
  assert.equal(catalog.behaviors.length, 3);
  assert.deepEqual(catalog.behaviors.map(row => row.action_ref), [first, second, unavailable].map(row => ({ capability_id: row.capability_id, version: row.version, provider_id: row.provider.provider_id })));
  assert.equal(new Set(catalog.behaviors.map(row => row.behavior_id)).size, 3);
  assert.equal(catalog.behaviors[2]?.availability?.available, false);
  assert.deepEqual(liveHostFunctionAuthoringCatalog().behaviors, [], "an empty directory cannot expose builtins or legacy aliases");
  assert.equal(liveHostFunctionAuthoringCatalog([catalogAction("unknown.notes", 1, "replacement")]).behaviors[0]?.behavior_id === catalog.behaviors[0]?.behavior_id, false);
});

test("Home preserves declared navigation and bound suggestions without inventing actions", () => {
  const now = new Date(2026, 8, 19, 13, 20);
  const open = { kind: "item" as const, surface: "notes", id: "note-1", title: "笔记", label: "打开笔记" };
  const events = projectHomeEvents({ now, events: [{
    id: "opaque", event_id: "note-event", subject: { kind: "note", id: "note-1" },
    source: { capability_id: "plugin.events", version: 1, provider_id: "unknown" }, origin: { surface: "notes", title: "笔记", icon: "note" },
    occurred_at: now.toISOString(), placement: "occurred", category: "personal", title: "笔记", summary: "摘要", content: "正文", facts: [], needs_attention: false,
    open, suggested_behavior_ids: [HOME_CONTINUE_BEHAVIOR_ID],
  }] });
  assert.deepEqual(events[0]?.open, open);
  assert.deepEqual(events[0]?.suggested_behavior_ids, [HOME_CONTINUE_BEHAVIOR_ID]);
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
  assert.equal(functionFitsScene(homeDock, HOME_DOCK_SCENE_ID), false, "legacy static helpers cannot establish Home compatibility");
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
  assert.equal(functionFitsScene(continueDismiss, HOME_DOCK_SCENE_ID), false);
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
      assert.deepEqual(store.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY)?.subject_kinds, ["inbox_entry"]);
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

test("Agent suggestions respect subject contracts and exclude other scenes", () => {
  const generic = catalogAction("generic.read");
  const note = { ...catalogAction("note.read"), action: { ...generic.action, subject_kinds: ["note"] } };
  const feed = { ...catalogAction("feed.read"), action: { ...generic.action, subject_kinds: ["feed_item"] } };
  const base = liveHostFunctionAuthoringCatalog([generic, note, feed]);
  const catalog = { ...base, behaviors: [...base.behaviors, { ...base.behaviors[0]!, behavior_id: "other-scene-symbol", destination_id: "other.scene", action_ref: undefined }] };
  assert.deepEqual(suggestedAuthoringBehaviors(catalog, "agent.mcp", ["note"]).map(row => row.action_ref?.capability_id), ["generic.read", "note.read"]);
  assert.equal(suggestedAuthoringBehaviors(catalog, "agent.mcp", []).length, 3);
  assert.deepEqual(suggestedAuthoringBehaviors(catalog, "", ["note"]), []);
  assert.deepEqual(suggestedAuthoringBehaviors(catalog, "unregistered.scene", []), []);
});

test("Feed and Inbox declare scenes without naming the Functions plugin implementation", () => {
  assert.equal(feedManifest.action_scenes?.[0]?.scene_id, FEED_CAPTURE_SCENE_ID);
  assert.ok(!feedManifest.requires?.some((row) => row.capability_id === "functions.evaluate"));
  assert.ok(feedManifest.behaviors?.some((row) => row.behavior_id === "save"));
  assert.ok(feedManifest.behaviors?.some((row) => row.behavior_id === "promote"));
  assert.ok(feedManifest.behaviors?.some((row) => row.behavior_id === "archive"));
  assert.equal(inboxManifest.action_scenes?.[0]?.scene_id, "inbox.next");
  assert.equal(inboxManifest.function_scenes, undefined);
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
  assert.doesNotMatch(webView, /latestJudgment\(/, "page composition must not bypass the registered consumer's current binding query");
  assert.doesNotMatch(webView, /home_dock_suggested_behavior_ids/);
});

test("home dock HTTP binds a published function at the scene without executing writes", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-home-dock-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const created = await catalog.createProject({ display_name: "卡底绑定", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const token = "home-dock-test-token-0123456789012345";
  const localHost = new MolisWorkLocalHost({ homeDirectory, functions: { env: { TYPESAFE_API_KEY: "fixture-only" } } });
  const server = createMolisWorkWebServer({ homeDirectory, localHost, controlToken: token });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
  let sequence = 0;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await localHost.close();
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
  assert.equal(listedBody.functions.some((row) => row.function_key === SYSTEM_INBOX_NEXT_FUNCTION_KEY), false,
    "Inbox scene result symbols are not canonical declared Home offer references");

  const page = await (await webFetch(`${origin}${prefix}/`)).text();
  assert.doesNotMatch(page, /"function_scenes"/);
  assert.match(page, /"inbox_judgment"/);
  assert.doesNotMatch(page, /"home_dock_functions"/);
  const homeClient = await readFile(join(ROOT, "..", "apps/workbench/src/scripts/client/project-home.ts"), "utf8");
  const functionsClient = await readFile(join(ROOT, "..", "apps/workbench/src/functions/client.ts"), "utf8");
  assert.doesNotMatch(homeClient, /data-home-dock-judgment/);
  assert.doesNotMatch(functionsClient, /\/api\/home\/dock-judgment|\/api\/inbox\/judgment/, "the generic editor must not keep native scene dispatch branches");
  const now = new Date();
  const eventResponse = await webFetch(`${origin}${prefix}/api/home/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    from: new Date(now.getTime() - 86400000).toISOString(), to: new Date(now.getTime() + 86400000).toISOString(), now: now.toISOString(),
  }) });
  assert.equal(eventResponse.status, 200);
  assert.ok((await eventResponse.json() as { events: Array<{ suggested_behavior_ids: string[] }> }).events.every(event => event.suggested_behavior_ids.length === 0), "Home has no judgment suggestions before a rule is bound");
  assert.doesNotMatch(page, /"dock_behaviors"/);

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
  assert.equal(bound.status, 200, await bound.clone().text());
  assert.equal((await bound.json() as { function_key: string }).function_key, SYSTEM_HOME_DOCK_FUNCTION_KEY);

  const reread = await webFetch(`${origin}${prefix}/api/home/dock-judgment`);
  assert.equal((await reread.json() as { function_key: string }).function_key, SYSTEM_HOME_DOCK_FUNCTION_KEY);

  const board = await (await webFetch(`${origin}${prefix}/api/board`)).json() as {
    function_scenes?: { home_dock: string | null };
  };
  assert.equal(board.function_scenes, undefined, "the page does not expose a second Functions binding snapshot");

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
    actions: [],
    action_scenes: [],
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


test("all builtin action declarations feed the Agent palette without maintaining a second tool list", async () => {
  const { BUILTIN_PLUGIN_CATALOG } = await import("../apps/workbench/src/plugin-catalog.ts");
  const directory = BUILTIN_PLUGIN_CATALOG.flatMap(entry => (entry.manifest.actions ?? []).map(definition => ({ ...definition,
    provider: { provider_id: entry.manifest.plugin_id, title: entry.manifest.name, kind: "plugin" as const }, availability: { available: true as const },
  })));
  const actual = liveHostFunctionAuthoringCatalog(directory);
  const expected = directory.filter(row => row.action.audiences.some(audience => audience === "agent" || audience === "mcp"));
  assert.ok(expected.length > 0);
  assert.equal(actual.behaviors.length, expected.length);
  for (const action of expected) assert.ok(actual.behaviors.some(row => row.action_ref?.capability_id === action.capability_id
    && row.action_ref.version === action.version && row.action_ref.provider_id === action.provider.provider_id), action.capability_id);
});
