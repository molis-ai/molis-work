import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { MolisWorkRuntimeConnection } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ActionDefinition, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { MCP_TOOLS, RUNTIME_MCP_TOOLS } from "@molis-ai/molis-work-app-mcp";
import { functionsActions } from "@molis-ai/molis-work-module-functions";
import { formActions, formManifest } from "@molis-ai/molis-work-plugin-form";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { pptManifest } from "@molis-ai/molis-work-plugin-ppt";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import { assembleMcpCatalog } from "../apps/local-host/src/mcp-catalog.ts";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

const reference = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const functionViews: ActionView[] = Object.values(functionsActions).map(action => ({ ...action,
  provider: { provider_id: "system.functions", title: "Functions", kind: "system" }, availability: { available: true },
}));
const creativeViews: ActionView[] = [formManifest, pagesManifest, datasetManifest, pptManifest].flatMap(manifest => manifest.actions!.map(action => ({
  ...action, provider: { provider_id: manifest.plugin_id, plugin_id: manifest.plugin_id, kind: "plugin" as const, title: manifest.name }, availability: { available: true as const },
})));
const names = (catalog: { tools: Array<{ name: string }> }) => catalog.tools.map(tool => tool.name);

async function grantActions(home: string, connection: MolisWorkRuntimeConnection, actions: ActionDefinition[]) {
  assert.ok(connection.projectId);
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  try {
    const caller = { actor_id: "runtime:codex", project_id: connection.projectId, audience: "mcp" as const, permissions: [] };
    const views = await host.inspectActions(caller, molisWorkHostProjectReference(connection));
    for (const action of actions) {
      const view = views.find(view => view.capability_id === action.capability_id && view.version === action.version)!;
      await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, caller.project_id, view, true));
    }
  } finally { await host.close(); }
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

test("assembleMcpCatalog lists exactly the granted actions that are available now", () => {
  const actions = [...functionViews, ...creativeViews];
  const none = assembleMcpCatalog({ audience: "runtime", actions, actionToolName: hostActionToolName });
  assert.deepEqual(names(none), RUNTIME_MCP_TOOLS.map(tool => tool.name), "no grant, no action tool");
  const invoke = functionViews.find(view => view.capability_id === functionsActions.invoke.capability_id)!;
  const formList = creativeViews.find(view => view.capability_id === formActions.list.capability_id)!;
  const granted = assembleMcpCatalog({ audience: "runtime", actions, actionToolName: hostActionToolName,
    authorized_actions: [reference(invoke), reference(formList)] });
  assert.deepEqual(names(granted).filter(name => name.startsWith("molis_work_v1_action_")).sort(),
    [hostActionToolName(invoke), hostActionToolName(formList)].sort());
  assert.equal(granted.entries.find(entry => entry.definition.name === hostActionToolName(formList))?.action?.provider.plugin_id, formManifest.plugin_id);
  for (const view of actions) assert.ok(granted.known_names.has(hostActionToolName(view)), "every discovered action is a known name");
  assert.equal(names(granted).includes("molis_work_v1_event_decide"), false, "a Runtime never lists a management tool");
  assert.ok(granted.known_names.has("molis_work_v1_event_decide"));

  const offline = assembleMcpCatalog({ audience: "runtime", actionToolName: hostActionToolName, authorized_actions: [reference(invoke)],
    actions: [{ ...invoke, availability: { available: false, code: "offline", reason: "offline" } }] });
  assert.equal(names(offline).includes(hostActionToolName(invoke)), false, "an unavailable action is not listed even when granted");
  assert.ok(offline.known_names.has(hostActionToolName(invoke)));
});

test("Pages Forms Dataset PPT actions take no identity fields: the project comes from the connection", () => {
  for (const view of creativeViews) {
    const properties = view.action.input_schema.properties ?? {};
    for (const field of ["project_id", "board_id", "database_path", "actor_id"]) {
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
  t.after(() => rm(home, { recursive: true, force: true }));
  const formList = hostActionToolName(formActions.list);
  const runtimeHost = {
    homeDirectory: home,
    runtimeContext: { runtime_id: "codex", stable_work_context_id: "form-reconnect", host_declares_stable: true },
    webBaseUrl: "http://127.0.0.1:4173",
  };
  const first = new MolisWorkServer("runtime", null, runtimeHost);
  t.after(() => first.close());
  assert.equal((await listToolNames(first)).includes(formList), false);

  const created = await first.handleMessage({
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: {
      name: "molis_work_v1_context_create_and_bind",
      arguments: { display_name: "闸门重连", actor_id: "user", user_confirmed: true, binding_scope: "session", idempotency_key: "form-mcp-reconnect-1" },
    },
  }) as { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(created.result.isError, false, created.result.content[0]?.text);
  assert.equal((JSON.parse(created.result.content[0]?.text ?? "{}") as { status: string }).status, "bound", created.result.content[0]?.text);

  // Each MCP client is its own process in production; one Home has one Runtime owner per process, so the earlier server closes first.
  const firstConnection = first.runtimeConnection!;
  await first.close();
  await grantActions(home, firstConnection, [formActions.list]);
  const second = new MolisWorkServer("runtime", null, runtimeHost);
  t.after(() => second.close());
  const secondNames = await listToolNames(second);
  assert.ok(secondNames.includes(formList), secondNames.join(","));
});
