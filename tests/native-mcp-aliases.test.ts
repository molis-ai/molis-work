import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { bindActionClient, type ActionCallContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { formManifest } from "@molis-ai/molis-work-plugin-form";
import { datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { pptManifest } from "@molis-ai/molis-work-plugin-ppt";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { cogniaManifest, cogniaActions, COGNIA_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-cognia";
import { jellyManifest, jellyActions } from "@molis-ai/molis-work-plugin-jelly";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant, writeMcpToolPreference } from "../apps/local-host/src/mcp-settings-store.js";
import { inspectMcpExports } from "../packages/contracts/src/platform/plugin-mcp.js";

const toolName = (manifest: PluginManifest, id: string) => `molis_work_v1_${manifest.plugin_id.split(".").at(-1)}_${id}`;

test("six legacy plugin MCP families use the production shared service, exact grants and original composite semantics", { timeout: 90_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "native-mcp-aliases-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Native aliases", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  let enter: (() => void) | undefined, release: (() => void) | undefined, barrier: Promise<void> | undefined;
  let modelCalls = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async () => {
    modelCalls++; if (barrier) { enter!(); await barrier; } return "Translated paragraph";
  } });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  const clients: Client[] = [];
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`;
  const caller: ActionCallContext = { actor_id: "runtime:native-alias", project_id: project.project_id, audience: "mcp", permissions: [] };
  const catalog = await host.inspectActions(caller, ref);
  const choices: [PluginManifest, string[]][] = [[formManifest, ["create", "get"]], [datasetManifest, ["create", "get"]],
    [pptManifest, ["create", "get"]], [pagesManifest, ["create", "get", "list", "ai"]],
    [cogniaManifest, ["search", "read"]], [jellyManifest, ["create_item", "get_item", "list_categories"]]];
  const connect = async (runtime: string, projectId = project.project_id) => {
    const session = `${runtime}-${projectId}`;
    await withCatalog({ homeDirectory: home }, c => c.bindRuntimeContext({ context: { runtime_id: runtime, stable_work_context_id: session, host_declares_stable: true },
      project_id: projectId, actor_id: "user", user_confirmed: true }));
    const client = new Client({ name: "model-provided-name", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_RUNTIME_ID: runtime,
      MOLIS_WORK_WORK_CONTEXT_ID: session, MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    }, stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    await client.connect(transport).catch(error => { throw new Error(String(error) + errors); }); return client;
  };
  const grants = async (views: ActionView[], enabled: boolean) => {
    for (const view of views) await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, view.action.scope === "home" ? null : project.project_id, view, enabled));
  };
  const viewsFor = (manifest: PluginManifest, id: string) => manifest.mcp_exports!.find(tool => tool.tool_id === id)!.required_actions!.map(reference => {
    const view = catalog.find(view => view.capability_id === reference.capability_id && view.version === reference.version && view.provider.plugin_id === manifest.plugin_id);
    assert.ok(view, `${manifest.plugin_id}:${reference.capability_id}`); return view;
  });
  try {
    const sdk = await connect("native-alias");
    const names = async () => (await sdk.listTools()).tools.map(tool => tool.name);
    const call = async (manifest: PluginManifest, id: string, args: Record<string, unknown>) => {
      const result = await sdk.callTool({ name: toolName(manifest, id), arguments: args });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      return JSON.parse((result.content as { text: string }[])[0]!.text);
    };
    const overrides = Object.fromEntries(choices.flatMap(([manifest, ids]) => ids.map(id => [toolName(manifest, id), true])));
    await writeMcpToolPreference(home, overrides);
    const ungranted = await names();
    for (const [manifest, ids] of choices) for (const id of ids) assert.equal(ungranted.includes(toolName(manifest, id)), false, "switches grant no authority");
    for (const [manifest, ids] of choices) for (const id of ids) await grants(viewsFor(manifest, id), true);
    const allowed = await names();
    for (const [manifest, ids] of choices) for (const id of ids) assert.ok(allowed.includes(toolName(manifest, id)), toolName(manifest, id));
    for (const [manifest, key] of [[formManifest, "form"], [datasetManifest, "dataset"], [pptManifest, "presentation"], [pagesManifest, "document"]] as const) {
      const created = await call(manifest, "create", { title: `${key} from legacy MCP` });
      const record = created[key]; assert.ok(record?.id, JSON.stringify(created));
      const read = await call(manifest, "get", { id: record.id }); assert.equal(read[key].title, record.title);
      assert.equal(read[key].project_id, project.project_id);
      const canonical = await sdk.callTool({ name: hostActionToolName(viewsFor(manifest, "get")[0]!), arguments: { id: record.id } });
      assert.notEqual(canonical.isError, true); assert.equal((canonical.structuredContent as Record<string, { id: string }>)[key]!.id, record.id);
    }
    const owner = bindActionClient(host.homeActionClient(), () => ({ actor_id: "user", audience: "user", project_id: null, permissions: COGNIA_ACTION_PERMISSIONS }));
    const material = (await owner.invoke(cogniaActions.createMaterial, { title: "Shared reference", body: "Exact native evidence" })).material;
    const found = await call(cogniaManifest, "search", { query: "Exact native" }); assert.equal(found.materials[0].id, material.id);
    assert.equal((await call(cogniaManifest, "read", { id: material.id, revision: 1 })).material.body, "Exact native evidence");
    const item = (await call(jellyManifest, "create_item", { item: { title: "From MCP", start_date: "2026-09-25" } })).state.items[0];
    assert.equal((await call(jellyManifest, "get_item", { id: item.id })).item.title, "From MCP");
    const category = catalog.find(view => view.capability_id === jellyActions.categories.capability_id)!;
    await grants([category], false);
    assert.equal((await names()).includes(toolName(jellyManifest, "create_item")), false, "legacy automatic CAS requires its read action");
    assert.equal((await sdk.callTool({ name: toolName(jellyManifest, "create_item"), arguments: { item: { title: "denied", start_date: "2026-09-25" } } })).isError, true);
    await grants([category], true);
    const list = await call(pagesManifest, "list", {}); assert.ok(Array.isArray(list.templates));
    const before = list.documents.length;
    const started = new Promise<void>(resolve => { enter = resolve; }); barrier = new Promise<void>(resolve => { release = resolve; });
    const pending = sdk.callTool({ name: toolName(pagesManifest, "ai"), arguments: { id: list.documents[0].id, command: "translate_new", text: "Original paragraph" } });
    await Promise.race([started, pending.then(result => { throw new Error(`Model did not start: ${JSON.stringify(result)}`); })]);
    await grants(viewsFor(pagesManifest, "create"), false); release!();
    const denied = await pending; barrier = undefined;
    assert.equal(denied.isError, true); assert.equal(modelCalls, 1);
    assert.equal((await call(pagesManifest, "list", {})).documents.length, before, "revocation between composition steps prevents creation");
    assert.equal((await names()).includes(toolName(pagesManifest, "ai")), false);
    await grants(viewsFor(pagesManifest, "create"), true);
    const translated = await call(pagesManifest, "ai", { id: list.documents[0].id, command: "translate_new", text: "Original paragraph" });
    assert.ok(translated.document.title.endsWith("翻译")); assert.equal(modelCalls, 2);
    assert.equal((await call(pagesManifest, "list", {})).documents.length, before + 1);
    const outsider = await connect("outsider");
    const outsiderNames = (await outsider.listTools()).tools.map(tool => tool.name);
    assert.ok(choices.every(([manifest, ids]) => ids.every(id => !outsiderNames.includes(toolName(manifest, id)))));
    const otherProject = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Other", actor_id: "user" }));
    const otherScope = await connect("native-alias", otherProject.project_id);
    assert.equal((await otherScope.listTools()).tools.some(tool => tool.name === toolName(formManifest, "get")), false);
    await host.closeProject(ref);
    assert.equal((await call(pagesManifest, "list", {})).documents.length, before + 1, "reopening preserves the original records");
  } finally {
    release?.(); await Promise.all(clients.map(client => client.close())); await new Promise<void>(resolve => server.close(() => resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});

test("legacy export dependencies require exact nonempty references, and existing underscore names remain valid", () => {
  const entry = { tool_id: "old_name", description: "Old spelling", effect: "read" as const, input_schema: { type: "object" as const }, required_actions: [{ capability_id: "unknown.read", version: 1 }] };
  assert.deepEqual(inspectMcpExports([entry]), []);
  for (const required_actions of [[], [{ capability_id: "x", version: 0 }], [entry.required_actions[0], entry.required_actions[0]], [{ capability_id: "x", version: 1, permissions: ["self-grant"] }]]) {
    assert.ok(inspectMcpExports([{ ...entry, required_actions } as typeof entry]).length);
  }
});

test("a legacy catalog cannot substitute another provider, version or partial composite contract", async () => {
  const { assembleMcpCatalog } = await import("../apps/local-host/src/mcp-catalog.js");
  const declaration = pagesManifest.mcp_exports!.find(entry => entry.tool_id === "list")!;
  const source = { plugin_id: pagesManifest.plugin_id, project_plugin_id: "pages", name: "Pages", personal: true, exports: [declaration] };
  const views: ActionView[] = declaration.required_actions!.map(reference => ({ ...pagesManifest.actions!.find(action => action.capability_id === reference.capability_id)!,
    provider: { provider_id: pagesManifest.plugin_id, plugin_id: pagesManifest.plugin_id, kind: "plugin", title: "Pages" }, availability: { available: true },
  }));
  const name = toolName(pagesManifest, "list");
  const visible = (actions: ActionView[]) => assembleMcpCatalog({ audience: "runtime", enabled_project_plugins: [], sources: [source],
    preference: { version: 1, overrides: { [name]: true } }, actions }).tools.some(tool => tool.name === name);
  assert.equal(visible(views), true);
  assert.equal(visible(views.slice(0, 1)), false);
  assert.equal(visible(views.map(view => ({ ...view, version: view.version + 1 }))), false);
  assert.equal(visible(views.map(view => ({ ...view, provider: { ...view.provider, provider_id: "other", plugin_id: "other" } }))), false);
});
