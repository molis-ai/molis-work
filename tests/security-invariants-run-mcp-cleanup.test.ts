import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

async function until<T>(read: () => Promise<T | undefined>, message: string): Promise<T> {
  for (const limit = Date.now() + 10_000; ;) {
    const value = await read(); if (value !== undefined) return value;
    assert.ok(Date.now() < limit, message); await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test("ASC-51/APR-11: stopping a native MCP Run preserves its original cancellation and remote session cleanup", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-mcp-run-cleanup-")), queue = new AgentReviewQueue();
  let businessId: unknown, cancelledId: unknown, deletedSession: string | undefined;
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method === "DELETE") { deletedSession = String(request.headers["mcp-session-id"]); response.writeHead(204).end(); return; }
      let text = ""; for await (const chunk of request) text += String(chunk);
      const message = JSON.parse(text) as { id?: unknown; method: string; params?: { requestId?: unknown } };
      if (message.method === "tools/call") { businessId = message.id; return; }
      if (message.method === "notifications/cancelled") cancelledId = message.params?.requestId;
      if (message.id === undefined) { response.writeHead(202).end(); return; }
      const result = message.method === "initialize"
        ? { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "cleanup", version: "1" } }
        : { tools: [{ name: "record_note", description: "Record one note", inputSchema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] } }] };
      response.writeHead(200, { "content-type": "application/json", "mcp-session-id": "original-remote-session" }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    })().catch(error => { response.writeHead(500).end(String(error)); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url.startsWith("http://127.0.0.1:")) return originalFetch(input, init);
    const body = await request.json() as { tools?: Array<{ name: string; input_schema?: { properties?: { note?: unknown } } }> };
    const tool = body.tools?.find(entry => entry.input_schema?.properties?.note); assert.ok(tool, "the real selected MCP tool is declared");
    return cogniaScriptedResponse({ name: tool.name, input: { note: "Original request" } });
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.run-mcp-cleanup", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  t.after(async () => {
    await adapter.close(); server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  });
  const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "fixture", actor_id: "person" }, library = adapter.mcpLibrary!;
  const saved = await library.save(owner, { expected_version: 0, label: "Original MCP", enabled: true, transport: "http", timeout_ms: 20_000,
    endpoint: `http://127.0.0.1:${address.port}/mcp`, auth: { kind: "none" } });
  await library.control(owner, saved.id, "connect");
  const tools = (await library.list(owner))[0]!.tools; assert.equal(tools.length, 1);
  const directory = { canonical_path: root, realpath_verified: true }, session = await adapter.createSession({ ...owner, directory, title: "Cancel native MCP" });
  const run = await adapter.start({ ...owner, session, directory, role_id: "worker", task: "Record one note.", mcp_tools: tools,
    role: { role_id: "worker", version: 1, execution: "workspace-write", prompts: [], host_tools: [] } });
  const review = await until(async () => queue.list(owner.project_id, "pending")[0], "original MCP review did not appear");
  await queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: owner.actor_id });
  await until(async () => businessId, "approved native MCP call never reached the server");
  await adapter.control(run.ref, { kind: "stop" });
  await until(async () => cancelledId, "stopping the original Run blocked its cancellation notification");
  assert.equal(cancelledId, businessId, "cleanup names the exact request already sent");
  await library.control(owner, saved.id, "disconnect");
  assert.equal(deletedSession, "original-remote-session", "no Run guard is needed to close the original remote session");
});
