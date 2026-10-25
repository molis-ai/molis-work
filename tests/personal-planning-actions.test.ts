import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { personalPlanningActions } from "@molis-ai/molis-work-plugin-goals";
import { BUILTIN_PLANNING_METHOD_PACKS } from "./fixtures/goals-modules.js";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { readMcpActionAccess } from "@molis-ai/molis-work-test-kit/local-host-http";
import { serveTestHost } from "./fixtures/test-home.js";
import { callAs, callerPlugin, issuedCaller, registerProbe } from "./fixtures/plugin-callers.js";

const user: ActionCallContext = { actor_id: "owner", actor_kind: "user", audience: "user", project_id: null,
  permissions: ["goals:read", "goals:write"], user_action: { source: "management", conversation_ref: "test://planning", message_ref: "test://save" } };
const { scope: _scope, created_at: _created, updated_at: _updated, ...method } = BUILTIN_PLANNING_METHOD_PACKS.find(m => m.method_id === "domain-software-development")!;
const input = { method: { ...method, method_id: "personal-action", name: "My complete method" } };

/** The person's methods as the Home's Goals library holds them (PG-094 S13), read straight from the file. */
function libraryMethods(home: string) {
  const db = new DatabaseSync(join(home, "goals", "goals.db"), { readOnly: true });
  try { return (db.prepare("SELECT pack_json FROM personal_planning_method_packs ORDER BY method_id").all() as Array<{ pack_json: string }>).map(row => JSON.parse(row.pack_json)); }
  finally { db.close(); }
}

test("RAC-798 saved planning methods live in Goals' library in the Home: a second save is a new version, and a restarted Host reads them back", async () => {
  const home = await mkdtemp(join(tmpdir(), "planning-home-library-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  let actions = bindActionClient(host.homeActionClient(), () => user);
  try {
    const first = await actions.invoke(personalPlanningActions.save, input);
    const next = await actions.invoke(personalPlanningActions.save, { method: { ...input.method, instructions: "second version" } });
    assert.equal(next.method.version, first.method.version + 1);
    assert.deepEqual(libraryMethods(home), [next.method], "the row is in the Home's Goals library, not in a project catalog");
    assert.equal(existsSync(join(home, "projects/catalog.db")), false, "and saving made no catalog");
    await host.close();

    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    actions = bindActionClient(restarted.homeActionClient(), () => user);
    try {
      const read = (await actions.invoke(personalPlanningActions.list, {})).methods.find(m => m.method_id === input.method.method_id);
      assert.equal(read?.instructions, "second version");
      assert.equal(read?.version, next.method.version);
    } finally { await restarted.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("RAC-798 the Web transport coming and going does not touch the saved methods: the Host keeps the library until it closes", async () => {
  const home = await mkdtemp(join(tmpdir(), "planning-web-host-lifetime-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const actions = bindActionClient(host.homeActionClient(), () => user);
  let server: ReturnType<typeof createMolisWorkWebServer> | undefined;
  const close = async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; } };
  const start = async () => {
    server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: "planning-retained-host-token-0123456789" });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  };
  try {
    await start();
    const first = await actions.invoke(personalPlanningActions.save, input);
    await close();
    const between = await actions.invoke(personalPlanningActions.save, { method: { ...input.method, instructions: "transport closed, Host lives" } });
    assert.equal(between.method.version, first.method.version + 1);
    await start();
    const after = await actions.invoke(personalPlanningActions.save, { method: { ...input.method, instructions: "replacement transport" } });
    assert.equal(after.method.version, between.method.version + 1);
    assert.equal(libraryMethods(home).find(m => m.method_id === input.method.method_id)?.instructions, "replacement transport");
    await close(); await host.close();
    await assert.rejects(actions.invoke(personalPlanningActions.list, {}), { code: "host.closed" });
  } finally { await close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("Home planning actions use the plugin's Home library, require trusted users and keep Homes and lifecycle isolated", async t => {
  const home = await mkdtemp(join(tmpdir(), "planning-home-actions-")), otherHome = join(home, "separate-home");
  // A Home plugin that holds the Goals permissions, started by the Host (S-15).
  const planner = callerPlugin("homeplanner", "home", { "goals:read": true, "goals:write": true });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [planner.definition] } });
  const other = new MolisWorkLocalHost({ homeDirectory: otherHome, completeText: null });
  const client = host.homeActionClient(), actions = bindActionClient(client, () => user);
  try {
    assert.ok((await actions.invoke(personalPlanningActions.list, {})).methods.some(m => m.scope === "built_in"));
    assert.equal(existsSync(join(home, "projects/catalog.db")), false, "a read never provisions or migrates Catalog");
    await assert.rejects(client.invoke({ ...user, permissions: [] }, personalPlanningActions.list, {}), { code: "actions.forbidden" });
    // The plugin's call carries the caller the Host issued its Home session, claiming the person's permissions and management entry.
    const probe = registerProbe(host.actionRegistry(), "home");
    await host.homePlugins!.ready();
    const asPlugin = callAs(await issuedCaller(probe, planner), user.permissions, { user_action: user.user_action });
    for (const audience of ["agent", "workflow", "plugin", "mcp"] as const) {
      const claimed = audience === "plugin" ? asPlugin : { ...user, audience };
      assert.equal((await client.discover(claimed)).some(v => v.capability_id === personalPlanningActions.save.capability_id), false);
      await assert.rejects(client.invoke(claimed, personalPlanningActions.save, input), { code: "actions.forbidden" });
    }
    await assert.rejects(client.invoke({ ...user, user_action: undefined }, personalPlanningActions.save, input), { code: "goals.planning.user_required" });
    await assert.rejects(client.invoke({ ...user, actor_kind: "runtime" }, personalPlanningActions.save, input), { code: "goals.planning.user_required" });
    await assert.rejects(actions.invoke(personalPlanningActions.save, { ...input, actor_id: "forged" } as never), { code: "actions.input_invalid" });
    await assert.rejects(client.invoke({ ...user, project_id: "forged" }, personalPlanningActions.list, {}), { code: "actions.scope_mismatch" });
    const saved = await actions.invoke(personalPlanningActions.save, input);
    assert.equal(saved.method.scope, "personal"); assert.deepEqual(saved.method.event_types, input.method.event_types);
    assert.deepEqual(saved.method.default_requirements, input.method.default_requirements);
    assert.deepEqual(libraryMethods(home), [saved.method]);
    assert.deepEqual(host.status().projects, [], "saving a Home template creates no project Runtime");
    assert.deepEqual(await withCatalog({ homeDirectory: home }, c => c.listProjects()), []);
    assert.equal((await bindActionClient(other.homeActionClient(), () => user).invoke(personalPlanningActions.list, {})).methods.some(m => m.method_id === input.method.method_id), false);
    const second = await actions.invoke(personalPlanningActions.save, { method: { ...input.method, name: "Version two" } });
    assert.equal(second.method.version, saved.method.version + 1); assert.equal(second.method.created_at, saved.method.created_at);
    await assert.rejects(actions.invoke(personalPlanningActions.save, { method: { ...input.method, name: "" } }));
    assert.equal((await actions.invoke(personalPlanningActions.list, {})).methods.find(m => m.method_id === input.method.method_id)?.version, second.method.version);
    const saveView = (await host.inspectActions(user)).find(v => v.capability_id === personalPlanningActions.save.capability_id)!;
    // A model's client cannot hold a grant for a user-only action: the access settings never offer it to the client, so the request is refused as unknown and nothing is saved.
    // The Home is served only here: serving provisions the Catalog, which the assertions above need unprovisioned.
    const served = await serveTestHost(t, { home, host });
    await assert.rejects(served.grant("external", null, [saveView]), { status: 404, code: "actions.missing" });
    assert.deepEqual((await readMcpActionAccess(served.web, { clientId: "external", projectId: null })).grants, [], "a refused grant leaves no record");
    await served.close();
    await host.close();
    await assert.rejects(actions.invoke(personalPlanningActions.list, {}), { code: "host.closed" });
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try { assert.deepEqual((await bindActionClient(restarted.homeActionClient(), () => user).invoke(personalPlanningActions.list, {})).methods.find(m => m.method_id === input.method.method_id), { ...second.method, overridden_scopes: [] }); }
    finally { await restarted.close(); }
  } finally { await host.close(); await other.close(); await rm(home, { recursive: true, force: true }); }
});

test("Home Web and official unbound MCP consume the same planning actions and live grants", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "planning-home-web-mcp-"));
  const denied = new Set<string>(), seen = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) => {
    seen.add(view.capability_id);
    return denied.has(view.capability_id) ? { available: false, code: "actions.forbidden", reason: "Planning disabled" } : { available: true };
  } });
  // Served so that the client's grant is saved the way a person saves it.
  const served = await serveTestHost(t, { home, host });
  const token = served.controlToken;
  const sdk = new Client({ name: "client-name-is-not-authority", version: "1" });
  try {
    const origin = served.origin;
    const post = (name: string, authorized = true) => fetch(origin + "/api/settings/planning-methods", { method: "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}) },
      body: JSON.stringify({ scope: "personal", method: { ...input.method, name } }) });
    assert.equal((await post("No authorization", false)).status, 403);
    denied.add(personalPlanningActions.save.capability_id);
    const blocked = await post("Denied"); assert.equal(blocked.status, 400); assert.match(await blocked.text(), /Planning disabled/);
    denied.clear();
    const response = await post("Saved from Home"); assert.equal(response.status, 200, await response.clone().text());
    assert.ok(seen.has(personalPlanningActions.save.capability_id));
    for (const path of ["/api/settings/planning-methods", "/settings/planning", `/settings/planning/${input.method.method_id}`]) {
      denied.add(personalPlanningActions.list.capability_id);
      const blocked = await fetch(origin + path); assert.equal(blocked.status, 400); assert.match(await blocked.text(), /Planning disabled/);
      denied.clear(); assert.equal((await fetch(origin + path)).status, 200);
    }
    const caller: ActionCallContext = { actor_id: "runtime:personal-planning", project_id: null, audience: "mcp", permissions: [] };
    const view = (await host.inspectActions(caller)).find(v => v.capability_id === personalPlanningActions.list.capability_id)!;
    const name = molisWorkActionToolName(view);
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    await sdk.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))],
      env: { ...env, MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_RUNTIME_ID: "personal-planning", MOLIS_WORK_WORK_CONTEXT_ID: "", MOLIS_WORK_WORK_CONTEXT_STABLE: "false" }, stderr: "pipe" }));
    assert.equal((await sdk.listTools()).tools.some(t => t.name === name), false);
    await served.grant(caller.actor_id, null, [view]);
    assert.equal((await sdk.listTools()).tools.some(t => t.name === name), true);
    const read = async () => {
      const result = await sdk.callTool({ name, arguments: {} }); assert.equal(result.isError, false, JSON.stringify(result));
      return result.structuredContent as { methods: Array<{ method_id: string; name: string; version: number }> };
    };
    const first = (await read()).methods.find(m => m.method_id === input.method.method_id)!;
    assert.equal(first.name, "Saved from Home");
    assert.equal((await post("Changed while MCP is connected")).status, 200);
    const changed = (await read()).methods.find(m => m.method_id === input.method.method_id)!;
    assert.equal(changed.name, "Changed while MCP is connected"); assert.equal(changed.version, first.version + 1);
    assert.equal((await sdk.callTool({ name: molisWorkActionToolName(personalPlanningActions.save), arguments: { ...input, user_action: user.user_action } })).isError, true);
    await served.revoke(caller.actor_id, null, [view]);
    assert.equal((await sdk.listTools()).tools.some(t => t.name === name), false);
    assert.equal((await sdk.callTool({ name, arguments: {} })).isError, true);
    assert.deepEqual(host.status().projects, []);
    assert.deepEqual(await withCatalog({ homeDirectory: home }, c => c.listProjects()), []);
  } finally {
    await sdk.close(); await served.close(); await host.close(); await rm(home, { recursive: true, force: true });
  }
});
