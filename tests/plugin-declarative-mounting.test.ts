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
  views: Array<{ view_id: string; slot: "navigator" | "stage" | "settings"; title: string; icon?: string; order?: number }>;
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
  assert.deepEqual(response, { status: 403, body: { error: "plugin_route_permission_denied" } });
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
  assert.deepEqual(response, { status: 503, body: { error: "plugin_unavailable" } });
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
  const { railEntries, settingsEntries, PROJECT_SCOPED_PLUGIN_IDS, BUILTIN_PLUGIN_REGISTRY } =
    await import("@molis-ai/molis-work-app-workbench");

  const everything = ["goals", "sessions", "inbox", "feed", "shelf", "artifacts"];
  assert.deepEqual(
    railEntries(everything).map((entry) => [entry.id, entry.label, entry.glyph]),
    [
      ["goals", "Goals", "target"],
      ["sessions", "Sessions", "terminal"],
      ["inbox", "Inbox", "inbox"],
      ["feed", "Feed", "rss"],
      ["shelf", "Shelf", "library"],
      ["artifacts", "Artifacts", "package"],
    ],
    "从 Manifest 推导出的导航必须和原来写死的一模一样",
  );

  assert.deepEqual(
    railEntries(["goals", "shelf"]).map((entry) => entry.id),
    ["goals", "shelf"],
    "只显示已启用的插件，且保持声明顺序",
  );
  assert.deepEqual(railEntries([]), []);

  assert.deepEqual(
    settingsEntries(everything).map((entry) => entry.plugin_id),
    ["io.molis.work.shelf"],
    "设置目录同样由 Manifest 决定",
  );

  // Coding and the workspace family joined the catalog; all of them are project
  // scoped like the rest, and Shelf stays personal. The six migrated Plugins
  // above still derive unchanged. The roster is asserted rather than derived on
  // purpose: adding a Plugin gives every project a new navigation entry, which
  // should be a decision somebody made, not something that arrives with a merge.
  assert.deepEqual([...PROJECT_SCOPED_PLUGIN_IDS].sort(),
    ["artifacts", "coding", "diff", "feed", "files", "git", "goals", "inbox", "sessions",
      "text-stats", "workspace"]);
  assert.deepEqual(
    railEntries(["coding"]).map((entry) => [entry.id, entry.label, entry.glyph]),
    [["coding", "Coding", "code"]],
    "新插件的导航同样只由它自己的 Manifest 推导",
  );
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("shelf"), false, "个人插件不是项目可启用项");
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("feed"), ["inbox"]);
});
