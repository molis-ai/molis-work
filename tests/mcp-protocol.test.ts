import assert from "node:assert/strict";
import test from "node:test";
import { handleMcpMessage, type McpProtocolPorts, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";

const serverInfo = { name: "molis-work-mcp", version: "1.0.0" };
const tools = [{ name: "fixture-query", description: "Read fixture", inputSchema: { type: "object" } }];

test("MCP protocol negotiation, discovery and notifications do not execute application work", async () => {
  const ports: McpProtocolPorts = { serverInfo, tools,
    callTool: async () => { assert.fail("Protocol-only request executed application work"); },
    formatToolError: () => { assert.fail("Protocol-only request formatted an application error"); } };
  assert.deepEqual(await handleMcpMessage({ id: 0, method: "initialize" }, ports), {
    jsonrpc: "2.0", id: 0, result: { protocolVersion: "2025-03-26", serverInfo,
      capabilities: { tools: {}, resources: { subscribe: false, listChanged: false } } },
  });
  const initialized = await handleMcpMessage({ id: "client-id", method: "initialize", params: { protocolVersion: "client-version" } }, ports);
  assert.equal((initialized?.result as { protocolVersion: string }).protocolVersion, "client-version");
  assert.equal(initialized?.id, "client-id");
  assert.equal(await handleMcpMessage({ method: "notifications/initialized" }, ports), null);
  for (const [method, result] of [["ping", {}], ["tools/list", { tools }], ["resources/list", { resources: [] }],
    ["resources/templates/list", { resourceTemplates: [] }]] as const) {
    assert.deepEqual(await handleMcpMessage({ id: 7, method }, ports), { jsonrpc: "2.0", id: 7, result });
  }
  assert.deepEqual(await handleMcpMessage({ id: 8, method: "missing" }, ports), {
    jsonrpc: "2.0", id: 8, error: { code: -32601, message: "Method not found: missing" },
  });
});

test("MCP invokes the application once with unchanged arguments and host-only metadata precedence", async () => {
  const calls: Array<{ name: string; arguments_: Record<string, unknown>; context: McpToolCallContext }> = [];
  const ports: McpProtocolPorts = { serverInfo, tools,
    callTool: async (name, arguments_, context) => { calls.push({ name, arguments_, context }); return '{"result":"原始输出"}'; },
    formatToolError: () => assert.fail("Successful call formatted an error") };
  const input = { board_id: "selected", _meta: { threadId: "model-input-not-host" }, idempotency_key: "unchanged-key" };
  const cases: Array<[unknown, McpToolCallContext]> = [
    [{ "molis-work/sessionId": " dedicated ", threadId: "thread", sessionId: "session" }, { runtimeSessionId: "dedicated", runtimeSessionIdSource: "molis-work/sessionId" }],
    [{ "goalboard/sessionId": " legacy-session ", threadId: "thread", sessionId: "session" }, { runtimeSessionId: "thread", runtimeSessionIdSource: "threadId" }],
    [{ "molis-work/sessionId": " ", threadId: " thread ", sessionId: "session" }, { runtimeSessionId: "thread", runtimeSessionIdSource: "threadId" }],
    [{ threadId: 123, sessionId: " session " }, { runtimeSessionId: "session", runtimeSessionIdSource: "sessionId" }],
    [undefined, { runtimeSessionId: null, runtimeSessionIdSource: null }],
    [[], { runtimeSessionId: null, runtimeSessionIdSource: null }],
  ];
  for (const [meta, expected] of cases) {
    const previousCount = calls.length;
    const response = await handleMcpMessage({ id: "tool-id", method: "tools/call", params: { name: "fixture-query", arguments: input, _meta: meta } }, ports);
    assert.equal(calls.length, previousCount + 1);
    assert.equal(calls.at(-1)?.name, "fixture-query");
    assert.equal(calls.at(-1)?.arguments_, input);
    assert.deepEqual(calls.at(-1)?.context, expected);
    assert.deepEqual(response, { jsonrpc: "2.0", id: "tool-id", result: { content: [{ type: "text", text: '{"result":"原始输出"}' }], isError: false } });
  }
  await handleMcpMessage({ id: 1, method: "tools/call", params: { name: "fixture-query" } }, ports);
  assert.deepEqual(calls.at(-1)?.arguments_, {});
});

test("MCP returns application errors through the host formatter without retrying or reporting success", async () => {
  const failure = new Error("Denied by owner");
  let calls = 0;
  let formats = 0;
  const ports: McpProtocolPorts = { serverInfo, tools,
    callTool: async () => { calls += 1; throw failure; },
    formatToolError: (error) => { formats += 1; assert.equal(error, failure); return '错误: Denied by owner\n{"code":"owner.denied"}'; } };
  assert.deepEqual(await handleMcpMessage({ id: 9, method: "tools/call", params: { name: "fixture-query" } }, ports), {
    jsonrpc: "2.0", id: 9, result: { content: [{ type: "text", text: '错误: Denied by owner\n{"code":"owner.denied"}' }], isError: true },
  });
  assert.equal(calls, 1);
  assert.equal(formats, 1);
});
