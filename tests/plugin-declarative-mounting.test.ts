import assert from "node:assert/strict";
import test from "node:test";
import type {
  PluginAppContribution,
  PluginDefinition,
  PluginManifest,
  PluginRouteResponse,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  PLUGIN_ROUTE_PREFIX,
  PluginRouteRouter,
  PluginRuntime,
  PluginSupervisor,
  type PluginHostLifecycle,
} from "@molis-ai/molis-work-plugin-runtime";
import { UiViewRegistry } from "@molis-ai/molis-work-ui-host";

const GOALS = "io.molis.work.goals";
const CODING = "io.molis.work.coding";

function view(pluginId: string, viewId: string): UiContribution {
  return {
    descriptor: {
      contribution_id: `${pluginId}.${viewId}`,
      plugin_id: pluginId,
      kind: "primary-page",
      label: viewId,
      slots: [],
    },
    render: () => `<section data-view="${viewId}"></section>`,
  };
}

function manifestFor(input: {
  id: string;
  name: string;
  views: Array<{ view_id: string; slot: "navigator" | "stage" | "settings" | "island"; title: string; icon?: string; order?: number }>;
  commands?: Array<{ command_id: string; title: string; input_kinds: Array<"current" | "object" | "agent-session" | "artifacts">; opens_view_id: string }>;
  routes?: Array<{ route_id: string; method: "GET" | "POST"; path: string; permission?: string }>;
  permissions?: string[];
}): PluginManifest {
  return {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: input.id,
    version: "1.0.0",
    name: input.name,
    kind: "app",
    publisher: { publisher_id: "molis", signature: `${input.id}-binding` },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: (input.permissions ?? []).map((permission) => ({
      permission,
      required: true,
      reason: "测试权限",
    })),
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: {
      contributions: input.views.map((item) => `${input.id}.${item.view_id}`),
      views: input.views,
      ...(input.commands ? { commands: input.commands } : {}),
    },
    ...(input.routes ? { routes: input.routes } : {}),
  };
}

function definitionFor(
  manifest: PluginManifest,
  handlers: Record<string, () => PluginRouteResponse> = {},
): PluginDefinition {
  return {
    manifest,
    async start() {
      const contribution: PluginAppContribution = {
        kind: "app",
        views: (manifest.ui.views ?? []).map((item) => view(manifest.plugin_id, item.view_id)),
        ...(manifest.routes
          ? {
            routes: manifest.routes.map((route) => ({
              route_id: route.route_id,
              handle: () => handlers[route.route_id]?.() ?? { status: 200, body: { ok: route.route_id } },
            })),
          }
          : {}),
        ...(manifest.ui.commands
          ? {
            commandAvailability: (commandId: string) => commandId === "blocked"
              ? { available: false, reason: "还没有选择项目" }
              : { available: true },
            executeCommand: (commandId: string) => ({
              ref: { view_id: "session", object_id: commandId },
              title: commandId,
            }),
          }
          : {}),
      };
      return contribution;
    },
    async stop() {},
  };
}

const goalsManifest = manifestFor({
  id: GOALS,
  name: "Goals",
  views: [
    { view_id: "tree", slot: "navigator", title: "Goals", icon: "target", order: 10 },
    { view_id: "board", slot: "stage", title: "Goal board" },
  ],
});

const codingManifest = manifestFor({
  id: CODING,
  name: "Coding",
  permissions: ["agent:run"],
  views: [
    { view_id: "directory", slot: "navigator", title: "Coding", icon: "terminal", order: 20 },
    { view_id: "session", slot: "stage", title: "Coding" },
    { view_id: "prefs", slot: "settings", title: "Coding 设置" },
  ],
  commands: [
    { command_id: "open-report", title: "打开报告", input_kinds: ["current", "artifacts"], opens_view_id: "session" },
    { command_id: "blocked", title: "需要项目", input_kinds: ["current"], opens_view_id: "session" },
  ],
  routes: [
    { route_id: "coding.sessions", method: "GET", path: "/sessions" },
    { route_id: "coding.submit", method: "POST", path: "/sessions/:session_id/submit", permission: "agent:run" },
  ],
});

test("the shell's regions are derived from Manifests, in declared order", () => {
  const registry = new UiViewRegistry([
    { manifest: codingManifest, enabled: true },
    { manifest: goalsManifest, enabled: true },
  ]);

  assert.deepEqual(
    registry.slot("navigator").map((entry) => [entry.plugin_id, entry.title, entry.icon]),
    [[GOALS, "Goals", "target"], [CODING, "Coding", "terminal"]],
  );
  assert.deepEqual(
    registry.slot("stage").map((entry) => entry.contribution_id),
    [`${CODING}.session`, `${GOALS}.board`],
  );
  assert.deepEqual(registry.slot("settings").map((entry) => entry.plugin_id), [CODING]);
});

test("a disabled Plugin contributes nothing to the shell", () => {
  const registry = new UiViewRegistry([
    { manifest: goalsManifest, enabled: true },
    { manifest: codingManifest, enabled: false },
  ]);
  assert.deepEqual(registry.slot("navigator").map((entry) => entry.plugin_id), [GOALS]);
  assert.deepEqual(registry.slot("settings"), []);
  assert.equal(registry.view(CODING, "session"), null);
});

test("commands keep their unavailable reason instead of disappearing", () => {
  const registry = new UiViewRegistry([{ manifest: codingManifest, enabled: true }]);
  const commands = registry.commandsFor(
    "current",
    (_pluginId, commandId) => commandId === "blocked"
      ? { available: false, reason: "还没有选择项目" }
      : { available: true },
  );
  assert.deepEqual(commands.map((command) => [command.declaration.command_id, command.availability]), [
    ["open-report", { available: true }],
    ["blocked", { available: false, reason: "还没有选择项目" }],
  ]);
  assert.deepEqual(
    registry.commandsFor("artifacts", () => ({ available: true }))
      .map((command) => command.declaration.command_id),
    ["open-report"],
  );
});

test("declared routes are mounted under the Host prefix and undeclared paths fall through", async () => {
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  await supervisor.start([{ definition: definitionFor(codingManifest) }]);
  const router = new PluginRouteRouter(supervisor, [codingManifest]);

  const listed = await router.dispatch({
    method: "GET",
    pathname: `${PLUGIN_ROUTE_PREFIX}/${CODING}/sessions`,
    actor_id: "actor",
  });
  assert.deepEqual(listed, { status: 200, body: { ok: "coding.sessions" } });

  const submitted = await router.dispatch({
    method: "POST",
    pathname: `${PLUGIN_ROUTE_PREFIX}/${CODING}/sessions/abc/submit`,
    actor_id: "actor",
    granted: ["agent:run"],
    body: { task: "修一个 bug" },
  });
  assert.equal(submitted?.status, 200);

  assert.equal(
    await router.dispatch({
      method: "GET",
      pathname: `${PLUGIN_ROUTE_PREFIX}/${CODING}/not-declared`,
      actor_id: "actor",
    }),
    null,
    "未声明的路径应交还给宿主，而不是被插件吞掉",
  );
  assert.equal(
    await router.dispatch({ method: "GET", pathname: "/api/shelf", actor_id: "actor" }),
    null,
  );
});

test("a route refuses a caller without the permission it declared", async () => {
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  await supervisor.start([{ definition: definitionFor(codingManifest) }]);
  const router = new PluginRouteRouter(supervisor, [codingManifest]);

  const response = await router.dispatch({
    method: "POST",
    pathname: `${PLUGIN_ROUTE_PREFIX}/${CODING}/sessions/abc/submit`,
    actor_id: "actor",
    granted: [],
  });
  // W3-02-C: the router answers with the platform's codes and the sentences the action layer already uses for the same facts.
  assert.deepEqual(response, { status: 403, body: { error: "此能力的本地用户授权已失效，请检查插件权限和运行状态", code: "actions.forbidden" } });
});

test("a route on a Plugin that cannot start reports unavailable rather than crashing", async () => {
  const failing: PluginDefinition = {
    ...definitionFor(codingManifest),
    async start() {
      throw new Error("Coding 启动失败");
    },
  };
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  await supervisor.start([{ definition: failing }]);
  const router = new PluginRouteRouter(supervisor, [codingManifest]);

  const response = await router.dispatch({
    method: "GET",
    pathname: `${PLUGIN_ROUTE_PREFIX}/${CODING}/sessions`,
    actor_id: "actor",
  });
  assert.deepEqual(response, { status: 503, body: { error: "插件未运行或已停用", code: "actions.plugin_unavailable" } });
});

test("a route on a Plugin that is not enabled answers 403 actions.plugin_disabled, and a declared route with no handler is the Plugin's fault (500)", async () => {
  // The router asks its lifecycle only for the enablement epoch and the running instance.
  const router = (lifecycle: Pick<PluginHostLifecycle, "generation"> & Partial<Pick<PluginHostLifecycle, "ensureStarted">>) =>
    new PluginRouteRouter({ ensureStarted: async () => undefined, ...lifecycle } as PluginHostLifecycle, [codingManifest]);
  const input = { method: "GET", pathname: `${PLUGIN_ROUTE_PREFIX}/${CODING}/sessions`, actor_id: "actor" };
  assert.deepEqual(await router({ generation: () => undefined }).dispatch(input),
    { status: 403, body: { error: "此项目未启用该插件", code: "actions.plugin_disabled" } });
  const unbound = { install_id: "install", active: () => true, contribution: { kind: "app" as const, routes: [] } };
  assert.deepEqual(await router({ generation: () => 1, ensureStarted: async () => unbound }).dispatch(input),
    { status: 500, body: { error: "能力执行失败", code: "actions.execution_failed" } });
});

test("route parameters reach the handler as declared", async () => {
  let seen: Record<string, string> | null = null;
  const definition: PluginDefinition = {
    manifest: codingManifest,
    async start() {
      return {
        kind: "app",
        views: (codingManifest.ui.views ?? []).map((item) => view(CODING, item.view_id)),
        routes: (codingManifest.routes ?? []).map((route) => ({
          route_id: route.route_id,
          handle: (request) => {
            seen = { ...request.params };
            return { status: 200, body: { params: request.params } };
          },
        })),
        commandAvailability: () => ({ available: true }),
        executeCommand: () => ({ ref: { view_id: "session", object_id: "x" }, title: "x" }),
      } satisfies PluginAppContribution;
    },
    async stop() {},
  };
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  await supervisor.start([{ definition }]);
  const router = new PluginRouteRouter(supervisor, [codingManifest]);

  await router.dispatch({
    method: "POST",
    pathname: `${PLUGIN_ROUTE_PREFIX}/${CODING}/sessions/session-42/submit`,
    actor_id: "actor",
    granted: ["agent:run"],
  });
  assert.deepEqual(seen, { session_id: "session-42" });
});

test("the bundled catalog reproduces the shell's navigation exactly", async () => {
  const { railEntries, islandEntries, settingsEntries, PROJECT_SCOPED_PLUGIN_IDS, BUILTIN_PLUGIN_REGISTRY } =
    await import("@molis-ai/molis-work-app-workbench");

  // "functions" may still be saved on older projects; rule authoring moved to Capabilities, so it has no rail entry.
  const everything = ["jelly", "goals", "todo", "inbox", "feed", "shelf", "lingguang", "functions", "pages", "form", "dataset", "ppt", "alchemist", "artifacts"];
  assert.deepEqual(
    railEntries(everything).map((entry) => [entry.id, entry.label, entry.glyph]),
    [
      ["goals", "Goals", "target"],
      ["todo", "待办", "list"],
      ["inbox", "Inbox", "inbox"],
      ["jelly", "Jelly", "calendar"],
      ["feed", "Feed", "rss"],
      ["pages", "Pages", "note"],
      ["form", "Forms", "clipboard"],
      ["dataset", "Dataset", "database"],
      ["ppt", "PPT", "presentation"], // its own glyph; "image" belongs to 图片 (spec → 第三轮 · 图标)
      ["alchemist", "炼金术士", "zap"],
      ["artifacts", "成果", "package"],
    ],
    "侧栏轨只挂 Manifest 声明了 navigator 的插件；灵光在岛上，Shelf 是侧栏的格",
  );
  assert.deepEqual(
    islandEntries(everything).map((entry) => [entry.id, entry.label, entry.glyph]),
    [["lingguang", "灵光", "idea"]],
    "岛槽从 Manifest 推导，不手写 id 特例",
  );

  assert.deepEqual(
    railEntries(["goals", "pages"]).map((entry) => entry.id),
    ["goals", "pages"],
    "只显示已启用的插件，且保持声明顺序",
  );
  assert.deepEqual(railEntries([]), []);

  assert.deepEqual(
    settingsEntries(everything).map((entry) => entry.plugin_id),
    ["io.molis.work.shelf", "io.molis.work.goals"],
    "设置目录同样由 Manifest 决定",
  );

  // Coding and the workspace family joined the catalog; all of them are project
  // scoped like the rest, and Shelf stays personal. The six migrated Plugins
  // above still derive unchanged. The roster is asserted rather than derived on
  // purpose: adding a Plugin gives every project a new navigation entry, which
  // should be a decision somebody made, not something that arrives with a merge.
  assert.deepEqual([...PROJECT_SCOPED_PLUGIN_IDS].sort(),
    // The workspace Plugin was retired: browsing roots come from project settings actions (action-architecture migration).
    ["artifacts", "coding", "diff", "feed", "files", "git", "goals", "inbox", "schedule",
      "text-stats"]);
  assert.deepEqual(
    railEntries(["coding"]).map((entry) => [entry.id, entry.label, entry.glyph]),
    [["coding", "Coding", "code"]],
    "新插件的导航同样只由它自己的 Manifest 推导",
  );
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("shelf"), false, "个人插件不是项目可启用项");
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("functions"), false, "个人插件不是项目可启用项");
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("pages"), false, "个人插件不是项目可启用项");
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("form"), false, "个人插件不是项目可启用项");
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("dataset"), false, "个人插件不是项目可启用项");
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("ppt"), false, "个人插件不是项目可启用项");
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("lingguang"), false, "个人插件不是项目可启用项");
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("todo"), false, "个人插件不是项目可启用项");
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("alchemist"), false, "个人插件不是项目可启用项");
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("feed"), ["inbox"]);
});

test("a 常开插件 is shown in every project, even one that once hid it, and is neither offered nor removable", async () => {
  const { shownProjectPlugins, pluginMarketCards } = await import("@molis-ai/molis-work-app-workbench");
  // A project's list of hidden plugins leaves out a 常开 one (tests/security-invariants-always-on-records.test.ts), so a mark made before Shelf became
  // always on never reaches here; a hidden ordinary personal plugin stays hidden.
  const shown = shownProjectPlugins(["goals"], ["lingguang"]);
  assert.ok(shown.includes("shelf"));
  assert.equal(shown.includes("lingguang"), false);
  assert.equal(pluginMarketCards().some((card) => card.id === "shelf"), false, "nobody adds what is always on");
});

test("OPEN-PLACE-01 a plugin opens where its declarations put it: the work area if it has a stage, else its side tab", async () => {
  const { sideOpenedPlugins } = await import("@molis-ai/molis-work-app-workbench");
  const entry = (id: string, slots: string[], views: Array<{ view_id: string; slot: string }>) => ({
    project_plugin_id: id,
    manifest: { ui: { views } },
    workbench: { contributions: [{ descriptor: { surfaces: slots.map((target_slot_id) => ({ target_slot_id })) } }] },
  });
  // A side view and nothing else (not Shelf): its side tab. A stage and a side view: the stage, as before.
  assert.deepEqual(sideOpenedPlugins([
    entry("notes-sidecar", ["workbench.side"], [{ view_id: "pad", slot: "side" }]),
    entry("both", ["workbench.main", "workbench.side"], [{ view_id: "main", slot: "navigator" }, { view_id: "side", slot: "side" }]),
    entry("listed", ["workbench.directory", "workbench.side"], [{ view_id: "side", slot: "side" }]),
    entry("nowhere", [], []),
  ]), { "notes-sidecar": "plugin:notes-sidecar/pad" });
  // The shipped plugins: Shelf is the only one with nothing but a side view.
  assert.deepEqual(sideOpenedPlugins(), { shelf: "plugin:shelf/side" });
});

test("PG-060 a plugin's tab opens one object when a Manifest view of it accepts objects, and is named by its views", async () => {
  const { builtinPluginDirectory, clientPluginDirectory, pluginTabTitles } = await import("@molis-ai/molis-work-app-workbench");
  // What the page's scripts read is the directory's `accepts_objects` per plugin; the same projection serves a plugin installed at run time.
  const objectTabs = (directory: Parameters<typeof clientPluginDirectory>[0]) => clientPluginDirectory(directory).filter(entry => entry.accepts_objects).map(entry => entry.id);
  const entry = (id: string, views: Array<{ accepts_objects?: boolean }>) => ({ id, plugin_id: id, name: id, chosen: true,
    ui: { views: views.map((view, at) => ({ view_id: `v${at}`, slot: "stage" as const, title: id, ...view })) } });
  assert.deepEqual(objectTabs([entry("notes", [{}, { accepts_objects: true }]), entry("plain", [{}]), entry("bare", [])]), ["notes"]);
  // The shipped plugins: search, placement and side files open these as an object's tab (Artifacts is the platform's own).
  // Git and Diff take no object by id (no `molis-work:select-item`, no row to click), so they declare none.
  assert.deepEqual(new Set(objectTabs(builtinPluginDirectory())), new Set(["goals", "inbox", "feed", "pages", "lingguang", "workflows", "files", "coding"]));
  // The workbench writes no plugin's tab title: each is its navigator or island view's, in the page's language.
  const zh = pluginTabTitles(), en = pluginTabTitles(true);
  assert.deepEqual([zh.feed, zh.lingguang, zh.ppt, zh.workflows], ["Feed", "灵光", "PPT", "工作流程"]);
  assert.deepEqual([en.lingguang, en.workflows], ["Lingguang", "Workflows"]);
});

test("PG-060 RAC-606 the side panel's 打开 opens a Files file as the file's own tab, a plugin without object tabs at its record", async () => {
  const { CLIENT_SCRIPT, builtinPluginDirectory, clientPluginDirectory } = await import("@molis-ai/molis-work-app-workbench");
  // The side panel's file tab decides exactly as search does (specs/archive/side-panel P3): the initialization program reads the
  // object-tab list once from the page's plugin directory, so all three look at one list: Artifacts and every plugin declaring
  // accepts_objects. The script keeps no list by plugin.
  const objectTabs = clientPluginDirectory(builtinPluginDirectory()).filter(entry => entry.accepts_objects).map(entry => entry.id);
  assert.ok(CLIENT_SCRIPT.includes('document.querySelector("script[data-plugin-directory]")'), "the page's directory is read once, from the page");
  assert.ok(CLIENT_SCRIPT.includes("openRecord: (plugin, id, title) => itemTabs.includes(plugin)"),
    "the side panel's openRecord routes by the same object-tab list search uses");
  assert.doesNotMatch(CLIENT_SCRIPT, /\["artifacts",\s*"(?:goals|inbox|feed|pages|files)"/u, "no plugin's tab is written into the script as a list");
  assert.equal(objectTabs.includes("sessions"), false, "SC-4's retired Sessions surface does not return through the catalog");
  // Files declares `accepts_objects`: the file opens as its own tab (before W5-06's remainder the Files page opened with nothing chosen).
  // Todo opens its records by clicking its row: the record in its list, as search does.
  assert.ok(objectTabs.includes("files"));
  assert.ok(!objectTabs.includes("todo"));
  // `openItem` for the object's tab, `openPluginRecord` for a record-only plugin; no tab workspace yet: optional chaining
  // keeps it a no-op instead of throwing.
  assert.ok(CLIENT_SCRIPT.includes("? tabWorkspace?.openItem(plugin, id, title) : tabWorkspace?.openPluginRecord(plugin, id)"));
});
