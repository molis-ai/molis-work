import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  FEED_CAPTURE_SCENE_ID,
  FEED_REAUTH_BEHAVIOR_ID,
  HOME_ASK_BEHAVIOR_ID,
  HOME_CONTINUE_BEHAVIOR_ID,
  HOME_DOCK_SCENE_ID,
  HOME_TALK_BEHAVIOR_ID,
  INBOX_DONE_BEHAVIOR_ID,
  SYSTEM_HOME_DOCK_FUNCTION_KEY,
  SYSTEM_INBOX_ADMIT_FUNCTION_KEY,
  filterSuggestedBehaviorIds,
  visibleDockBehaviorIds,
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
import { assembleHostBehaviorCatalog } from "../apps/local-host/src/behavior-catalog.ts";
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
  assert.equal(ids.includes(HOME_TALK_BEHAVIOR_ID), false);
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
      assert.equal(store.requirePublishedByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY).status, "published");
    } finally {
      store.close();
    }
  });
});

test("Feed and Inbox declare scenes without naming the Functions plugin implementation", () => {
  assert.equal(feedManifest.function_scenes?.[0]?.scene_id, FEED_CAPTURE_SCENE_ID);
  assert.ok(feedManifest.requires?.some((row) => row.capability_id === "functions.evaluate"));
  assert.equal(inboxManifest.function_scenes?.[0]?.scene_id, "inbox.next");
  assert.equal(inboxManifest.plugin_id.includes("functions"), false);
});

test("Feed, Inbox and home do not import the Functions plugin implementation", async () => {
  const files = [
    "plugins/native/feed/src/application.ts",
    "plugins/native/feed/src/application-ports.ts",
    "plugins/native/feed/src/manifest.ts",
    "plugins/native/inbox/src/manifest.ts",
    "plugins/native/inbox/src/projection.ts",
    "plugins/native/inbox/src/ui.ts",
    "plugins/native/inbox/src/route-handlers.ts",
    "plugins/native/inbox/src/routes.ts",
    "apps/workbench/src/home-flow.ts",
    "apps/workbench/src/inbox-projection-ui.ts",
    "apps/workbench/src/scripts/client/project-home.ts",
    "apps/workbench/src/scripts/client/navigation-inbox.ts",
    "apps/local-host/src/home-dock-http.ts",
  ];
  for (const relative of files) {
    const source = await readFile(join(ROOT, "..", relative), "utf8");
    assert.equal(
      source.includes("@molis-ai/molis-work-plugin-functions"),
      false,
      relative,
    );
  }
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

  const page = await (await webFetch(`${origin}${prefix}/`)).text();
  assert.match(page, /"function_scenes"/);
  assert.match(page, /"home_dock":null/);
  const homeClient = await readFile(join(ROOT, "..", "apps/workbench/src/scripts/client/project-home.ts"), "utf8");
  assert.match(homeClient, /data-home-dock-judgment/);

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

test("FunctionsError still surfaces from the Module", () => {
  assert.equal(new FunctionsError("functions.invalid", "x").code, "functions.invalid");
});
