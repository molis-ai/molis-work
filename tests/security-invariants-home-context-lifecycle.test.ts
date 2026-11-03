import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, promises as files } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import { deferred } from "./fixtures/home-runtime.js";
import { homeContextHost, homeContextStdio } from "./fixtures/home-context-host.js";
import { homeStorageTree } from "./fixtures/home-storage-files.js";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";

const runtimeHost = (home: string) => ({ homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: "lifecycle-session", host_declares_stable: true } });

function forwarding(t: TestContext, home: string, origin: string) {
  let localCatalogCalls = 0;
  const mcp = new LocalMcpServer(() => { localCatalogCalls++; throw new Error("A forwarding MCP cannot open a local catalog"); }, "runtime", null, runtimeHost(home), undefined, origin);
  t.after(() => mcp.close());
  return { mcp, localCatalogCalls: () => localCatalogCalls };
}

test("RAC-105-A-09: a forwarding MCP with no resident creates no Home business owner or fallback catalog", async t => {
  const home = mkdtempSync(join(tmpdir(), "home-context-offline-"));
  const remote = forwarding(t, home, "http://127.0.0.1:1");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const original = homeStorageTree(home);
  const listed = await remote.mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.ok((listed?.result as { tools: Array<{ name: string }> }).tools.some(tool => tool.name === "molis_work_v1_context_resolve"));
  await assert.rejects(remote.mcp.callTool("molis_work_v1_context_create_and_bind", { display_name: "No fallback", user_confirmed: true, idempotency_key: "offline-create" }), { code: "actions.service_unavailable" });
  assert.equal(remote.localCatalogCalls(), 0);
  assert.deepEqual(homeStorageTree(home), original);
});

test("RAC-105-A-09: the shipped stdio without an explicit Home refuses writes instead of constructing a default Home", { timeout: 60_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "home-context-no-home-"));
  const client = await homeContextStdio(t, { home: directory, origin: "http://127.0.0.1:1", omitHome: true });
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const original = homeStorageTree(directory);
  assert.ok((await client.listTools()).tools.some(tool => tool.name === "molis_work_v1_context_resolve"));
  const reply = await client.callTool({ name: "molis_work_v1_context_create_and_bind", arguments: { display_name: "No default Home", user_confirmed: true, idempotency_key: "missing-home" } });
  assert.equal(reply.isError, true); assert.match(JSON.stringify(reply), /actions.home_required/);
  await client.close();
  assert.deepEqual(homeStorageTree(directory), original);
});

test("S-07 RAC-105-A-10: unknown context delivery is sent once and a redirect never receives the Home credential", { timeout: 30_000 }, async t => {
  const home = mkdtempSync(join(tmpdir(), "home-context-uncertain-")), tokenPath = join(home, "config/web-control-token");
  mkdirSync(dirname(tokenPath)); writeFileSync(tokenPath, randomUUID(), { mode: 0o600 });
  let tools = 0, redirects = 0, redirect = false;
  const target = http.createServer((_request, response) => { redirects++; response.end("unexpected credential destination"); });
  await new Promise<void>(resolve => target.listen(0, "127.0.0.1", resolve));
  const targetAddress = target.address(); assert.ok(targetAddress && typeof targetAddress === "object");
  const service = http.createServer(async (request, response) => {
    if (redirect) { response.writeHead(302, { location: `http://127.0.0.1:${targetAddress.port}/secret` }); response.end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { operation: string };
    if (body.operation === "describe") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ instance_id: "one" })); }
    else { tools++; response.destroy(); }
  });
  await new Promise<void>(resolve => service.listen(0, "127.0.0.1", resolve));
  const address = service.address(); assert.ok(address && typeof address === "object");
  t.after(async () => { await Promise.all([target, service].map(server => new Promise<void>(resolve => server.close(() => resolve())))); rmSync(home, { recursive: true, force: true }); });
  const remote = forwarding(t, home, `http://127.0.0.1:${address.port}`), original = homeStorageTree(home);
  const input = { display_name: "Unknown result", user_confirmed: true, idempotency_key: "uncertain-create" };
  await assert.rejects(remote.mcp.callTool("molis_work_v1_context_create_and_bind", input), { code: "actions.delivery_unknown" });
  assert.equal(tools, 1); assert.equal(remote.localCatalogCalls(), 0);
  redirect = true;
  await assert.rejects(remote.mcp.callTool("molis_work_v1_context_create_and_bind", input), { code: "actions.delivery_unknown" });
  assert.equal(tools, 1); assert.equal(redirects, 0);
  assert.deepEqual(homeStorageTree(home), original);
});

for (const stop of ["subject", "host"] as const) {
  test(`S-07 RAC-105-A-10: ${stop} change during real project publication prevents a late catalog or binding commit`, { timeout: 60_000 }, async t => {
    const entered = deferred(), publish = deferred(), disconnected = deferred(), finished = deferred();
    t.after(() => publish.resolve());
    const peers = storageOwnerProcesses(t), resident = await homeContextHost(t), remote = forwarding(t, resident.home, resident.origin);
    const before = await resident.catalog({ homeDirectory: resident.home }, catalog => ({ projects: catalog.listProjects(), events: catalog.listRuntimeContextBindingEvents() }));
    await resident.catalog({ homeDirectory: resident.home }, catalog => {
      const original = catalog.createProjectAndBindRuntimeContext.bind(catalog);
      catalog.createProjectAndBindRuntimeContext = async (...arguments_) => { try { return await original(...arguments_); } finally { finished.resolve(); } };
    });
    const rename = files.rename;
    files.rename = async (source, destination) => {
      await rename(source, destination);
      if (String(source).startsWith(join(resident.home, "projects", ".staging-"))) { entered.resolve(); await publish.promise; }
    };
    t.after(() => { files.rename = rename; });
    resident.server.on("request", (request, response) => {
      if (request.url === "/api/internal/runtime-context") response.once("close", () => { if (!response.writableFinished) disconnected.resolve(); });
    });
    const pending = remote.mcp.callTool("molis_work_v1_context_create_and_bind", { display_name: "Must be rolled back", user_confirmed: true, idempotency_key: `late-${stop}` });
    const refusal = assert.rejects(pending, stop === "subject" ? /主体已变化/ : { code: "actions.host_closed" });
    await entered.promise;
    let closing: Promise<void> | undefined;
    if (stop === "subject") {
      remote.mcp.runtimeContextHost = { ...runtimeHost(resident.home), runtimeContext: { runtime_id: "other-runtime", stable_work_context_id: "other-session", host_declares_stable: true } };
      await disconnected.promise;
    } else { closing = resident.host.close(); assert.notEqual(resident.host.lifecycle(), "running"); }
    publish.resolve();
    await Promise.all([refusal, finished.promise, closing]);
    files.rename = rename;
    assert.equal(remote.localCatalogCalls(), 0);
    // A new bounded owner read after Host close is only for inspecting this isolated fixture.
    const after = stop === "host"
      ? await import("@molis-ai/molis-work-app-desktop").then(desktop => desktop.withMolisWorkProjectCatalog({ homeDirectory: resident.home }, catalog => ({ projects: catalog.listProjects(), events: catalog.listRuntimeContextBindingEvents() })))
      : await resident.catalog({ homeDirectory: resident.home }, catalog => ({ projects: catalog.listProjects(), events: catalog.listRuntimeContextBindingEvents() }));
    assert.deepEqual(after, before);
    assert.deepEqual(readdirSync(join(resident.home, "projects")).filter(name => !/^catalog\.db(?:-wal|-shm|-journal)?$/u.test(name)), [], "no staging or promoted project directory survives the cancelled publication");
    if (stop === "host") {
      const peer = await peers.start(join(resident.home, "agent-runtime"));
      assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
    }
  });
}
