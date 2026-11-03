import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorFromResponse, actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { formatMcpToolError } from "@molis-ai/molis-work-app-mcp";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import { createMcpActionGrant, resolveMcpActionContext, assertMcpActionAuthority, openByDefault } from "../apps/local-host/dist/mcp-action-grants.js";
import { parseMcpToolPreference, readMcpToolPreference, writeMcpActionGrant, writeMcpActionGrants, mcpToolPreferencePath } from "../apps/local-host/dist/mcp-settings-store.js";

const caller: ActionCallContext = { actor_id: "runtime:client-a", project_id: "a", audience: "mcp", permissions: [] };
function view(scope: "home" | "project" = "project", version = 1, provider = "unknown-plugin"): ActionView {
  return { capability_id: `unknown.${scope}.write`, version, operation: "command", provider: { provider_id: provider, title: "Unknown", kind: "plugin" },
    availability: { available: false, code: "actions.forbidden", reason: "Not authorized" },
    action: { title: "Write", description: "Write a value", kind: "operation", scope, audiences: ["mcp"], permissions: ["unknown:write"], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "integer" } } };
}

test("persisted grants keep concurrent management updates; duplicates and other versions fail closed", async t => {
  const home = await mkdtemp(join(tmpdir(), "mcp-grants-")); t.after(() => rm(home, { recursive: true, force: true }));
  const first = createMcpActionGrant(caller.actor_id, "a", view(), true);
  const second = { ...first, client_id: "runtime:client-b", enabled: false };
  await Promise.all([writeMcpActionGrant(home, first), writeMcpActionGrant(home, second)]);
  const preference = await readMcpToolPreference(home);
  assert.equal(preference.version, 1);
  assert.deepEqual(preference.action_grants.map(({ generation, ...facts }) => { assert.ok(generation); return facts; }), [first, second]);
  const [storedFirst, storedSecond] = preference.action_grants;
  await writeMcpActionGrant(home, { ...first, enabled: false });
  assert.equal((await readMcpToolPreference(home)).action_grants?.length, 2);
  assert.equal(JSON.parse(await readFile(mcpToolPreferencePath(home), "utf8")).action_grants[1].enabled, false);
  // W1-18-MCP-CONFIG-01: duplicate records remain visible facts; resolving them never grants or restores a default.
  const duplicate = JSON.stringify({ ...preference, action_grants: [storedFirst, { ...storedFirst, enabled: false }, storedSecond] });
  const conflicted = parseMcpToolPreference(JSON.parse(duplicate));
  assert.deepEqual(conflicted.action_grants, [storedFirst, { ...storedFirst, enabled: false }, storedSecond]);
  assert.deepEqual(resolveMcpActionContext(caller, [view()], conflicted).allowed_actions, []);
  await writeFile(mcpToolPreferencePath(home), duplicate);
  await assert.rejects(writeMcpActionGrant(home, first), { code: "actions.configuration_unavailable" });
  assert.equal(await readFile(mcpToolPreferencePath(home), "utf8"), duplicate);
  const invalid = JSON.stringify({ ...preference, action_grants: [storedFirst, { ...storedFirst, enabled: false }, { ...storedFirst, version: "1" }] });
  assert.throws(() => parseMcpToolPreference(JSON.parse(invalid)), { code: "actions.configuration_unavailable" });
  await writeFile(mcpToolPreferencePath(home), invalid);
  await assert.rejects(writeMcpActionGrant(home, first), /已保留原文件/);
  assert.equal(await readFile(mcpToolPreferencePath(home), "utf8"), invalid);
  const otherVersion = JSON.stringify({ ...preference, version: 2 });
  assert.throws(() => parseMcpToolPreference(JSON.parse(otherVersion)), { code: "actions.configuration_unavailable" }, "another version is rejected, never interpreted as a missing file");
  await writeFile(mcpToolPreferencePath(home), otherVersion);
  await assert.rejects(writeMcpActionGrant(home, first), /已保留原文件/);
  assert.equal(await readFile(mcpToolPreferencePath(home), "utf8"), otherVersion);
});

test("ACA005-04/06 management owns each generation, preserving permission sets, unrelated grants and atomic failures", async t => {
  const home = await mkdtemp(join(tmpdir(), "mcp-generation-")); t.after(() => rm(home, { recursive: true, force: true }));
  const first = { ...createMcpActionGrant(caller.actor_id, "a", view(), true), permissions: ["unknown:write", "unknown:read"] };
  const second = { ...first, capability_id: "other.action" };
  await writeMcpActionGrants(home, [first, second]);
  const rows = async () => (await readMcpToolPreference(home)).action_grants;
  const original = await rows(), firstGeneration = original[0].generation, secondGeneration = original[1].generation;
  assert.notEqual(firstGeneration, secondGeneration);
  await writeMcpActionGrant(home, { ...first, permissions: [...first.permissions].reverse() });
  assert.equal((await rows()).find(row => row.capability_id === first.capability_id)?.generation, firstGeneration);
  await writeMcpActionGrant(home, { ...second, enabled: false });
  const unrelated = await rows();
  assert.equal(unrelated.find(row => row.capability_id === first.capability_id)?.generation, firstGeneration);
  assert.notEqual(unrelated.find(row => row.capability_id === second.capability_id)?.generation, secondGeneration);
  await writeMcpActionGrant(home, { ...first, enabled: false });
  const revoked = (await rows()).find(row => row.capability_id === first.capability_id)!;
  assert.notEqual(revoked.generation, firstGeneration);
  await writeMcpActionGrant(home, first);
  const regranted = (await rows()).find(row => row.capability_id === first.capability_id)!;
  assert.notEqual(regranted.generation, firstGeneration); assert.notEqual(regranted.generation, revoked.generation);
  await writeMcpActionGrant(home, { ...first, permissions: ["unknown:write"] });
  assert.notEqual((await rows()).find(row => row.capability_id === first.capability_id)?.generation, regranted.generation);
  const file = mcpToolPreferencePath(home), before = await readFile(file, "utf8");
  await assert.rejects(writeMcpActionGrants(home, [first, { ...first, enabled: false }]), { code: "actions.configuration_unavailable" });
  const spoofed = { ...first, generation: "caller-chosen" };
  await assert.rejects(writeMcpActionGrant(home, spoofed), /动作授权无效/);
  assert.equal(await readFile(file, "utf8"), before, "invalid or duplicate proposals never partially publish");
  for (const value of [{ version: 2, action_grants: [first] }, { ...JSON.parse(before), action_grants: [{ ...regranted, generation: "" }] }]) {
    const text = JSON.stringify(value); await writeFile(file, text);
    await assert.rejects(readMcpToolPreference(home), { code: "actions.configuration_unavailable" });
    await assert.rejects(writeMcpActionGrant(home, first), { code: "actions.configuration_unavailable" });
    assert.equal(await readFile(file, "utf8"), text, "old or broken storage is not rewritten at read or management");
  }
});

// RAC-2490 RAC-2492: an MCP client calling an action it holds no grant for is refused as a refusal (kind `forbidden`), at the source, so a
// reader that tells refusals from failures does not need to know this code; what the client reads in its tool result is unchanged.
test("RAC-2490 an MCP client's call to an action it was not granted is refused with mcp.action_revoked of kind forbidden, also across the gateway hop", () => {
  const preference = { version: 1 as const, action_grants: [] };
  const project = view();
  const reference = { capability_id: project.capability_id, version: project.version, provider_id: project.provider.provider_id };
  const refusal = (() => { try { assertMcpActionAuthority(caller, [project], preference, reference); } catch (error) { return error; } assert.fail("an ungranted call must be refused"); })();
  assert.ok(refusal instanceof ActionError);
  assert.deepEqual([refusal.code, refusal.kind], ["mcp.action_revoked", "forbidden"]);
  const { status, body } = actionErrorResponse(refusal);
  assert.equal(status, 403, "the status comes from the kind, by the one table in the plugin SDK");
  const received = actionErrorFromResponse(status, body);
  assert.deepEqual([received.code, received.kind, received.message], ["mcp.action_revoked", "forbidden", refusal.message], "the MCP process reads the same refusal back");
});

test("RAC-2492 the tool result an MCP client reads for that refusal is unchanged: the same code and message, no kind and no status", () => {
  const project = view();
  const reference = { capability_id: project.capability_id, version: project.version, provider_id: project.provider.provider_id };
  const refusal = (() => { try { assertMcpActionAuthority(caller, [project], { version: 1, action_grants: [] }, reference); } catch (error) { return error; } assert.fail("an ungranted call must be refused"); })();
  assert.ok(refusal instanceof ActionError);
  const before = new ActionError("mcp.action_revoked", refusal.message);
  assert.equal(formatMcpToolError(refusal), formatMcpToolError(before));
  assert.equal(formatMcpToolError(refusal, "call-1"), formatMcpToolError(before, "call-1"));
  assert.deepEqual(JSON.parse(formatMcpToolError(refusal)), { error: refusal.message, code: "mcp.action_revoked" });
});

test("MCP grants are exact for client, project, Home, provider, version and accepted permissions; no permission borrowing", () => {
  const project = view(), home = view("home"), newer = view("project", 2), replacement = view("project", 1, "replacement");
  const grant = createMcpActionGrant(caller.actor_id, "a", project, true);
  const preference = { version: 1 as const, action_grants: [grant] };
  const resolve = (context = caller, actions = [project, home, newer, replacement]) => resolveMcpActionContext(context, actions, preference);
  assert.deepEqual(resolve().allowed_actions, [{ capability_id: project.capability_id, version: 1, provider_id: project.provider.provider_id }]);
  assert.deepEqual(resolve({ ...caller, project_id: "b" }).permissions, []);
  assert.deepEqual(resolve({ ...caller, actor_id: "runtime:client-b" }).permissions, []);
  assert.deepEqual(resolve({ ...caller, project_id: null }).permissions, []);
  assert.deepEqual(resolve(caller, [{ ...project, action: { ...project.action, permissions: ["unknown:write", "model:invoke"] } }]).permissions, []);
  assert.deepEqual(resolve(caller, [{ ...project, action: { ...project.action, permissions: [] } }]).allowed_actions, []);
  assert.throws(() => createMcpActionGrant(caller.actor_id, "a", home, true), { code: "mcp.grant_scope" });
  assert.throws(() => createMcpActionGrant(caller.actor_id, null, project, true), { code: "actions.project_required" });
  // The owner's audience rule. Through the access settings a view of another audience never gets here (the directory the route reads
  // does not list it, so the request is refused as unknown: goals-decision-actions, goals-tree-actions, goals-configuration-actions,
  // personal-planning-actions), so it is pinned at its owner: a client holds a grant only for an action that reaches its own audience.
  const mine = (audiences: ActionView["action"]["audiences"]): ActionView => ({ ...project, action: { ...project.action, audiences } });
  assert.throws(() => createMcpActionGrant(caller.actor_id, "a", mine(["user"]), true), { code: "mcp.grant_invalid" }, "an action for the person alone is not grantable to an MCP client");
  assert.throws(() => createMcpActionGrant("agent:prologue", "a", mine(["mcp"]), true), { code: "mcp.grant_invalid" }, "an internal Agent's identity needs an action that reaches Agents");
  assert.throws(() => createMcpActionGrant("runtime:client-a", "a", mine(["agent"]), true), { code: "mcp.grant_invalid" }, "a runtime: identity cannot take an Agent's action");
  assert.throws(() => createMcpActionGrant("  ", "a", project, true), { code: "mcp.grant_invalid" }, "a grant names its client");
  assert.equal(createMcpActionGrant("agent:prologue", "a", mine(["agent"]), true).client_id, "agent:prologue");
  const globalPreference = { ...preference, action_grants: [createMcpActionGrant(caller.actor_id, null, home, true)] };
  assert.equal(resolveMcpActionContext({ ...caller, project_id: null }, [home], globalPreference).allowed_actions?.length, 1);
  assert.equal(preference.action_grants[0], grant, "resolving unavailable/changed definitions must retain original records");
});

test("Host inspection exposes metadata without execution rights; exact scope and queued calls respect revocation", async t => {
  const home = await mkdtemp(join(tmpdir(), "mcp-grant-queue-"));
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const action = view(), newer = view("project", 2), reference = { project_id: "a", storage_key: "memory:a" };
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
  // A Host action of the same project holds its queue, so the MCP call below waits behind it.
  const blocking: ActionDefinition<Record<string, never>, null> = { capability_id: "fixture.block", version: 1, operation: "command",
    action: { title: "Block", description: "Hold the project's queue", kind: "operation", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "null" } } };
  host.registerAction(blocking, async () => { entered.resolve(); await release.promise; return null; });
  const first = host.client(reference).invoke(blocking, {}); await entered.promise;
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
  const preference = { version: 1 as const, action_grants: [] };
  assert.equal(resolveMcpActionContext(context, [action], preference).allowed_actions?.length, 1);
  const deny = createMcpActionGrant(caller.actor_id, null, action, false);
  assert.deepEqual(resolveMcpActionContext(context, [action], { ...preference, action_grants: [deny] }).allowed_actions, []);
  assert.deepEqual(resolveMcpActionContext(caller, [action], { ...preference, action_grants: [deny] }).allowed_actions, [], "Home revocation applies even when a client is in a project");
  assert.equal(resolveMcpActionContext({ ...context, actor_id: "runtime:other" }, [action], { ...preference, action_grants: [deny] }).allowed_actions?.length, 1);
  assert.equal(resolveMcpActionContext(context, [action], { ...preference, action_grants: [{ ...deny, enabled: true }] }).allowed_actions?.length, 1);
  for (const enabled of [false, true]) assert.deepEqual(resolveMcpActionContext(context, [action], {
    ...preference, action_grants: [{ ...deny, enabled }, { ...deny, enabled }],
  }).allowed_actions, [], "even identical enabled duplicates cannot reopen a permission-free system default");
});

test("PMAT-24 the built-in Agent holds project knowledge without a grant record, only in its project, and a revoked record wins", () => {
  const agent: ActionCallContext = { actor_id: "agent:prologue", project_id: "a", audience: "agent", permissions: [] };
  const knowledge: ActionView = { ...view("project"), capability_id: "knowledge.read", operation: "query", provider: { provider_id: "system.knowledge", title: "项目资料", kind: "system" },
    action: { ...view("project").action, kind: "query", audiences: ["agent", "mcp"], permissions: ["knowledge:read"] } };
  const reader = (project: string | undefined, kind: "query" | "operation" = "query"): ActionView => ({ ...view("project"), capability_id: "pages.subject.read", operation: kind === "query" ? "query" : "command",
    provider: { provider_id: "pages", title: "Pages", kind: "plugin", ...(project ? { project_id: project } : {}) },
    action: { ...view("project").action, kind, audiences: ["agent", "mcp"], permissions: ["pages:read"], input_type: "molis.subject-reference.v1", output_type: "molis.subject-context.v1" } });
  const writer: ActionView = { ...view("project"), provider: { provider_id: "pages", title: "Pages", kind: "plugin", project_id: "a" }, action: { ...view("project").action, audiences: ["agent", "mcp"] } };
  const empty = { version: 1 as const, action_grants: [] };
  assert.deepEqual([openByDefault(knowledge, agent), openByDefault(reader("a"), agent)], [true, true]);
  assert.equal(openByDefault(writer, agent), false, "a write still needs its own grant");
  const manage: ActionView = { ...knowledge, capability_id: "knowledge.card.edit", operation: "command", action: { ...knowledge.action, kind: "operation", effect: "write", permissions: ["knowledge:manage"] } };
  assert.equal(openByDefault(manage, agent), false, "only knowledge reads are open; managing cards is not");
  assert.equal(openByDefault(reader("b"), agent), false, "another project's reader is not open");
  assert.equal(openByDefault(reader(undefined), agent), false, "a Home-wide reader is not project knowledge");
  assert.equal(openByDefault(knowledge, { ...agent, project_id: null }), false, "no project, no project knowledge");
  assert.deepEqual([openByDefault(knowledge, caller), openByDefault(reader("a"), caller)], [false, false], "an external MCP client is still granted one by one");
  const context = resolveMcpActionContext(agent, [knowledge, reader("a"), writer], empty);
  assert.deepEqual(context.allowed_actions?.map(item => item.capability_id), ["knowledge.read", "pages.subject.read"]);
  assert.deepEqual([...context.permissions].sort(), ["knowledge:read", "pages:read"]);
  const revoked = createMcpActionGrant(agent.actor_id, "a", reader("a"), false);
  assert.deepEqual(resolveMcpActionContext(agent, [knowledge, reader("a")], { ...empty, action_grants: [revoked] }).allowed_actions?.map(item => item.capability_id), ["knowledge.read"],
    "the person turned the reader off in 对外接入");
});
