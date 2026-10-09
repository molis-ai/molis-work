import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { imagesActions } from "@molis-ai/molis-work-plugin-images";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH } from "../apps/local-host/src/web-control-token.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!await check()) {
    if (Date.now() > deadline) assert.fail("Cross-process state did not settle");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

// One Home has one execution owner: the resident Web Host. The standard MCP launcher forwards its calls there,
// as in production, so both entries act on the same live jobs. Owner-crash recovery is covered by images-service.
test("Images Web and the standard MCP launcher share live jobs through the resident Host, deduplicate and cancel from either side", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "images-concurrency-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Images concurrency", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  // As in production the resident service writes its control token into the Home, where the MCP launcher finds it.
  const web = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  const runtime = "images-concurrency";
  const caller: ActionCallContext = { actor_id: `runtime:${runtime}`, project_id: project.project_id, audience: "mcp", permissions: [] };
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
  try {
    await new Promise<void>(resolve => web.listen(0, "127.0.0.1", resolve));
    await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
    const webAddress = web.address(), providerAddress = provider.address();
    assert.ok(webAddress && typeof webAddress === "object" && providerAddress && typeof providerAddress === "object");
    const origin = `http://127.0.0.1:${webAddress.port}`;
    const token = (await readFile(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH), "utf8")).trim();
    const http = async (method: string, path: string, body?: unknown, expected = 200) => {
      const result = await fetch(`${origin}/projects/${project.project_id}/api/plugins/images${path}`, { method, headers: { "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const value = await result.json() as any; assert.equal(result.status, expected, JSON.stringify(value)); return value;
    };
    await withCatalog({ homeDirectory: home }, c => c.bindRuntimeContext({
      context: { runtime_id: runtime, stable_work_context_id: `${runtime}-session`, host_declares_stable: true },
      project_id: project.project_id, actor_id: "user", user_confirmed: true,
    }));
    // The job actions are project-scoped; Home-wide connection actions would need a separate global grant.
    for (const view of (await host.inspectActions(caller, ref)).filter(view => view.action.scope === "project" && Object.values(imagesActions).some(action => action.capability_id === view.capability_id)))
      await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, view, true));
    const connect = async () => {
      const client = new Client({ name: "concurrent-images", version: "1" }); clients.push(client);
      const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
        MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_RUNTIME_ID: runtime,
        MOLIS_WORK_WORK_CONTEXT_ID: `${runtime}-session`, MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
      }, stderr: "pipe" });
      let stderr = ""; transport.stderr?.on("data", chunk => { stderr += String(chunk); });
      try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${stderr}`); }
      return { client, transport };
    };
    const mcp = async (client: Client, action: ActionDefinition, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name: hostActionToolName(action), arguments: args });
      assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
    };

    const { connection } = await http("POST", "/connections", { name: "Concurrent", api_format: "openai-images", base_url: `http://127.0.0.1:${providerAddress.port}/v1`, model: "fixture" });
    const { client, transport } = await connect();
    const input = (name: string) => ({ connection_id: connection.id, request_id: name, prompt: name });

    // A request may reach either entry first. Every reply identifies the same job; the provider sees it once.
    const submissions = await Promise.all([
      http("POST", "/jobs", input("race"), 202), mcp(client, imagesActions.start, input("race")),
      http("POST", "/jobs", input("race"), 202), mcp(client, imagesActions.start, input("race")),
    ]);
    const race = submissions[0].job;
    assert.ok(submissions.every(result => result.job.id === race.id));
    await until(() => counts.get("race") === 1);
    assert.equal((await mcp(client, imagesActions.get, { id: race.id })).job.status, "running");
    requests.get("race")!.writeHead(200, { "content-type": "application/json" });
    requests.get("race")!.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
    await until(async () => (await http("GET", `/jobs/${race.id}`)).job.status === "succeeded");
    const finished = (await mcp(client, imagesActions.get, { id: race.id })).job;
    const bytes = await fetch(`${origin}/projects/${project.project_id}/api/plugins/images/jobs/${race.id}/images/${finished.images[0].id}`);
    assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), Buffer.from(PNG, "base64"));

    // The Home-wide cap applies across entries, and either entry cancels the other's job.
    const webJob = (await http("POST", "/jobs", input("web-owner"), 202)).job;
    const remoteJob = (await mcp(client, imagesActions.start, input("remote-cancel"))).job;
    await until(() => requests.has("web-owner") && requests.has("remote-cancel"));
    assert.equal((await http("POST", "/jobs", input("over-limit"), 429)).code, "images.busy");
    const denied = await client.callTool({ name: hostActionToolName(imagesActions.start), arguments: input("over-limit") });
    assert.equal(denied.isError, true); assert.equal(counts.has("over-limit"), false);
    await http("POST", `/jobs/${remoteJob.id}/cancel`, {});
    await until(() => aborted.has("remote-cancel"));
    assert.equal((await mcp(client, imagesActions.get, { id: remoteJob.id })).job.status, "cancelled");
    assert.equal((await http("GET", `/jobs/${webJob.id}`)).job.status, "running");

    // A crashed MCP client does not own work: its job keeps running on the Host and finishes once.
    const clientJob = (await mcp(client, imagesActions.start, input("client-crash"))).job;
    await until(() => requests.has("client-crash"));
    assert.ok(transport.pid); process.kill(transport.pid, "SIGKILL");
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal((await http("GET", `/jobs/${clientJob.id}`)).job.status, "running");
    requests.get("client-crash")!.writeHead(200, { "content-type": "application/json" });
    requests.get("client-crash")!.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
    await until(async () => (await http("GET", `/jobs/${clientJob.id}`)).job.status === "succeeded");
    const restarted = await connect();
    assert.equal((await mcp(restarted.client, imagesActions.start, input("client-crash"))).job.status, "succeeded");
    assert.equal(counts.get("client-crash"), 1);
    // Closing a client does not interrupt the Web job; a new client can still cancel it.
    await restarted.client.close();
    assert.equal((await http("GET", `/jobs/${webJob.id}`)).job.status, "running");
    const canceller = await connect(); await mcp(canceller.client, imagesActions.cancel, { id: webJob.id });
    await until(() => aborted.has("web-owner"));
    assert.equal((await http("GET", `/jobs/${webJob.id}`)).job.status, "cancelled");
    assert.equal(counts.get("race"), 1);
  } finally {
    await Promise.all(clients.map(client => client.close().catch(() => undefined)));
    await host.close();
    web.closeAllConnections(); if (web.listening) await new Promise<void>(resolve => web.close(() => resolve()));
    provider.closeAllConnections(); if (provider.listening) await new Promise<void>(resolve => provider.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
