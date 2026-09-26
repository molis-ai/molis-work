import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { createMcpActionGrant, resolveMcpActionContext, assertMcpActionAuthority, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { parseMcpToolPreference, readMcpToolPreference, writeMcpToolPreference, writeMcpActionGrant, mcpToolPreferencePath } from "../apps/local-host/src/mcp-settings-store.js";

const caller: ActionCallContext = { actor_id: "runtime:client-a", project_id: "a", audience: "mcp", permissions: [] };
function view(scope: "home" | "project" = "project", version = 1, provider = "unknown-plugin"): ActionView {
  return { capability_id: `unknown.${scope}.write`, version, operation: "command", provider: { provider_id: provider, title: "Unknown", kind: "plugin" },
    availability: { available: false, code: "actions.forbidden", reason: "Not authorized" },
    action: { title: "Write", description: "Write a value", kind: "operation", scope, audiences: ["mcp"], permissions: ["unknown:write"], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "integer" } } };
}

test("persisted grants keep old switches and concurrent management updates, with duplicates failing closed", async t => {
  const home = await mkdtemp(join(tmpdir(), "mcp-grants-")); t.after(() => rm(home, { recursive: true, force: true }));
  const first = createMcpActionGrant(caller.actor_id, "a", view(), true);
  const second = { ...first, client_id: "runtime:client-b", enabled: false };
  await Promise.all([writeMcpActionGrant(home, first), writeMcpActionGrant(home, second)]);
  await writeMcpToolPreference(home, { molis_work_v1_functions_list: false });
  const preference = await readMcpToolPreference(home);
  assert.deepEqual(preference.action_grants, [first, second]);
  assert.equal(preference.overrides.molis_work_v1_functions_list, false);
  await writeMcpActionGrant(home, { ...first, enabled: false });
  assert.equal((await readMcpToolPreference(home)).action_grants?.length, 2);
  assert.equal(JSON.parse(await readFile(mcpToolPreferencePath(home), "utf8")).action_grants[1].enabled, false);
  const invalid = JSON.stringify({ ...preference, action_grants: [first, { ...first, enabled: false }, { ...first, version: "1" }] });
  assert.deepEqual(parseMcpToolPreference(JSON.parse(invalid)).action_grants, []);
  await writeFile(mcpToolPreferencePath(home), invalid);
  await assert.rejects(writeMcpToolPreference(home, {}), /已保留原文件/);
  assert.equal(await readFile(mcpToolPreferencePath(home), "utf8"), invalid);
});

test("MCP grants are exact for client, project, Home, provider, version and accepted permissions; no permission borrowing", () => {
  const project = view(), home = view("home"), newer = view("project", 2), replacement = view("project", 1, "replacement");
  const grant = createMcpActionGrant(caller.actor_id, "a", project, true);
  const preference = { version: 1 as const, overrides: {}, action_grants: [grant] };
  const resolve = (context = caller, actions = [project, home, newer, replacement]) => resolveMcpActionContext(context, actions, preference);
  assert.deepEqual(resolve().allowed_actions, [{ capability_id: project.capability_id, version: 1, provider_id: project.provider.provider_id }]);
  assert.deepEqual(resolve({ ...caller, project_id: "b" }).permissions, []);
  assert.deepEqual(resolve({ ...caller, actor_id: "runtime:client-b" }).permissions, []);
  assert.deepEqual(resolve({ ...caller, project_id: null }).permissions, []);
  assert.deepEqual(resolve(caller, [{ ...project, action: { ...project.action, permissions: ["unknown:write", "model:invoke"] } }]).permissions, []);
  assert.deepEqual(resolve(caller, [{ ...project, action: { ...project.action, permissions: [] } }]).allowed_actions, []);
  assert.throws(() => createMcpActionGrant(caller.actor_id, "a", home, true), { code: "mcp.grant_scope" });
  assert.throws(() => createMcpActionGrant(caller.actor_id, null, project, true), { code: "actions.project_required" });
  const globalPreference = { ...preference, action_grants: [createMcpActionGrant(caller.actor_id, null, home, true)] };
  assert.equal(resolveMcpActionContext({ ...caller, project_id: null }, [home], globalPreference).allowed_actions?.length, 1);
  assert.deepEqual(resolveMcpActionContext(caller, [project], { ...preference, overrides: { [hostActionToolName(project)]: false } }).permissions, []);
  assert.equal(preference.action_grants[0], grant, "resolving unavailable/changed definitions must retain original records");
});

test("Host inspection exposes metadata without execution rights; exact scope and queued calls respect revocation", async t => {
  const home = await mkdtemp(join(tmpdir(), "mcp-grant-queue-"));
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const action = view(), newer = view("project", 2), reference = { project_id: "a", board_id: "a", storage_key: "memory:a" };
  let writes = 0;
  const dispose = host.actionRegistry(reference).registerProvider({ provider: action.provider, definitions: [action, newer],
    handlers: [action, newer].map(def => ({ capability_id: def.capability_id, version: def.version, handle: () => ++writes })) });
  const client = host.actionClient(reference);
  assert.equal((await host.inspectActions(caller, reference)).length, 2);
  assert.deepEqual(await client.discover(caller), []);
  await assert.rejects(client.invoke(caller, action, {}), { code: "actions.forbidden" });
  await assert.rejects(host.inspectActions({ ...caller, project_id: "b" }, reference), { code: "actions.scope_mismatch" });
  const grant = createMcpActionGrant(caller.actor_id, "a", action, true);
  await writeMcpActionGrant(home, grant);
  const authorized = resolveMcpActionContext(caller, [action, newer], await readMcpToolPreference(home));
  await assert.rejects(client.invoke({ ...authorized, allowed_capability_ids: [action.capability_id] }, newer, {}), { code: "actions.forbidden" });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  const blocking = { capability_id: "fixture.block", version: 1, operation: "command" as const };
  host.register(blocking, async () => { entered.resolve(); await release.promise; });
  const first = host.client(reference).invoke(blocking, undefined); await entered.promise;
  const mutable = { ...authorized, allowed_actions: [...authorized.allowed_actions!] };
  const queued = client.invoke({ ...mutable, validate_authority: async ref => assertMcpActionAuthority(caller, [action], await readMcpToolPreference(home), ref) }, action, {});
  const rejected = assert.rejects(queued, { code: "mcp.action_revoked" });
  await writeMcpActionGrant(home, { ...grant, enabled: false });
  mutable.allowed_actions.push({ ...newer, provider_id: action.provider.provider_id });
  release.resolve(); await first; await rejected; assert.equal(writes, 0);
  await writeMcpActionGrant(home, grant);
  assert.equal(await client.invoke(authorized, action, {}), 1);
  dispose();
  assert.deepEqual(await host.inspectActions(caller, reference), []);
});

test("a provider replaced while authority is being checked cannot receive the original dispatch", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const action = view("home"); let calls = 0;
  const registration = { provider: action.provider, definitions: [action], handlers: [{ capability_id: action.capability_id, version: action.version, handle: () => ++calls }] };
  const stop = host.actionRegistry().registerProvider(registration);
  const checking = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
  try {
    const pending = host.homeActionClient().invoke({ ...caller, project_id: null, permissions: ["unknown:write"],
      validate_authority: async () => { checking.resolve(); await resume.promise; } }, action, {});
    const rejected = assert.rejects(pending, { code: "actions.provider_changed" });
    await checking.promise; stop(); host.actionRegistry().registerProvider(registration); resume.resolve();
    await rejected; assert.equal(calls, 0);
  } finally { resume.resolve(); await host.close(); }
});

test("permission-free system defaults can be revoked per client and restored, without disabling other clients", () => {
  const base = view("home");
  const action: ActionView = { ...base, provider: { ...base.provider, kind: "system" }, action: { ...base.action, permissions: [] } };
  const context = { ...caller, project_id: null };
  const preference = { version: 1 as const, overrides: {} };
  assert.equal(resolveMcpActionContext(context, [action], preference).allowed_actions?.length, 1);
  const deny = createMcpActionGrant(caller.actor_id, null, action, false);
  assert.deepEqual(resolveMcpActionContext(context, [action], { ...preference, action_grants: [deny] }).allowed_actions, []);
  assert.deepEqual(resolveMcpActionContext(caller, [action], { ...preference, action_grants: [deny] }).allowed_actions, [], "Home revocation applies even when a client is in a project");
  assert.equal(resolveMcpActionContext({ ...context, actor_id: "runtime:other" }, [action], { ...preference, action_grants: [deny] }).allowed_actions?.length, 1);
  assert.equal(resolveMcpActionContext(context, [action], { ...preference, action_grants: [{ ...deny, enabled: true }] }).allowed_actions?.length, 1);
});
