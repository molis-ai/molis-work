import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
type ImageJob = { id: string; status: string; images: Array<{ id: string }> };

export async function callImageTool<Result>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const result = await client.callTool({ name: `images.${name}__v1`, arguments: args });
  assert.equal(result.isError, false, JSON.stringify(result));
  return result.structuredContent as Result;
}

export async function openImagesMcp(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "images-mcp-"));
  const clients: Client[] = [];
  let calls = 0;
  const provider = createServer(async (request, response) => {
    for await (const _ of request) { /* drain the upload before replying */ }
    calls++;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
  });
  t.after(async () => {
    try {
      await Promise.all(clients.map(client => client.close()));
    } finally {
      const closed = new Promise<void>(resolve => provider.close(() => resolve()));
      provider.closeAllConnections();
      await closed;
      await rm(home, { recursive: true, force: true });
    }
  });
  await new Promise<void>((resolve, reject) => {
    provider.once("error", reject);
    provider.listen(0, "127.0.0.1", resolve);
  });
  const address = provider.address();
  assert.ok(address && typeof address === "object");
  const connect = async (project: string, access = "write") => {
    const client = new Client({ name: "external-images", version: "1" });
    clients.push(client);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("./images-mcp-server.ts", import.meta.url)), home, project, access],
      stderr: "pipe",
    });
    let errors = "";
    transport.stderr?.on("data", data => { errors += String(data); });
    try {
      await client.connect(transport);
    } catch (error) {
      throw new Error(`${String(error)}\n${errors}`);
    }
    return client;
  };
  // The person saves the image service (an MCP client may use the person's services, not write them: UPP-15). Run while no client is
  // connected: the seed opens the same Home.
  const saveConnection = async (project = "a") => JSON.parse(execFileSync(process.execPath,
    [fileURLToPath(new URL("./images-mcp-seed.ts", import.meta.url)), home, project, `http://127.0.0.1:${address.port}/v1`], { encoding: "utf8" })) as { id: string };
  const generate = async (client: Client, connectionId: string) => {
    const input = { request_id: "same-click", connection_id: connectionId, prompt: "MCP image" };
    const { job } = await callImageTool<{ job: ImageJob }>(client, "jobs.start", input);
    assert.equal((await callImageTool<{ job: ImageJob }>(client, "jobs.start", input)).job.id, job.id);
    const deadline = Date.now() + 5_000;
    let completed: ImageJob;
    do {
      completed = (await callImageTool<{ job: ImageJob }>(client, "jobs.get", { id: job.id })).job;
      if (completed.status === "running") await new Promise(resolve => setTimeout(resolve, 15));
    } while (completed.status === "running" && Date.now() < deadline);
    assert.equal(completed.status, "succeeded");
    assert.equal(calls, 1);
    const query = { id: job.id, image_id: completed.images[0]!.id };
    const image = await callImageTool<{ base64: string }>(client, "images.read", query);
    assert.deepEqual(Buffer.from(image.base64, "base64"), Buffer.from(PNG, "base64"));
    return { jobId: job.id, input, query, image };
  };
  return { connect, saveConnection, generate, providerCalls: () => calls };
}
