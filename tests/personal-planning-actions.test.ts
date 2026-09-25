import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { personalPlanningActions } from "@molis-ai/molis-work-plugin-goals";
import { BUILTIN_PLANNING_METHOD_PACKS } from "@molis-ai/molis-work-module-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { resolveWebControlToken } from "../apps/local-host/src/web-control-token.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

const user: ActionCallContext = { actor_id: "owner", actor_kind: "user", audience: "user", project_id: null,
  permissions: ["goals:read", "goals:write"], user_action: { source: "management", conversation_ref: "test://planning", message_ref: "test://save" } };
const { scope: _scope, created_at: _created, updated_at: _updated, ...method } = BUILTIN_PLANNING_METHOD_PACKS.find(m => m.method_id === "domain-software-development")!;
const input = { method: { ...method, method_id: "personal-action", name: "My complete method" } };

test("Home planning actions use the original Catalog, require trusted users and keep Homes and lifecycle isolated", async () => {
  const home = await mkdtemp(join(tmpdir(), "planning-home-actions-")), otherHome = join(home, "separate-home");
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const other = new MolisWorkLocalHost({ homeDirectory: otherHome, completeText: null });
  const client = host.homeActionClient(), actions = bindActionClient(client, () => user);
  try {
    assert.ok((await actions.invoke(personalPlanningActions.list, {})).methods.some(m => m.scope === "built_in"));
    assert.equal(existsSync(join(home, "projects/catalog.db")), false, "a read never provisions or migrates Catalog");
    await assert.rejects(actions.invoke(personalPlanningActions.save, input), { code: "planning.catalog_unavailable" });
    host.configurePersonalPlanning(home, withCatalog);
    other.configurePersonalPlanning(otherHome, withCatalog);
    assert.throws(() => host.configurePersonalPlanning(otherHome, withCatalog), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...user, permissions: [] }, personalPlanningActions.list, {}), { code: "actions.forbidden" });
    for (const audience of ["agent", "workflow", "plugin", "mcp"] as const) {
      assert.equal((await client.discover({ ...user, audience })).some(v => v.capability_id === personalPlanningActions.save.capability_id), false);
      await assert.rejects(client.invoke({ ...user, audience }, personalPlanningActions.save, input), { code: "actions.forbidden" });
    }
    await assert.rejects(client.invoke({ ...user, user_action: undefined }, personalPlanningActions.save, input), { code: "planning.user_required" });
    await assert.rejects(client.invoke({ ...user, actor_kind: "runtime" }, personalPlanningActions.save, input), { code: "planning.user_required" });
    await assert.rejects(actions.invoke(personalPlanningActions.save, { ...input, actor_id: "forged" } as never), { code: "actions.input_invalid" });
    await assert.rejects(client.invoke({ ...user, project_id: "forged" }, personalPlanningActions.list, {}), { code: "actions.scope_mismatch" });
    const saved = await actions.invoke(personalPlanningActions.save, input);
    assert.equal(saved.method.scope, "personal"); assert.deepEqual(saved.method.event_types, input.method.event_types);
    assert.deepEqual(saved.method.default_requirements, input.method.default_requirements);
    const persisted = await withCatalog({ homeDirectory: home }, c => c.personalPlanningMethods.list());
    assert.deepEqual(persisted, [saved.method]);
    assert.deepEqual(host.status().projects, [], "saving a Home template creates no project Runtime");
    assert.deepEqual(await withCatalog({ homeDirectory: home }, c => c.listProjects()), []);
    assert.equal((await bindActionClient(other.homeActionClient(), () => user).invoke(personalPlanningActions.list, {})).methods.some(m => m.method_id === input.method.method_id), false);
    const second = await actions.invoke(personalPlanningActions.save, { method: { ...input.method, name: "Version two" } });
    assert.equal(second.method.version, saved.method.version + 1); assert.equal(second.method.created_at, saved.method.created_at);
    await assert.rejects(actions.invoke(personalPlanningActions.save, { method: { ...input.method, name: "" } }));
    assert.equal((await actions.invoke(personalPlanningActions.list, {})).methods.find(m => m.method_id === input.method.method_id)?.version, second.method.version);
    const saveView = (await host.inspectActions(user)).find(v => v.capability_id === personalPlanningActions.save.capability_id)!;
    assert.throws(() => createMcpActionGrant("external", null, saveView, true), { code: "mcp.grant_invalid" });
    await host.close();
    assert.throws(() => host.configurePersonalPlanning(home, withCatalog), { code: "host.closed" });
    await assert.rejects(actions.invoke(personalPlanningActions.list, {}), { code: "host.closed" });
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try { assert.deepEqual((await bindActionClient(restarted.homeActionClient(), () => user).invoke(personalPlanningActions.list, {})).methods.find(m => m.method_id === input.method.method_id), { ...second.method, overridden_scopes: [] }); }
    finally { await restarted.close(); }
  } finally { await host.close(); await other.close(); await rm(home, { recursive: true, force: true }); }
});

test("Home Web and official unbound MCP consume the same planning actions and live grants", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "planning-home-web-mcp-"));
  const denied = new Set<string>(), seen = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) => {
    seen.add(view.capability_id);
    return denied.has(view.capability_id) ? { available: false, code: "actions.forbidden", reason: "Planning disabled" } : { available: true };
  } });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const sdk = new Client({ name: "client-name-is-not-authority", version: "1" });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
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
    const name = hostActionToolName(view);
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    await sdk.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))],
      env: { ...env, MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_RUNTIME_ID: "personal-planning", MOLIS_WORK_WORK_CONTEXT_ID: "", MOLIS_WORK_WORK_CONTEXT_STABLE: "false" }, stderr: "pipe" }));
    assert.equal((await sdk.listTools()).tools.some(t => t.name === name), false);
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, null, view, true));
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
    assert.equal((await sdk.callTool({ name: hostActionToolName(personalPlanningActions.save), arguments: { ...input, user_action: user.user_action } })).isError, true);
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, null, view, false));
    assert.equal((await sdk.listTools()).tools.some(t => t.name === name), false);
    assert.equal((await sdk.callTool({ name, arguments: {} })).isError, true);
    assert.deepEqual(host.status().projects, []);
    assert.deepEqual(await withCatalog({ homeDirectory: home }, c => c.listProjects()), []);
  } finally {
    await sdk.close(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true });
  }
});
