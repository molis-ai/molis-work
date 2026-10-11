import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { actionMcpToolName, createActionMcpPorts, handleMcpMessage, molisWorkActionToolName, MOLIS_WORK_ACTION_TOOL_PREFIX } from "@molis-ai/molis-work-app-mcp";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

const context: ActionCallContext = { actor_id: "alice", project_id: "p", audience: "user", permissions: ["read"] };
const definition: ActionDefinition = { capability_id: "test:words", version: 2, operation: "query",
  action: { title: "分词", description: "返回文本中的单词", kind: "query", scope: "project", audiences: ["mcp"],
    permissions: ["read"], subject_kinds: [], input_schema: { type: "string", minLength: 1 },
    output_schema: { type: "array", items: { type: "string" } } } };

test("MCP adapts scalar and array contracts without inventing a session or accepting authority in metadata", async () => {
  const service = new ActionService();
  let seen: ActionCallContext | undefined;
  const dispose = service.registerProvider({ provider: { provider_id: "words", title: "Words", kind: "system" },
    definitions: [definition], handlers: [{ ...definition, handle: (caller, text) => { seen = caller; return (text as string).split(" "); } }] });
  let caller = context;
  const ports = createActionMcpPorts({ service, context: () => caller, serverInfo: { name: "actions", version: "1" } });
  const name = (await ports.tools)[0]!.name;
  assert.equal((await ports.tools)[0]!.inputSchema.type, "object");
  assert.equal((await ports.tools)[0]!.outputSchema!.type, "object");
  const call = (args: Record<string, unknown>) => handleMcpMessage({ id: 4, method: "tools/call",
    params: { name, arguments: args, _meta: { threadId: "stolen-session", actor_id: "mallory", project_id: "other" } } }, ports);
  const success = await call({ input: "hello world" });
  assert.deepEqual(success!.result, { isError: false, content: [{ type: "text", text: '{"result":["hello","world"]}' }],
    structuredContent: { result: ["hello", "world"] } });
  assert.equal(seen!.actor_id, "alice");
  assert.equal(seen!.project_id, "p");
  assert.equal(seen!.audience, "mcp");
  for (const args of [{ input: 42 }, { input: "", actor_id: "mallory" }, {}]) {
    assert.equal(((await call(args))!.result as { isError: boolean }).isError, true);
  }
  caller = { ...context, permissions: [] };
  assert.deepEqual(await ports.tools, []);
  assert.equal(((await call({ input: "no access" }))!.result as { isError: boolean }).isError, true);
  caller = context;
  dispose();
  assert.deepEqual(await ports.tools, []);
});

test("MCP names are stable, distinguish normalized identities and detect custom alias conflicts", async () => {
  const reference = { capability_id: "x".repeat(150), version: 1 };
  assert.ok(actionMcpToolName(reference).length <= 128);
  assert.equal(actionMcpToolName(reference), actionMcpToolName({ ...reference }));
  assert.notEqual(actionMcpToolName({ capability_id: "test:a", version: 1 }), actionMcpToolName({ capability_id: "test_a", version: 1 }));
  const service = new ActionService();
  const second = { ...definition, capability_id: "test:second" };
  service.registerProvider({ provider: { provider_id: "words", title: "Words", kind: "system" }, definitions: [definition, second],
    handlers: [definition, second].map(d => ({ ...d, handle: () => [] })) });
  const ports = createActionMcpPorts({ service, context: () => context, serverInfo: { name: "actions", version: "1" }, toolName: () => "collision" });
  await assert.rejects(async () => ports.tools, /名称重复/u);
});

test("the public action tool name is molis_work_v1_action_<action>__v<version>, with the long-name rule of every MCP tool name", () => {
  // The example in docs/mcp.md.
  assert.equal(molisWorkActionToolName({ capability_id: "goals.list", version: 1 }), "molis_work_v1_action_goals.list__v1");
  assert.equal(MOLIS_WORK_ACTION_TOOL_PREFIX, "molis_work_v1_action_");
  // The prefix is part of the identity that is normalized and capped, so a long action id still gives a legal, stable, distinct name.
  const long = { capability_id: "x".repeat(150), version: 2 };
  assert.ok(molisWorkActionToolName(long).length <= 128);
  assert.match(molisWorkActionToolName(long), /^molis_work_v1_action_x+_[0-9a-f]{16}$/u);
  assert.equal(molisWorkActionToolName(long), molisWorkActionToolName({ ...long }));
  assert.notEqual(molisWorkActionToolName({ capability_id: "test:a", version: 1 }), molisWorkActionToolName({ capability_id: "test_a", version: 1 }));
  // The name that a client asks for is the one the generic rule gives to the prefixed id, and differs from the unprefixed tool name.
  const reference = { capability_id: "test:words", version: 2 };
  assert.equal(molisWorkActionToolName(reference), actionMcpToolName({ ...reference, capability_id: "molis_work_v1_action_test:words" }));
  assert.notEqual(molisWorkActionToolName(reference), actionMcpToolName(reference));
});
