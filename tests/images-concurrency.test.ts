import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!await check()) {
    if (Date.now() > deadline) assert.fail("Cross-process state did not settle");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test("Images Web and standard MCP share live jobs, deduplicate, cancel and recover only a killed owner", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "images-concurrency-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const databasePath = join(home, "a.sqlite");
  const ref = molisWorkHostProjectReference({ databasePath, boardId: "a", projectId: "a" });
  await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: "a", title: "Images concurrency", actor_id: "fixture", idempotency_key: "init" }));
  const token = "images-concurrent-test-control-token";
  const web = createMolisWorkWebServer({ homeDirectory: home, databasePath, boardId: "a", localHost: host, controlToken: token });
  const requests = new Map<string, ServerResponse>();
  const counts = new Map<string, number>();
  const aborted = new Set<string>();
  const provider = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const { prompt } = JSON.parse(raw);
    counts.set(prompt, (counts.get(prompt) ?? 0) + 1); requests.set(prompt, res);
    res.on("close", () => { if (!res.writableEnded) aborted.add(prompt); });
  });
  const clients: Client[] = [];
  const connect = async () => {
    const client = new Client({ name: "concurrent-images", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/images-mcp-server.ts", import.meta.url)), home, "a", "write"], stderr: "pipe" });
    let stderr = ""; transport.stderr?.on("data", chunk => { stderr += String(chunk); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${stderr}`); }
    return { client, transport };
  };
  const mcp = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name: `images.${name}__v1`, arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    await new Promise<void>(resolve => web.listen(0, "127.0.0.1", resolve));
    await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
    const webAddress = web.address(), providerAddress = provider.address();
    assert.ok(webAddress && typeof webAddress === "object" && providerAddress && typeof providerAddress === "object");
    const origin = `http://127.0.0.1:${webAddress.port}`;
    const http = async (method: string, path: string, body?: unknown, expected = 200) => {
      const result = await fetch(`${origin}/api/plugins/images${path}`, { method, headers: { "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const value = await result.json() as any; assert.equal(result.status, expected, JSON.stringify(value)); return value;
    };
    const { connection } = await http("POST", "/connections", { name: "Concurrent", api_format: "openai-images", base_url: `http://127.0.0.1:${providerAddress.port}/v1`, model: "fixture" });
    const { client, transport } = await connect();
    assert.equal((await mcp(client, "connections.list")).connections[0].id, connection.id);
    const input = (name: string) => ({ connection_id: connection.id, request_id: name, prompt: name });

    // A request may reach either transport first. Every reply must identify the
    // same original job, and the real provider must see it exactly once.
    const submissions = await Promise.all([
      http("POST", "/jobs", input("race"), 202), mcp(client, "jobs.start", input("race")),
      http("POST", "/jobs", input("race"), 202), mcp(client, "jobs.start", input("race")),
    ]);
    const race = submissions[0].job;
    assert.ok(submissions.every(result => result.job.id === race.id));
    await until(() => counts.get("race") === 1);
    assert.equal((await http("GET", `/jobs/${race.id}`)).job.status, "running");
    requests.get("race")!.writeHead(200, { "content-type": "application/json" });
    requests.get("race")!.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
    await until(async () => (await http("GET", `/jobs/${race.id}`)).job.status === "succeeded");
    const finished = (await mcp(client, "jobs.get", { id: race.id })).job;
    const bytes = await fetch(`${origin}/api/plugins/images/jobs/${race.id}/images/${finished.images[0].id}`);
    assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), Buffer.from(PNG, "base64"));

    const webJob = (await http("POST", "/jobs", input("web-owner"), 202)).job;
    const remoteJob = (await mcp(client, "jobs.start", input("remote-cancel"))).job;
    await until(() => requests.has("web-owner") && requests.has("remote-cancel"));
    assert.equal((await http("POST", "/jobs", input("over-limit"), 429)).code, "images.busy");
    const denied = await client.callTool({ name: "images.jobs.start__v1", arguments: input("over-limit") });
    assert.equal(denied.isError, true); assert.equal(counts.has("over-limit"), false);
    await http("POST", `/jobs/${remoteJob.id}/cancel`, {});
    await until(() => aborted.has("remote-cancel"));
    assert.equal((await mcp(client, "jobs.get", { id: remoteJob.id })).job.status, "cancelled");
    assert.equal((await http("GET", `/jobs/${webJob.id}`)).job.status, "running");

    const crashJob = (await mcp(client, "jobs.start", input("crashed-owner"))).job;
    await until(() => requests.has("crashed-owner"));
    assert.ok(transport.pid); process.kill(transport.pid, "SIGKILL");
    await until(async () => (await http("GET", `/jobs/${crashJob.id}`)).job.status === "interrupted");
    assert.equal((await http("GET", `/jobs/${webJob.id}`)).job.status, "running");
    const restarted = await connect();
    assert.equal((await mcp(restarted.client, "jobs.start", input("crashed-owner"))).job.status, "interrupted");
    assert.equal(counts.get("crashed-owner"), 1);
    // Closing the restarted MCP must not interrupt the Web owner's task.
    await restarted.client.close();
    assert.equal((await http("GET", `/jobs/${webJob.id}`)).job.status, "running");
    const canceller = await connect(); await mcp(canceller.client, "jobs.cancel", { id: webJob.id });
    await until(() => aborted.has("web-owner"));
    assert.equal((await http("GET", `/jobs/${webJob.id}`)).job.status, "cancelled");
    assert.equal(counts.get("race"), 1);
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await host.close();
    web.closeAllConnections(); if (web.listening) await new Promise<void>(resolve => web.close(() => resolve()));
    provider.closeAllConnections(); if (provider.listening) await new Promise<void>(resolve => provider.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
