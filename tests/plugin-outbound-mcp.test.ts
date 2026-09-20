import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  MCP_IDENTITY_FIELDS,
  mcpPublicToolName,
  parsePluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { MCP_TOOLS } from "@molis-ai/molis-work-app-mcp";
import {
  FUNCTIONS_MCP_EXPORTS,
  FUNCTIONS_PROJECT_PLUGIN_ID,
  functionsManifest,
  runFunctionsMcpTool,
} from "@molis-ai/molis-work-plugin-functions";
import {
  FORM_MCP_EXPORTS,
  FORM_PROJECT_PLUGIN_ID,
  formManifest,
  openFormStore,
  runFormMcpTool,
} from "@molis-ai/molis-work-plugin-form";
import {
  DATASET_MCP_EXPORTS,
  DATASET_PROJECT_PLUGIN_ID,
  datasetManifest,
  openDatasetStore,
  runDatasetMcpTool,
} from "@molis-ai/molis-work-plugin-dataset";
import {
  PPT_MCP_EXPORTS,
  PPT_PROJECT_PLUGIN_ID,
  openPptStore,
  pptManifest,
  runPptMcpTool,
} from "@molis-ai/molis-work-plugin-ppt";
import { createFormMcpAdapter } from "../apps/local-host/src/mcp-store-plugin-adapter.ts";
import { assertContributionMatchesManifest, PluginContributionError } from "@molis-ai/molis-work-plugin-runtime";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import {
  assembleMcpCatalog,
  BUILTIN_PLUGIN_MCP_SOURCES,
  listMcpSettingsEntries,
  type McpPluginExportSource,
} from "../apps/local-host/src/mcp-catalog.ts";
import {
  createNativeMcpPluginAdapters,
  dispatchNativeMcpPluginTool,
} from "../apps/local-host/src/mcp-native-plugins.ts";
import {
  parseMcpToolPreference,
  withMcpToolOverride,
} from "../apps/local-host/src/mcp-settings-store.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));
const INVOKE = mcpPublicToolName(FUNCTIONS_PROJECT_PLUGIN_ID, "invoke");
const LIST = mcpPublicToolName(FUNCTIONS_PROJECT_PLUGIN_ID, "list");
const DESCRIBE = mcpPublicToolName(FUNCTIONS_PROJECT_PLUGIN_ID, "describe");
const FORM_LIST = mcpPublicToolName(FORM_PROJECT_PLUGIN_ID, "list");
const FORM_CREATE = mcpPublicToolName(FORM_PROJECT_PLUGIN_ID, "create");
const DATASET_LIST = mcpPublicToolName(DATASET_PROJECT_PLUGIN_ID, "list");
const PPT_LIST = mcpPublicToolName(PPT_PROJECT_PLUGIN_ID, "list");

function names(catalog: { tools: Array<{ name: string }> }): string[] {
  return catalog.tools.map((tool) => tool.name);
}

function projectSource(overrides: Partial<McpPluginExportSource> = {}): McpPluginExportSource {
  return {
    plugin_id: "io.molis.work.coding",
    project_plugin_id: "coding",
    name: "Coding",
    personal: false,
    exports: [{
      tool_id: "search",
      description: "搜索代码",
      input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      effect: "read",
    }],
    ...overrides,
  };
}

async function listToolNames(server: MolisWorkServer): Promise<string[]> {
  await server.handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {} },
  });
  const listed = await server.handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  }) as { result: { tools: Array<{ name: string }> } };
  return listed.result.tools.map((tool) => tool.name);
}

test("apps/mcp no longer ships a static Functions tool catalog", () => {
  assert.equal(existsSync(join(ROOT, "../apps/mcp/src/functions-tools.ts")), false);
  assert.equal(MCP_TOOLS.some((tool) => tool.name.startsWith("molis_work_v1_functions_")), false);
  assert.ok(MCP_TOOLS.some((tool) => tool.name === "molis_work_v1_goal_list"));
  assert.ok(MCP_TOOLS.some((tool) => tool.name === "molis_work_v1_event_note"));
  assert.ok(MCP_TOOLS.some((tool) => tool.name === "molis_work_v1_context_resolve"));
});

test("Functions Manifest registers the three outbound tools without identity fields", () => {
  const parsed = parsePluginManifest(JSON.parse(JSON.stringify(functionsManifest)));
  assert.deepEqual(
    parsed.mcp_exports?.map((entry) => entry.tool_id),
    ["list", "describe", "invoke"],
  );
  assert.equal(parsed.agent?.mcp, undefined);
  for (const entry of FUNCTIONS_MCP_EXPORTS) {
    const properties = entry.input_schema.properties ?? {};
    for (const field of MCP_IDENTITY_FIELDS) {
      assert.equal(Object.hasOwn(properties, field), false, field);
    }
    assert.equal(mcpPublicToolName(FUNCTIONS_PROJECT_PLUGIN_ID, entry.tool_id).startsWith("molis_work_v1_functions_"), true);
  }
});

test("assembleMcpCatalog defaults Functions on, new plugin contributions off, and honors overrides", () => {
  const coding = projectSource();
  const empty = { version: 1 as const, overrides: {} };
  const runtime = assembleMcpCatalog({
    audience: "runtime",
    preference: empty,
    enabled_project_plugins: ["coding"],
    sources: [...BUILTIN_PLUGIN_MCP_SOURCES, coding],
  });
  assert.ok(names(runtime).includes(LIST));
  assert.ok(names(runtime).includes(DESCRIBE));
  assert.ok(names(runtime).includes(INVOKE));
  assert.ok(names(runtime).includes("molis_work_v1_goal_list"));
  assert.equal(names(runtime).includes("molis_work_v1_coding_search"), false);
  assert.equal(names(runtime).includes(FORM_LIST), false);
  assert.equal(names(runtime).includes(DATASET_LIST), false);
  assert.equal(names(runtime).includes(PPT_LIST), false);

  const enabledCoding = assembleMcpCatalog({
    audience: "runtime",
    preference: withMcpToolOverride(empty, "molis_work_v1_coding_search", true, false),
    enabled_project_plugins: ["coding"],
    sources: [...BUILTIN_PLUGIN_MCP_SOURCES, coding],
  });
  assert.ok(names(enabledCoding).includes("molis_work_v1_coding_search"));

  const disabledInvoke = assembleMcpCatalog({
    audience: "runtime",
    preference: withMcpToolOverride(empty, INVOKE, false, true),
    enabled_project_plugins: null,
  });
  assert.equal(names(disabledInvoke).includes(INVOKE), false);
  assert.ok(disabledInvoke.known_names.has(INVOKE));
  assert.ok(names(disabledInvoke).includes(LIST));
  assert.equal(names(runtime).includes("molis_work_v1_event_decide"), false);
  assert.ok(runtime.known_names.has("molis_work_v1_event_decide"));
});

test("runtime named call of a management platform tool is authority_denied, not unknown", async () => {
  const server = new MolisWorkServer("runtime");
  try {
    await assert.rejects(
      () => server.callTool("molis_work_v1_event_decide", {
        goal_id: "g",
        idempotency_key: "k",
        conclusion: "伪造批准",
      }),
      (error: unknown) => error instanceof Error
        && "code" in error
        && (error as { code: string }).code === "mcp.authority_denied",
    );
  } finally {
    await server.close();
  }
});

test("project-scoped contributions require the bound project to enable the plugin and cover grants", () => {
  const coding = projectSource({ required_permissions: ["artifact:read"] });
  const preference = { version: 1 as const, overrides: { molis_work_v1_coding_search: true } };
  const unbound = assembleMcpCatalog({
    audience: "runtime",
    preference,
    enabled_project_plugins: null,
    sources: [coding],
  });
  assert.equal(names(unbound).includes("molis_work_v1_coding_search"), false);

  const otherProject = assembleMcpCatalog({
    audience: "runtime",
    preference,
    enabled_project_plugins: ["goals"],
    sources: [coding],
  });
  assert.equal(names(otherProject).includes("molis_work_v1_coding_search"), false);

  const missingGrant = assembleMcpCatalog({
    audience: "runtime",
    preference,
    enabled_project_plugins: ["coding"],
    sources: [coding],
  });
  assert.equal(names(missingGrant).includes("molis_work_v1_coding_search"), false);

  const granted = assembleMcpCatalog({
    audience: "runtime",
    preference,
    enabled_project_plugins: ["coding"],
    sources: [{ ...coding, grants: ["artifact:read"] }],
  });
  assert.ok(names(granted).includes("molis_work_v1_coding_search"));
});

test("undeclared MCP handlers cannot redeem and unregistered tool_ids never run", () => {
  const pluginId = "io.molis.work.example";
  const manifest = parsePluginManifest({
    schema_version: 2,
    host_api_version: 2,
    plugin_id: pluginId,
    version: "1.0.0",
    name: "Example",
    kind: "app",
    publisher: { publisher_id: "molis", signature: "example-binding" },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: {
      contributions: [`${pluginId}.main`],
      views: [{ view_id: "main", slot: "stage", title: "Main" }],
    },
    mcp_exports: [{
      tool_id: "list",
      description: "列出",
      input_schema: { type: "object" },
      effect: "read",
    }],
  });
  const view = {
    descriptor: {
      contribution_id: `${pluginId}.main`,
      plugin_id: pluginId,
      kind: "primary-page" as const,
      label: "Main",
      slots: [],
    },
    render: () => "",
  };
  assert.throws(
    () => assertContributionMatchesManifest(manifest, { kind: "app", views: [view] }),
    (error: unknown) => error instanceof PluginContributionError
      && error.code === "plugin_contribution_unredeemed"
      && error.message.includes("声明的 MCP list 没有兑现"),
  );
  assert.throws(
    () => assertContributionMatchesManifest(manifest, {
      kind: "app",
      views: [view],
      mcp: [
        { tool_id: "list", handle: () => "" },
        { tool_id: "secret", handle: () => "should-not-run" },
      ],
    }),
    (error: unknown) => error instanceof PluginContributionError
      && error.message.includes("MCP secret 没有在 Manifest 里声明"),
  );
  assertContributionMatchesManifest(manifest, {
    kind: "app",
    views: [view],
    mcp: [{ tool_id: "list", handle: () => "ok" }],
  });
  assert.throws(
    () => runFunctionsMcpTool({
      listPublished() { return []; },
      describePublished() { throw new Error("should-not-run"); },
      invokePublished() { throw new Error("should-not-run"); },
    } as never, { tool_id: "secret", arguments: {} }),
    /未登记的 Functions MCP/,
  );
});

test("settings entries expose platform and Functions groups without writing plugin private store", () => {
  const rows = listMcpSettingsEntries({ version: 1, overrides: { [INVOKE]: false } });
  const invoke = rows.find((row) => row.definition.name === INVOKE);
  const goalList = rows.find((row) => row.definition.name === "molis_work_v1_goal_list");
  assert.equal(invoke?.enabled, false);
  assert.equal(invoke?.default_enabled, true);
  assert.equal(invoke?.group_id, "functions");
  assert.equal(goalList?.enabled, true);
  assert.equal(goalList?.group_id, "platform-goals");
  assert.deepEqual(parseMcpToolPreference({ version: 1, overrides: { nope: true, [INVOKE]: false } }).overrides, {
    [INVOKE]: false,
  });
});

test("turning a method off hides it from new MCP connections and refuses a named call", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-mcp-catalog-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const host = {
    homeDirectory: home,
    runtimeContext: { runtime_id: "codex", stable_work_context_id: "outbound-mcp", host_declares_stable: true },
    webBaseUrl: "http://127.0.0.1:4173",
  };
  const open = new MolisWorkServer("runtime", null, host);
  t.after(() => open.close());
  const before = await listToolNames(open);
  assert.ok(before.includes(INVOKE));
  assert.ok(before.includes("molis_work_v1_goal_list"));

  await mkdir(join(home, "config"), { recursive: true });
  await writeFile(join(home, "config", "mcp-tools.json"), JSON.stringify({
    version: 1,
    overrides: { [INVOKE]: false },
  }));

  const frozen = await open.handleMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/list",
    params: {},
  }) as { result: { tools: Array<{ name: string }> } };
  assert.ok(frozen.result.tools.some((tool) => tool.name === INVOKE));

  const closed = new MolisWorkServer("runtime", null, host);
  t.after(() => closed.close());
  const after = await listToolNames(closed);
  assert.equal(after.includes(INVOKE), false);
  assert.ok(after.includes(LIST));
  const refused = await closed.handleMessage({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: INVOKE, arguments: { function_key: "x", input: "y" } },
  }) as { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(refused.result.isError, true);
  assert.match(refused.result.content[0]?.text ?? "", /"code":"mcp\.tool_disabled"/);
  const unknown = await closed.handleMessage({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "molis_work_v1_functions_secret", arguments: {} },
  }) as { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(unknown.result.isError, true);
  assert.match(unknown.result.content[0]?.text ?? "", /"code":"mcp\.tool_unknown"/);
});

test("settings MCP page and Home preference toggle the same catalog", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-mcp-settings-"));
  const token = "plugin-outbound-mcp-token-012345678901";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(homeDirectory, { recursive: true, force: true });
  });
  const page = await (await fetch(`${origin}/settings/mcp`)).text();
  assert.match(page, /data-mcp-settings/);
  assert.match(page, /data-mcp-tool="molis_work_v1_functions_invoke"/);
  assert.match(page, /data-mcp-group="functions"/);
  assert.match(page, /href="\/settings\/mcp"/);
  assert.doesNotMatch(page, /data-settings-panel="functions"/);

  const headers = {
    origin,
    "content-type": "application/json",
    "x-molis-work-control-token": token,
    "x-molis-work-idempotency-key": `mcp-settings-${Date.now()}`,
  };
  const written = await fetch(`${origin}/api/settings/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: INVOKE, enabled: false }),
  });
  assert.equal(written.status, 200);
  const after = await (await fetch(`${origin}/settings/mcp`)).text();
  assert.match(after, /data-mcp-tool="molis_work_v1_functions_invoke"/);
  assert.doesNotMatch(after, /data-mcp-tool="molis_work_v1_functions_invoke"[^>]*checked/);
});

test("Host dispatches plugin tools by plugin_id and tool_id, not public names", async () => {
  const seen: string[] = [];
  const adapters = new Map([["io.molis.work.example", {
    plugin_id: "io.molis.work.example",
    async handle(request: { tool_id: string }) {
      seen.push(request.tool_id);
      return JSON.stringify({ tool_id: request.tool_id });
    },
  }]]);
  const result = JSON.parse(await dispatchNativeMcpPluginTool(
    adapters,
    {
      source: "plugin",
      plugin_id: "io.molis.work.example",
      tool_id: "search",
      definition: { name: "molis_work_v1_example_search" },
    },
    { query: "x" },
    { runtimeSessionId: null, runtimeSessionIdSource: null },
  )) as { tool_id: string };
  assert.equal(seen[0], "search");
  assert.equal(result.tool_id, "search");
});

test("Host refuses a catalogued plugin that has no native adapter", async () => {
  await assert.rejects(
    () => dispatchNativeMcpPluginTool(
      new Map(),
      {
        source: "plugin",
        plugin_id: "io.molis.work.coding",
        tool_id: "search",
        definition: { name: "molis_work_v1_coding_search" },
      },
      {},
      { runtimeSessionId: null, runtimeSessionIdSource: null },
    ),
    (error: unknown) => error instanceof Error
      && "code" in error
      && (error as { code: string }).code === "mcp.tool_unknown"
      && error.message.includes("io.molis.work.coding"),
  );
});

test("built-in plugin MCP sources all have Host adapters and callTool does not branch on Functions public names", () => {
  const adapters = createNativeMcpPluginAdapters({
    requireHost: () => {
      throw new Error("unused");
    },
  });
  for (const source of BUILTIN_PLUGIN_MCP_SOURCES) {
    assert.ok(adapters.has(source.plugin_id), source.plugin_id);
  }
  const serverSource = readFileSync(join(ROOT, "../apps/local-host/src/mcp-server.ts"), "utf8");
  assert.equal(serverSource.includes("molis_work_v1_functions_"), false);
  assert.equal(serverSource.includes("dispatchNativeMcpPluginTool"), true);
});

test("Forms Dataset PPT Manifests register store tools without identity fields", () => {
  for (const [manifest, exports, slug] of [
    [formManifest, FORM_MCP_EXPORTS, "form"],
    [datasetManifest, DATASET_MCP_EXPORTS, "dataset"],
    [pptManifest, PPT_MCP_EXPORTS, "ppt"],
  ] as const) {
    const parsed = parsePluginManifest(JSON.parse(JSON.stringify(manifest)));
    assert.deepEqual(parsed.mcp_exports?.map((entry) => entry.tool_id), exports.map((entry) => entry.tool_id));
    for (const entry of exports) {
      const properties = entry.input_schema.properties ?? {};
      for (const field of MCP_IDENTITY_FIELDS) {
        assert.equal(Object.hasOwn(properties, field), false, `${slug}.${entry.tool_id}.${field}`);
      }
      assert.equal(Object.hasOwn(properties, "project_id"), false, `${slug}.${entry.tool_id}.project_id`);
      assert.equal(entry.scope, undefined);
      assert.equal(mcpPublicToolName(slug, entry.tool_id).startsWith(`molis_work_v1_${slug}_`), true);
    }
  }
});

test("personal project-scoped tools stay off by default, need a bound project, and skip the enable list", () => {
  const empty = { version: 1 as const, overrides: {} };
  const enabled = withMcpToolOverride(empty, FORM_LIST, true, false);
  const unbound = assembleMcpCatalog({
    audience: "runtime",
    preference: enabled,
    enabled_project_plugins: null,
  });
  assert.equal(names(unbound).includes(FORM_LIST), false);
  assert.ok(unbound.known_names.has(FORM_LIST));

  const boundEmptyEnablement = assembleMcpCatalog({
    audience: "runtime",
    preference: enabled,
    enabled_project_plugins: [],
  });
  assert.ok(names(boundEmptyEnablement).includes(FORM_LIST));

  const stillOff = assembleMcpCatalog({
    audience: "runtime",
    preference: empty,
    enabled_project_plugins: ["form"],
  });
  assert.equal(names(stillOff).includes(FORM_LIST), false);
  assert.equal(names(stillOff).includes(DATASET_LIST), false);
  assert.equal(names(stillOff).includes(PPT_LIST), false);
});

test("Form Dataset PPT MCP handlers partition records by injected project_id", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-creative-mcp-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const alpha = "project-alpha";
  const beta = "project-beta";

  const forms = openFormStore(home);
  try {
    const created = JSON.parse(runFormMcpTool(forms, { tool_id: "create", arguments: { title: "项目问卷" } }, alpha)) as {
      form: { id: string; project_id: string; title: string };
    };
    assert.equal(created.form.project_id, alpha);
    const listedAlpha = JSON.parse(runFormMcpTool(forms, { tool_id: "list", arguments: {} }, alpha)) as {
      forms: Array<{ id: string }>;
    };
    const listedBeta = JSON.parse(runFormMcpTool(forms, { tool_id: "list", arguments: {} }, beta)) as {
      forms: Array<{ id: string }>;
    };
    assert.deepEqual(listedAlpha.forms.map((item) => item.id), [created.form.id]);
    assert.deepEqual(listedBeta.forms, []);
    assert.throws(
      () => runFormMcpTool(forms, { tool_id: "secret", arguments: {} }, alpha),
      /未登记的 Forms MCP/,
    );
  } finally {
    forms.close();
  }

  const datasets = openDatasetStore(home);
  try {
    JSON.parse(runDatasetMcpTool(datasets, { tool_id: "create", arguments: { title: "项目表" } }, alpha));
    const listed = JSON.parse(runDatasetMcpTool(datasets, { tool_id: "list", arguments: {} }, beta)) as {
      datasets: unknown[];
    };
    assert.deepEqual(listed.datasets, []);
  } finally {
    datasets.close();
  }

  const presentations = openPptStore(home);
  try {
    JSON.parse(runPptMcpTool(presentations, { tool_id: "create", arguments: { title: "项目稿" } }, alpha));
    const listed = JSON.parse(runPptMcpTool(presentations, { tool_id: "list", arguments: {} }, beta)) as {
      presentations: unknown[];
    };
    assert.deepEqual(listed.presentations, []);
  } finally {
    presentations.close();
  }
});

test("Form MCP adapter injects the bound project and refuses an unbound call", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-form-mcp-adapter-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const host = {
    homeDirectory: home,
    runtimeContext: { runtime_id: "codex", stable_work_context_id: "form-mcp", host_declares_stable: true },
  };
  const context = { runtimeSessionId: null as const, runtimeSessionIdSource: null as const };
  const unbound = createFormMcpAdapter({
    requireHost: () => host,
    boundProjectId: () => null,
  });
  await assert.rejects(
    () => unbound.handle({ tool_id: "list", arguments: {} }, context),
    (error: unknown) => error instanceof Error
      && "code" in error
      && (error as { code: string }).code === "mcp.connection_incomplete",
  );

  const adapter = createFormMcpAdapter({
    requireHost: () => host,
    boundProjectId: () => "project-bound",
  });
  const created = JSON.parse(await adapter.handle({ tool_id: "create", arguments: { title: "绑定问卷" } }, context)) as {
    form: { title: string; project_id: string };
  };
  assert.equal(created.form.title, "绑定问卷");
  assert.equal(created.form.project_id, "project-bound");
  const listed = JSON.parse(await adapter.handle({ tool_id: "list", arguments: {} }, context)) as {
    forms: Array<{ title: string }>;
  };
  assert.deepEqual(listed.forms.map((item) => item.title), ["绑定问卷"]);
});

test("settings MCP page lists Forms Dataset PPT groups off by default", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-mcp-creative-settings-"));
  const token = "plugin-outbound-mcp-creative-token-012345";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(homeDirectory, { recursive: true, force: true });
  });
  const page = await (await fetch(`${origin}/settings/mcp`)).text();
  assert.match(page, /data-mcp-group="form"/);
  assert.match(page, /data-mcp-group="dataset"/);
  assert.match(page, /data-mcp-group="ppt"/);
  assert.match(page, /data-mcp-tool="molis_work_v1_form_list"/);
  assert.doesNotMatch(page, /data-mcp-tool="molis_work_v1_form_list"[^>]*checked/);
});

test("enabled Form tools appear on a new bound connection and stay hidden while unbound", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-form-mcp-bound-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, "config"), { recursive: true });
  await writeFile(join(home, "config", "mcp-tools.json"), JSON.stringify({
    version: 1,
    overrides: { [FORM_LIST]: true, [FORM_CREATE]: true },
  }));
  const runtimeHost = {
    homeDirectory: home,
    runtimeContext: { runtime_id: "codex", stable_work_context_id: "form-bound", host_declares_stable: true },
    webBaseUrl: "http://127.0.0.1:4173",
  };
  const unbound = new MolisWorkServer("runtime", null, runtimeHost);
  t.after(() => unbound.close());
  const unboundNames = await listToolNames(unbound);
  assert.equal(unboundNames.includes(FORM_LIST), false);
  assert.ok(unboundNames.includes(LIST));

  const bound = new MolisWorkServer("runtime", {
    databasePath: join(home, "project.db"),
    boardId: "board-form-mcp",
    projectId: "project-form-mcp",
    webBaseUrl: "http://127.0.0.1:4173",
  }, runtimeHost);
  t.after(() => bound.close());
  const boundNames = await listToolNames(bound);
  assert.ok(boundNames.includes(FORM_LIST));
  assert.ok(boundNames.includes(FORM_CREATE));
  const created = await bound.handleMessage({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: { name: FORM_CREATE, arguments: { title: "MCP 问卷" } },
  }) as { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(created.result.isError, false, created.result.content[0]?.text);
  const listed = await bound.handleMessage({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: FORM_LIST, arguments: {} },
  }) as { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(listed.result.isError, false, listed.result.content[0]?.text);
  const payload = JSON.parse(listed.result.content[0]?.text ?? "{}") as { forms: Array<{ title: string; project_id: string }> };
  assert.deepEqual(payload.forms.map((item) => item.title), ["MCP 问卷"]);
  assert.equal(payload.forms[0]?.project_id, "project-form-mcp");
});

test("a new MCP connection restores a bound session before freezing project-scoped tools", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-form-mcp-reconnect-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, "config"), { recursive: true });
  await writeFile(join(home, "config", "mcp-tools.json"), JSON.stringify({
    version: 1,
    overrides: { [FORM_LIST]: true },
  }));
  const runtimeHost = {
    homeDirectory: home,
    runtimeContext: { runtime_id: "codex", stable_work_context_id: "form-reconnect", host_declares_stable: true },
    webBaseUrl: "http://127.0.0.1:4173",
  };
  const first = new MolisWorkServer("runtime", null, runtimeHost);
  t.after(() => first.close());
  const firstNames = await listToolNames(first);
  assert.equal(firstNames.includes(FORM_LIST), false);

  const created = await first.handleMessage({
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: {
      name: "molis_work_v1_context_create_and_bind",
      arguments: {
        display_name: "闸门重连",
        actor_id: "user",
        user_confirmed: true,
        binding_scope: "session",
        idempotency_key: "form-mcp-reconnect-1",
      },
    },
  }) as { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(created.result.isError, false, created.result.content[0]?.text);
  const createdPayload = JSON.parse(created.result.content[0]?.text ?? "{}") as { status: string };
  assert.equal(createdPayload.status, "bound", created.result.content[0]?.text);

  const second = new MolisWorkServer("runtime", null, runtimeHost);
  t.after(() => second.close());
  const secondNames = await listToolNames(second);
  assert.ok(secondNames.includes(FORM_LIST), secondNames.join(","));
});
