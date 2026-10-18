import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, bindActionClient, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
const caller: ActionCallContext = { actor_id: "reader", project_id: "project", audience: "user", permissions: ["query:read", "query:extra"] };
const query: ActionDefinition = { capability_id: "query.target", version: 1, operation: "query", action: { title: "Query", description: "Registered query", kind: "query", scope: "project",
  permissions: ["query:read"], audiences: ["user"], subject_kinds: [], input_schema: { type: "object", additionalProperties: false } } };
const command: ActionDefinition = { ...query, capability_id: "query.command", operation: "command" };

test("AQD-03 actual dispatch and fresh bound callers retain query_only, including synchronous dispatch", async () => {
  const service = new ActionService(); let commands = 0;
  service.registerProvider({ provider: { provider_id: "target", title: "Target", kind: "system" }, definitions: [query, command], handlers: [
    { ...query, handle: execution => bindActionClient(service, () => caller).invoke(command, {}, execution) },
    { ...command, handle: () => ++commands },
  ] });
  const restricted = { ...caller, query_only: true as const };
  assert.deepEqual(service.discover(restricted).map(view => view.capability_id), [query.capability_id]);
  await assert.rejects(service.invoke(restricted, command, {}));
  assert.throws(() => service.invokeSync(restricted, command, {}));
  await assert.rejects(service.invoke(restricted, query, {}));
  assert.equal(commands, 0);
  assert.equal(await service.invoke(caller, command, {}), 1);
});

test("AQD-03 dispatch checks current registered permissions before a query handler that never calls beforeEffect", async () => {
  const service = new ActionService(); let entered = 0;
  let remove = service.registerProvider({ provider: { provider_id: "target", title: "Target", kind: "system" }, definitions: [query], handlers: [{ ...query, handle: () => ++entered }] });
  const discovered = service.discover(caller)[0]!;
  remove();
  const replacement = { ...query, action: { ...query.action, permissions: ["query:extra"] } };
  remove = service.registerProvider({ provider: { provider_id: "target", title: "Target", kind: "system" }, definitions: [replacement], handlers: [{ ...replacement, handle: () => ++entered }] });
  const restricted = { ...caller, query_only: true as const, assert_authority_current: (_ref: unknown, permissions: readonly string[] = []) => {
    if (permissions.includes("query:extra")) throw new ActionError("actions.forbidden", "Source lacks current permission");
  } };
  await assert.rejects(service.invoke(restricted, discovered, {}), { code: "actions.forbidden" });
  assert.throws(() => service.invokeSync(restricted, discovered, {}), { code: "actions.forbidden" });
  assert.equal(entered, 0); remove();
});


test("AQD-03 a discovered query replaced with a command cannot run under its old reference", async () => {
  const service = new ActionService(); let commands = 0;
  const provider = { provider_id: "target", title: "Target", kind: "system" as const };
  const remove = service.registerProvider({ provider, definitions: [query], handlers: [{ ...query, handle: () => "old" }] });
  const restricted = { ...caller, query_only: true as const }, old = service.discover(restricted)[0]!;
  remove();
  const changed = { ...query, operation: "command" as const };
  service.registerProvider({ provider, definitions: [changed], handlers: [{ ...changed, handle: () => ++commands }] });
  await assert.rejects(service.invoke(restricted, old, {})); assert.equal(commands, 0);
});
