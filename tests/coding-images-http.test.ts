import { pluginActions, withFakeAgentHost } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent, type AgentStartRequest, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectDirectoryActions } from "@molis-ai/molis-work-contracts/modules/projects";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

// Coding A3 (specs/coding-plugin/next-requirements.md, docs/design/coding-daily-basics scheme A): a picture pasted into Coding's composer
// is kept by the platform's material service as Coding's own conversation attachment (platform capability audit §6), the round names it
// by reference only, and the conversation reads it back from the round it went with.

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function codingServer() {
  const root = mkdtempSync(join(tmpdir(), "coding-images-http-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  await codingSessions(store).create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "首屏", runtime_id: "prologue", at: new Date().toISOString() });
  const starts: AgentStartRequest[] = []; let latest: AgentRunView | undefined;
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: pluginActions(store, DEMO_PROJECT_ID), actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    agentHost: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectDirectoryActions.get.capability_id) return [{ workspace_id: "work", canonical_path: root }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "writer", available: true }] as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      if (definition.capability_id === agent.createSession.capability_id) return { runtime_id: "prologue", session_id: "sdk" } as Output;
      if (definition.capability_id === agent.startRun.capability_id) {
        const request = structuredClone((args as [unknown, AgentStartRequest])[1]); starts.push(request);
        latest = { ref: { session_id: "sdk", run_id: "run" }, phase: "completed", started_at: "2026-11-17T00:00:00Z", ended_at: "2026-11-17T00:00:01Z",
          frozen: { role_id: "writer", role_version: 1, execution: "workspace-write", model_id: "m", directory: { canonical_path: root, realpath_verified: true },
            prompts: [], skills: [], mcp_tools: [], host_tools: [], budget: null, text_materials: [], ...(request.image_materials ? { image_materials: request.image_materials } : {}) },
          turns: [{ turn_id: "t", kind: "user", text: request.task, at: null }], activity: [], usage: { tokens: { input: 0, output: 0 } }, awaiting_input: [] } as never;
        return { ref: latest!.ref, frozen: latest!.frozen } as Output;
      }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: latest ? [latest.ref] : [] } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return latest as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host())).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (suffix: string, method = "GET", body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app${suffix}`, {
      method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }); return { status: result.status, body: await result.json() as Record<string, unknown> };
  };
  const close = async () => { await new Promise<void>(resolve => server.close(() => resolve())); releaseProjectPlugins(); store.close(); rmSync(root, { recursive: true, force: true }); };
  return { request, starts, close };
}

test("A3 a pasted picture is kept by the platform as Coding's attachment, goes with the round by reference, and reads back from it", async () => {
  const f = await codingServer();
  try {
    const kept = await f.request("/attachments", "POST", { name: "首屏.png", data: PNG });
    assert.equal(kept.status, 200, JSON.stringify(kept.body));
    const image = kept.body.image as { title: string; media_type: string; byte_length: number; attachment: { subject: { kind: string; id: string }; pin: { mode: string } } };
    assert.equal(image.media_type, "image/png");
    assert.equal(image.byte_length, Buffer.from(PNG, "base64").byteLength);
    assert.equal(image.attachment.pin.mode, "current", "a reference the platform gave, not the bytes");
    assert.ok(!JSON.stringify(image).includes(PNG), "the answer carries no bytes");
    // The same bytes again are the same attachment.
    const again = await f.request("/attachments", "POST", { name: "首屏.png", data: PNG });
    assert.deepEqual((again.body.image as typeof image).attachment, image.attachment);

    const started = await f.request("/runs", "POST", { task: "照这张图改首屏", intent: "edit", workspace_id: "work", provider_id: "p", model_id: "m",
      images: [{ material_id: "image-1", title: image.title, media_type: image.media_type, attachment: image.attachment }] });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.deepEqual(f.starts.at(-1)!.image_materials, [{ material_id: "image-1", title: image.title, media_type: "image/png", attachment: image.attachment }]);

    const back = await f.request("/runs/run/images/image-1");
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.deepEqual(back.body, { title: image.title, media_type: "image/png", data: PNG });
    const other = await f.request("/runs/run/images/image-2");
    assert.notEqual(other.status, 200, "only a picture the round carried reads back");
  } finally { await f.close(); }
});

test("A3 what is not a picture the model can be shown, or is over 5 MB, is refused before a round", async () => {
  const f = await codingServer();
  try {
    const text = await f.request("/attachments", "POST", { name: "notes.txt", data: Buffer.from("hello").toString("base64") });
    assert.notEqual(text.status, 200, "a text file is not a picture");
    const large = await f.request("/attachments", "POST", { name: "big.png", data: "A".repeat(Math.ceil(5 * 1024 * 1024 / 3) * 4 + 4) });
    assert.notEqual(large.status, 200, "over 5 MB is refused at the route");
    const start = await f.request("/runs", "POST", { task: "看图", intent: "edit", workspace_id: "work", provider_id: "p", model_id: "m",
      images: [{ material_id: "x", title: "x", media_type: "image/svg+xml", attachment: { subject: { kind: "k", id: "i" }, pin: { mode: "current", read_revision: "r" } } }] });
    assert.notEqual(start.status, 200, "an SVG is not one of the picture types");
    assert.equal(f.starts.length, 0, "no round started");
  } finally { await f.close(); }
});

test("A3 a round's pictures are references the platform gave, at most six", async () => {
  const f = await codingServer();
  try {
    const one = (id: string) => ({ material_id: id, title: id, media_type: "image/png", attachment: { subject: { kind: "conversation-attachment", id }, pin: { mode: "current", read_revision: "r" } } });
    const start = (images: unknown) => f.request("/runs", "POST", { task: "看图", intent: "edit", workspace_id: "work", provider_id: "p", model_id: "m", images });
    assert.notEqual((await start(Array.from({ length: 7 }, (_, index) => one(String(index))))).status, 200, "seven pictures are too many for one round");
    assert.notEqual((await start([{ ...one("a"), attachment: { subject: { kind: "k", id: "i" }, pin: { mode: "fixed" } } }])).status, 200, "not a kept attachment's reference");
    assert.notEqual((await start([{ material_id: "a", title: "a", media_type: "image/png", data: PNG }])).status, 200, "bytes are not a reference");
    assert.equal(f.starts.length, 0, "no round started");
  } finally { await f.close(); }
});
