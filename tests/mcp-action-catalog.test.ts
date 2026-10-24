import { assembleMcpCatalog } from "@molis-ai/molis-work-app-local-host";
import type { MolisWorkRuntimeConnection } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ActionDefinition, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { MCP_TOOLS, RUNTIME_MCP_TOOLS, molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { readMcpActionAccess } from "@molis-ai/molis-work-test-kit/local-host-http";
import { functionsActions } from "@molis-ai/molis-work-module-functions";
import { formActions, formManifest } from "@molis-ai/molis-work-plugin-form";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { pptManifest } from "@molis-ai/molis-work-plugin-ppt";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { serveTestHost } from "./fixtures/test-home.js";

const reference = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const functionViews: ActionView[] = Object.values(functionsActions).map(action => ({ ...action,
  provider: { provider_id: "system.functions", title: "Functions", kind: "system" }, availability: { available: true },
}));
const creativeViews: ActionView[] = [formManifest, pagesManifest, datasetManifest, pptManifest].flatMap(manifest => manifest.actions!.map(action => ({
  ...action, provider: { provider_id: manifest.plugin_id, plugin_id: manifest.plugin_id, kind: "plugin" as const, title: manifest.name }, availability: { available: true as const },
})));
const names = (catalog: { tools: Array<{ name: string }> }) => catalog.tools.map(tool => tool.name);

/** The person's grant, saved through the access settings of a Host that serves the Home for the length of the call (the MCP servers of the Home are closed). */
async function grantActions(home: string, connection: MolisWorkRuntimeConnection, actions: ActionDefinition[]) {
  assert.ok(connection.projectId);
  const clientId = "runtime:codex", projectId = connection.projectId;
  const served = await serveTestHost(null, { home });
  try {
    const offered = (await readMcpActionAccess(served.web, { clientId, projectId })).actions;
    const views = actions.map(action => {
      const view = offered.find(row => row.capability_id === action.capability_id && row.version === action.version);
      assert.ok(view, `${action.capability_id} is offered to ${clientId} in the project`);
      return view;
    });
    await served.grant(clientId, projectId, views);
  } finally { await served.close(); }
}

async function listToolNames(server: MolisWorkServer): Promise<string[]> {
  await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {} } });
  const listed = await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) as { result: { tools: Array<{ name: string }> } };
  return listed.result.tools.map(tool => tool.name);
}

test("apps/mcp ships only platform tools; a Runtime gets the connection tools", () => {
  const platform = MCP_TOOLS.map(tool => tool.name);
  assert.ok(platform.includes("molis_work_v1_context_resolve"));
  assert.ok(platform.includes("molis_work_v1_event_decide"));
  assert.equal(platform.some(name => name.startsWith("molis_work_v1_action_") || name.startsWith("molis_work_v1_functions_")), false);
  assert.deepEqual(RUNTIME_MCP_TOOLS.map(tool => tool.name).filter(name => !name.startsWith("molis_work_v1_context_")), ["molis_work_v1_project_delete"]);
});

test("the management decision tool names no actor: the host decides as the person on this machine", () => {
  const decide = MCP_TOOLS.find(tool => tool.name === "molis_work_v1_event_decide")!;
  const schema = decide.inputSchema as { properties: Record<string, unknown>; required: string[] };
  // The handler refuses an actor_id, so a schema that lists or requires one can never be satisfied.
  assert.equal(Object.hasOwn(schema.properties, "actor_id"), false);
  assert.equal(schema.required.includes("actor_id"), false);
  for (const field of schema.required) assert.ok(Object.hasOwn(schema.properties, field), `${field} is described by the schema`);
});

// RAC-345: the management Goals tools describe the very actions Goals registers: the same words and every business input field.
test("RAC-345 management Goals tools carry the description and input fields of the action Goals registers", () => {
  const pairs = [["molis_work_v1_initialize", goalsActions.initialize], ["molis_work_v1_goal_tree_decide", goalsActions.treeDecide],
    ["molis_work_v1_event_decide", goalsActions.decide]] as const;
  for (const [name, definition] of pairs) {
    const tool = MCP_TOOLS.find(item => item.name === name);
    assert.ok(tool, name);
    assert.equal(tool.description, definition.action.description, name);
    const fields = Object.keys((tool.inputSchema as { properties: Record<string, unknown> }).properties);
    for (const field of Object.keys(definition.action.input_schema.properties as Record<string, unknown>)) assert.ok(fields.includes(field), `${name} lists ${field}`);
  }
});

test("assembleMcpCatalog lists exactly the granted actions that are available now", () => {
  const actions = [...functionViews, ...creativeViews];
  const none = assembleMcpCatalog({ audience: "runtime", actions, actionToolName: molisWorkActionToolName });
  assert.deepEqual(names(none), RUNTIME_MCP_TOOLS.map(tool => tool.name), "no grant, no action tool");
  const invoke = functionViews.find(view => view.capability_id === functionsActions.invoke.capability_id)!;
  const formList = creativeViews.find(view => view.capability_id === formActions.list.capability_id)!;
  const granted = assembleMcpCatalog({ audience: "runtime", actions, actionToolName: molisWorkActionToolName,
    authorized_actions: [reference(invoke), reference(formList)] });
  assert.deepEqual(names(granted).filter(name => name.startsWith("molis_work_v1_action_")).sort(),
    [molisWorkActionToolName(invoke), molisWorkActionToolName(formList)].sort());
  assert.equal(granted.entries.find(entry => entry.definition.name === molisWorkActionToolName(formList))?.action?.provider.plugin_id, formManifest.plugin_id);
  for (const view of actions) assert.ok(granted.known_names.has(molisWorkActionToolName(view)), "every discovered action is a known name");
  assert.equal(names(granted).includes("molis_work_v1_event_decide"), false, "a Runtime never lists a management tool");
  assert.ok(granted.known_names.has("molis_work_v1_event_decide"));

  const offline = assembleMcpCatalog({ audience: "runtime", actionToolName: molisWorkActionToolName, authorized_actions: [reference(invoke)],
    actions: [{ ...invoke, availability: { available: false, code: "offline", reason: "offline" } }] });
  assert.equal(names(offline).includes(molisWorkActionToolName(invoke)), false, "an unavailable action is not listed even when granted");
  assert.ok(offline.known_names.has(molisWorkActionToolName(invoke)));
  assert.equal(offline.entries.filter(entry => entry.source === "action").length, 1, "W3-09-2-01: an exact grant retains the unavailable action for named dispatch");
  for (const wrong of [{ ...reference(invoke), provider_id: "other-provider" }, { ...reference(invoke), version: invoke.version + 1 }]) {
    const denied = assembleMcpCatalog({ audience: "runtime", actions: [invoke], authorized_actions: [wrong] });
    assert.equal(denied.entries.filter(entry => entry.source === "action").length, 0, "a different provider or version confers no named-call authority");
  }
});

test("Pages Forms Dataset PPT actions take no identity fields: the project comes from the connection", () => {
  for (const view of creativeViews) {
    const properties = view.action.input_schema.properties ?? {};
    for (const field of ["project_id", "project_id", "database_path", "actor_id"]) {
      assert.equal(Object.hasOwn(properties, field), false, `${view.capability_id}.${field}`);
    }
  }
});

test("runtime named call of a management platform tool is authority_denied, not unknown", async () => {
  const server = new MolisWorkServer("runtime");
  try {
    await assert.rejects(
      () => server.callTool("molis_work_v1_event_decide", { goal_id: "g", idempotency_key: "k", conclusion: "伪造批准" }),
      (error: unknown) => error instanceof Error && "code" in error && (error as { code: string }).code === "mcp.authority_denied",
    );
  } finally {
    await server.close();
  }
});

test("a new MCP connection restores a bound session before freezing project-scoped tools", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-form-mcp-reconnect-"));
  const servers: MolisWorkServer[] = [];
  t.after(async () => {
    for (const server of servers) await server.close();
    await rm(home, { recursive: true, force: true });
  });
  const formList = molisWorkActionToolName(formActions.list);
  const runtimeHost = {
    homeDirectory: home,
    runtimeContext: { runtime_id: "codex", stable_work_context_id: "form-reconnect", host_declares_stable: true },
    webBaseUrl: "http://127.0.0.1:4173",
  };
  const first = new MolisWorkServer("runtime", null, runtimeHost);
  servers.push(first);
  assert.equal((await listToolNames(first)).includes(formList), false);

  const created = await first.handleMessage({
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: {
      name: "molis_work_v1_context_create_and_bind",
      arguments: { display_name: "闸门重连", user_confirmed: true, binding_scope: "session", idempotency_key: "form-mcp-reconnect-1" },
    },
  }) as { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(created.result.isError, false, created.result.content[0]?.text);
  assert.equal((JSON.parse(created.result.content[0]?.text ?? "{}") as { status: string }).status, "bound", created.result.content[0]?.text);

  // Each MCP client is its own process in production; one Home has one Runtime owner per process, so the earlier server closes first.
  const firstConnection = first.runtimeConnection!;
  await first.close();
  await grantActions(home, firstConnection, [formActions.list]);
  const second = new MolisWorkServer("runtime", null, runtimeHost);
  servers.push(second);
  const secondNames = await listToolNames(second);
  assert.ok(secondNames.includes(formList), secondNames.join(","));
});
