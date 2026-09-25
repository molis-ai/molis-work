import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";

const caller: ActionCallContext = { actor_id: "owner", project_id: "project", audience: "plugin", permissions: ["data:write"] };
const definition: ActionDefinition = { capability_id: "fixture.sync", version: 1, operation: "command",
  action: { title: "事务内写入", description: "同步保存数据", kind: "operation", scope: "project", audiences: ["plugin"],
    permissions: ["data:write"], subject_kinds: [], input_schema: { type: "integer", minimum: 1 }, output_schema: { type: "integer", minimum: 1 } } };
const provider = { provider_id: "data", kind: "system" as const, title: "Data", project_id: "project" };
const errorCode = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

test("sync and async dispatch share registration, schemas, grants and exact provider lifecycle", async () => {
  const service = new ActionService(); let writes = 0;
  const register = () => service.registerProvider({ provider, definitions: [definition], handlers: [{ ...definition,
    execution: "sync", handle: (_context, input) => { writes++; return input; } }] });
  let dispose = register();
  assert.deepEqual(service.discover({ ...caller, audience: "mcp" }), []);
  assert.equal(service.invokeSync(caller, definition, 2), 2);
  assert.equal(await service.invoke(caller, definition, 3), 3);
  assert.throws(() => service.invokeSync(caller, definition, 0), errorCode("actions.input_invalid"));
  assert.throws(() => service.invokeSync({ ...caller, permissions: [] }, definition, 1), errorCode("actions.forbidden"));
  assert.throws(() => service.invokeSync({ ...caller, project_id: "other" }, definition, 1));
  assert.throws(() => service.invokeSync(caller, { ...definition, provider_id: "replacement" }, 1), errorCode("actions.provider_changed"));
  assert.throws(() => service.invokeSync({ ...caller, validate_authority: async () => { throw new Error("revoked"); } }, definition, 1), errorCode("actions.async_required"));
  assert.throws(() => service.invokeSync({ ...caller, validate_authority: () => { dispose(); dispose = register(); } }, definition, 1), errorCode("actions.provider_changed"));
  assert.equal(writes, 2, "rejected input/authority cannot enter the write handler");
  dispose(); assert.throws(() => service.invokeSync(caller, definition, 1), errorCode("actions.missing"));
  await new Promise(resolve => setImmediate(resolve));
});

test("unmarked handlers never start synchronously; declared synchronous output is checked", async () => {
  const service = new ActionService(); let entered = 0;
  let dispose = service.registerProvider({ provider, definitions: [definition], handlers: [{ ...definition, handle: async () => { entered++; return 1; } }] });
  assert.throws(() => service.invokeSync(caller, definition, 1), errorCode("actions.async_required"));
  assert.equal(entered, 0);
  assert.equal(await service.invoke(caller, definition, 1), 1);
  dispose();
  dispose = service.registerProvider({ provider, definitions: [definition], handlers: [{ ...definition, execution: "sync", handle: () => "invalid" }] });
  assert.throws(() => service.invokeSync(caller, definition, 1), errorCode("actions.output_invalid"));
  await assert.rejects(service.invoke(caller, definition, 1), errorCode("actions.output_invalid"));
  dispose();
});

test("Host sync dispatch cannot bypass policy, cancellation or project lifetime", async () => {
  let writes = 0, policy: ActionAvailability | Promise<ActionAvailability> = { available: true };
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, actionAvailability: () => policy });
  const reference = { project_id: "project", board_id: "board", storage_key: "memory:sync" };
  await host.withRuntime(reference, () => {});
  const client = host.syncActionClient(reference);
  host.actionRegistry(reference).registerProvider({ provider, definitions: [definition], handlers: [{ ...definition, execution: "sync", handle: () => ++writes }] });
  try {
    assert.equal(client.invokeSync(caller, definition, 1), 1);
    policy = { available: false, code: "test.revoked", reason: "已撤销" };
    assert.throws(() => client.invokeSync(caller, definition, 1), errorCode("test.revoked"));
    policy = Promise.resolve({ available: true });
    assert.throws(() => client.invokeSync(caller, definition, 1), errorCode("actions.async_required"));
    policy = { available: true };
    assert.throws(() => client.invokeSync({ ...caller, signal: AbortSignal.abort() }, definition, 1));
    assert.throws(() => client.invokeSync({ ...caller, project_id: "other" }, definition, 1), errorCode("actions.scope_mismatch"));
    assert.throws(() => client.invokeSync({ ...caller, audience: "mcp" }, definition, 1), errorCode("actions.forbidden"));
    assert.equal(writes, 1);
    await host.closeProject(reference);
    await host.withRuntime(reference, () => {});
    host.actionRegistry(reference).registerProvider({ provider, definitions: [definition], handlers: [{ ...definition, execution: "sync", handle: () => ++writes }] });
    assert.throws(() => client.invokeSync(caller, definition, 1), /同步能力需要已打开/);
    assert.equal(host.syncActionClient(reference).invokeSync(caller, definition, 1), 2);
  } finally { await host.close(); }
});

test("sync SDK dispatch cannot enter public actions or skip an asynchronous dependency policy", async () => {
  let writes = 0;
  const dependency: ActionDefinition = { ...definition, capability_id: "fixture.dependency" };
  const root: ActionDefinition = { ...definition, action: { ...definition.action, required_actions: [dependency] } };
  const shared: ActionDefinition = { ...definition, capability_id: "fixture.public", action: { ...definition.action, audiences: ["plugin", "user"] } };
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, actionAvailability: (_context, view) =>
    view.capability_id === dependency.capability_id ? Promise.resolve({ available: true as const }) : { available: true as const } });
  const reference = { project_id: "project", board_id: "board", storage_key: "memory:dependencies" };
  await host.withRuntime(reference, () => {});
  host.actionRegistry(reference).registerProvider({ provider, definitions: [root, dependency, shared], handlers: [root, dependency, shared].map(action => ({
    ...action, execution: "sync", handle: () => ++writes,
  })) });
  try {
    for (const action of [root, shared]) assert.throws(() => host.syncActionClient(reference).invokeSync(caller, action, 1), errorCode("actions.async_required"));
    assert.equal(writes, 0);
    assert.equal(await host.actionClient(reference).invoke({ ...caller, audience: "user" }, shared, 1), 1);
  } finally { await host.close(); }
});
