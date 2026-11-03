import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { ActionCallContext, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelClient, PluginModelRequest, PluginModelResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { BoundedInferenceReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { PrologueInferenceError, type PrologueTextInput } from "@molis-ai/molis-work-service-agent-host";
import { grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./home-runtime.js";

export const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
export const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
type ModelRequest = { model: string; messages: { role: string; content: unknown }[] };
type Run = (model: PluginModelClient, caller: ActionExecutionContext) => Promise<string>;

/** A real Home Runtime and SDK with a controllable HTTP provider, never a fabricated model receipt. */
export async function modelRuntimeFixture(t: TestContext, format: "openai-chat-completions" | "anthropic-messages" = "openai-chat-completions") {
  const probe = homeProbe("model-materials");
  let run: Run = async model => (await model.complete(instructed(probe.instruction, "材料"))).text;
  const start = probe.definition.start!;
  const definition = { ...probe.definition, async start(context: Parameters<typeof start>[0]) {
    const contribution = await start(context);
    assert.equal(contribution.kind, "app");
    return { ...contribution, actions: contribution.actions?.map(action => action.capability_id === probe.ask.capability_id
      ? { ...action, handle: (caller: ActionExecutionContext) => run(context.services!.model!, caller) } : action) };
  } };
  const f = await serveHomeRuntime(t, { completeText: undefined, pluginFixtures: { home: [definition] } });
  const { platform, install } = await grantHomeProbe(f.host, probe);
  const requests: ModelRequest[] = [], receipts: BoundedInferenceReceipt[] = [];
  const sources: { root: string; label?: string; bytes: Buffer; mode: number; directoryMode: number }[] = [];
  let answer: () => Promise<{ text: string; status?: number }> = async () => ({ text: '{"answer":"original"}' });
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(raw) as ModelRequest; requests.push(body);
    const reply = await answer();
    if (response.destroyed) return;
    if (reply.status) { response.writeHead(reply.status, { "content-type": "application/json" }); response.end('{"error":{"message":"controlled provider failure"}}'); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (format === "anthropic-messages") {
      const event = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
      event("message_start", { message: { id: "shm", type: "message", role: "assistant", model: "reported-vision", content: [], usage: { input_tokens: 12, output_tokens: 0 } } });
      event("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      event("content_block_delta", { index: 0, delta: { type: "text_delta", text: reply.text } });
      event("content_block_stop", { index: 0 }); event("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }); event("message_stop", {});
    } else {
      response.write(`data: ${JSON.stringify({ model: "reported-vision", choices: [{ index: 0, delta: { content: reply.text }, finish_reason: null }] })}\n\n`);
      response.write('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
    }
    response.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const connectionResponse = await f.request("/api/settings/connectors/connections", { method: "POST", body: { service_id: "model-api", display_name: "SHM model", token: randomUUID() } });
  assert.equal(connectionResponse.status, 201);
  const { connection } = await connectionResponse.json() as { connection: { connection_id: string } };
  const selection = { provider_id: "shm", model_id: "vision" };
  const save = async (enabled = true, vision = true) => {
    const response = await f.request("/api/settings/models/shm", { method: "POST", body: { display_name: "SHM", base_url: `http://127.0.0.1:${address.port}/v1`,
      api_format: format, prompt_cache: "off", enabled, connection_id: connection.connection_id, check_connection: false,
      models: [{ model_id: "vision", enabled: true, vision }, { model_id: "text", enabled: true }] } });
    assert.equal(response.status, 200, await response.text());
  };
  await save();
  const inference = ensureSystemAgentService(f.host, f.home).inference, actual = inference.completeTextResult.bind(inference);
  t.mock.method(inference, "completeTextResult", async (input: PrologueTextInput) => {
    for (const image of input.images ?? []) sources.push({ root: image.root_path, label: image.label,
      bytes: await readFile(join(image.root_path, image.relative_path)), mode: (await stat(join(image.root_path, image.relative_path))).mode & 0o777,
      directoryMode: (await stat(image.root_path)).mode & 0o777 });
    try {
      const result = await actual(input);
      receipts.push({ run_ref: result.run_ref, state: result.state, configuredModel: result.configuredModel, reportedModels: result.reportedModels, usage: result.usage });
      return result;
    } catch (error) { if (error instanceof PrologueInferenceError && error.execution) receipts.push(error.execution); throw error; }
  });
  const complete = (model: PluginModelClient, request: PluginModelRequest = {}) => model.complete(instructed(probe.instruction, "材料"), { selection, ...request });
  const invoke = (next: Run, context: Partial<ActionCallContext> = {}) => { run = next; return f.host.homeActionClient().invoke({ ...person(probe.permissions), ...context }, probe.ask, {}); };
  return { ...f, probe, platform, install, selection, connectionId: connection.connection_id, requests, receipts, sources, save, complete, invoke,
    base: `http://127.0.0.1:${address.port}`,
    model: () => probe.contexts.at(-1)!.services!.model!,
    answer: (next: typeof answer) => { answer = next; },
    async result(request: PluginModelRequest = {}): Promise<PluginModelResult> {
      let result!: PluginModelResult;
      await invoke(async model => { result = await complete(model, request); return result.text; });
      return result;
    },
    async assertClean() {
      for (const root of new Set(sources.map(source => source.root))) await assert.rejects(access(root), { code: "ENOENT" });
      for (const kind of ["staged", "published"]) assert.deepEqual(await readdir(join(f.home, "agent-runtime", "intake", kind)).catch(error => {
        if (error.code === "ENOENT") return []; throw error;
      }), []);
    },
  };
}
