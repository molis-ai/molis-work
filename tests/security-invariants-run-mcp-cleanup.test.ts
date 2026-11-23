import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { MCP_FIXTURE } from "./fixtures/mcp-notes-server.js";

async function until<T>(read: () => Promise<T | undefined>, message: string): Promise<T> {
  for (const limit = Date.now() + 10_000; ;) {
    const value = await read(); if (value !== undefined) return value;
    assert.ok(Date.now() < limit, message); await new Promise(resolve => setTimeout(resolve, 10));
  }
}

for (const remoteSession of [true, false]) test(`ASC-51/APR-11: stopping a native MCP Run preserves its original cancellation (remote session ${remoteSession ? "present" : "absent"})`, { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-mcp-run-cleanup-")), queue = new AgentReviewQueue();
  let businessId: unknown, cancelledId: unknown, deletedSession: string | undefined;
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method === "DELETE") { deletedSession = String(request.headers["mcp-session-id"]); response.writeHead(204).end(); return; }
      let text = "";
      for await (const chunk of request.setEncoding("utf8")) text += chunk;
      const message = JSON.parse(text) as { id?: unknown; method: string; params?: { requestId?: unknown } };
      if (message.method === "tools/call") { businessId = message.id; return; }
      if (message.method === "notifications/cancelled") cancelledId = message.params?.requestId;
      if (message.id === undefined) { response.writeHead(202).end(); return; }
      const result = message.method === "initialize"
        ? { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "cleanup", version: "1" } }
        : { tools: [{ name: "record_note", description: "Record one note", inputSchema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] } }] };
      response.writeHead(200, { "content-type": "application/json", ...(remoteSession ? { "mcp-session-id": "original-remote-session" } : {}) }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
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
  assert.equal(deletedSession, remoteSession ? "original-remote-session" : undefined, "only the original remote session may be deleted");
});

test("APR-07/08/11: a real MCP pipe reuses an exact work authorization after restart, and refuses a changed tool or directory", { timeout: 60_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "molis-mcp-permission-")));
  const owner = { project_id: "project", plugin_id: "fixture.coding", install_id: "fixture", actor_id: "person" };
  const directory = { canonical_path: root, realpath_verified: true };
  const file = join(root, "mcp-notes.jsonl"), script = join(root, "notes.mjs"), release = join(root, "finish-reply");
  const delayedFixture = MCP_FIXTURE.replace("result={content:", `if(m.params.arguments.note==='Late reply'){
    const {existsSync}=await import('node:fs');
    while(!existsSync('finish-reply'))await new Promise(resolve=>setTimeout(resolve,10));
  }result={content:`);
  await writeFile(script, delayedFixture);
  let note = "Exact note", send = true, directoryGeneration = "original-directory", directoryAvailable = true;
  const modelInputs: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = await new Request(input, init).text();
    modelInputs.push(body);
    if (!send) return cogniaScriptedResponse(undefined, "Finished checking the note.");
    send = false;
    const request = JSON.parse(body) as { tools?: Array<{ name: string; input_schema?: { properties?: { note?: unknown } } }> };
    const tool = request.tools?.find(entry => entry.input_schema?.properties?.note);
    assert.ok(tool, "the real selected MCP tool is declared");
    return cogniaScriptedResponse({ name: tool.name, input: { note } });
  });
  const open = async () => {
    const queue = new AgentReviewQueue();
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.run-mcp-permission", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
      checks: { holdWorkspaceDirectory: async (project, path) => {
        assert.deepEqual([project, path], [owner.project_id, root]);
        const identity = directoryGeneration;
        const assertCurrent = () => {
          if (!directoryAvailable || directoryGeneration !== identity) throw new Error("原目录已变化");
        };
        assertCurrent();
        return { identity, assertCurrent, beforeEffect: assertCurrent };
      } },
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
      resolveCredential: () => "test-only" });
    return { adapter, queue };
  };
  let { adapter, queue } = await open();
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const saved = await adapter.mcpLibrary!.save(owner, { expected_version: 0, label: "Original pipe", enabled: true, transport: "stdio", timeout_ms: 5000,
    directory, executable: "node", argv: ["notes.mjs"] });
  await adapter.mcpLibrary!.control(owner, saved.id, "connect");
  const session = await adapter.createSession({ ...owner, directory, title: "Review external notes" });
  const subject = { kind: "work" as const, project_id: owner.project_id, actor_id: owner.actor_id, work: { owner_id: owner.plugin_id, id: session.session_id },
    executor: { plugin_id: owner.plugin_id, install_id: owner.install_id, installation_generation: "original", role_id: "worker" } };
  const notes = async () => (await readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; }))
    .split("\n").filter(Boolean).map(line => JSON.parse(line).note);
  const start = async () => {
    send = true;
    const tools = (await adapter.mcpLibrary!.list(owner))[0]!.tools;
    return adapter.start({ ...owner, session, directory, role_id: "worker", task: "Record one note.", mcp_tools: tools, budget: { max_turns: 2 },
      role: { role_id: "worker", version: 1, execution: "workspace-write", prompts: [], host_tools: [] } },
      { delegation: { subject, session_owner_id: owner.project_id } });
  };
  const pending = (runId: string) => until(async () => queue.list(owner.project_id, "pending").find(row => row.run?.run_id === runId
    && queue.hasExactPermission(row.review_id)), "original MCP review did not appear");
  const settled = (ref: Awaited<ReturnType<typeof start>>["ref"]) => until(async () => {
    const view = await adapter.read(ref);
    return ["completed", "failed", "cancelled", "stopped"].includes(view.phase) && !adapter.sessionTransitionPending(ref) ? view : undefined;
  }, "MCP run did not settle");
  let run = await start();
  const review = await pending(run.ref.run_id);
  const candidate = queue.exactPermission(review.review_id, review.reference.version);
  assert.ok(candidate && candidate.scope.kind === "mcp-exact");
  assert.equal(candidate.scope.source_id, saved.id);
  assert.deepEqual(JSON.parse(candidate.scope.input_json), { note });
  assert.deepEqual(await notes(), []);
  const store = adapter.delegations;
  const permission = await store.read(subject);
  await store.grant(subject, { expected_version: permission!.storage_version, mode: "automatic", scopes: [candidate.scope], expires_at: null },
    { beforeEffect: candidate.beforeEffect, assertCurrent: candidate.assertPending });
  await settled(run.ref);
  assert.deepEqual(await notes(), [], "choosing future authority does not answer the original operation");
  run = await start(); await settled(run.ref);
  assert.deepEqual(await notes(), ["Exact note"]);
  assert.ok(queue.list(owner.project_id, "approved").some(row => queue.receipt(row.review_id)?.source?.kind === "delegation"));

  await adapter.close(); ({ adapter, queue } = await open());
  await adapter.mcpLibrary!.control(owner, saved.id, "connect");
  run = await start(); await settled(run.ref);
  assert.deepEqual(await notes(), ["Exact note", "Exact note"]);

  note = "Different note"; run = await start();
  const changed = await pending(run.ref.run_id);
  directoryAvailable = false;
  await assert.rejects(queue.respond({ review_id: changed.review_id, version: changed.reference.version, decision: "approve", actor_id: owner.actor_id }));
  await adapter.control(run.ref, { kind: "stop" }); await settled(run.ref);
  assert.deepEqual(await notes(), ["Exact note", "Exact note"], "withdrawn directory receives zero additional pipe writes");

  await adapter.mcpLibrary!.control(owner, saved.id, "disconnect");
  directoryAvailable = true; note = "Exact note";
  await writeFile(script, MCP_FIXTURE.replace("note:{type:'string'}", "note:{type:'string'},category:{type:'string'}"));
  await adapter.mcpLibrary!.control(owner, saved.id, "connect");
  run = await start(); const changedTool = await pending(run.ref.run_id);
  const current = queue.exactPermission(changedTool.review_id, changedTool.reference.version);
  assert.ok(current?.scope.kind === "mcp-exact");
  assert.notEqual(current.scope.tool_digest, candidate.scope.tool_digest);
  assert.deepEqual(await notes(), ["Exact note", "Exact note"], "new tool shape never inherits the old decision");
  await adapter.control(run.ref, { kind: "stop" }); await settled(run.ref);

  await adapter.mcpLibrary!.control(owner, saved.id, "disconnect");
  await writeFile(script, delayedFixture);
  await adapter.mcpLibrary!.control(owner, saved.id, "connect");
  directoryAvailable = true; note = "Late reply";
  run = await start();
  const late = await pending(run.ref.run_id);
  await queue.respond({ review_id: late.review_id, version: late.reference.version, decision: "approve", actor_id: owner.actor_id });
  await until(async () => (await notes()).includes("Late reply") ? true : undefined, "the pipe should write before the original directory is revoked");
  directoryAvailable = false;
  await writeFile(release, "");
  await until(async () => { await queue.refresh(owner.project_id); return queue.receipt(late.review_id)?.effect_uncertain || undefined; }, "late response should leave the sent request awaiting reconciliation");
  assert.ok(modelInputs.every(body => !body.includes("Saved one note: Late reply")), "the revoked result never reaches the model");
  assert.deepEqual(await notes(), ["Exact note", "Exact note", "Late reply"], "the original effect was sent once and was not replayed");
  directoryAvailable = true;
  await assert.rejects(start(), { code: "agent.session_busy" });
});
