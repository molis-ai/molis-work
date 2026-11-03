import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { asideReply } from "./ending-review.js";

/** The request body an Anthropic-compatible model receives. */
export interface ModelWire { system?: unknown; tools?: unknown; messages: Array<{ role: string; content: unknown }> }

/**
 * The Home's configured text model, on 127.0.0.1: it records every request the Host's real path sends (instructions resolved from
 * the register, the Host's system text, the data) and answers each with `answer(request)`.
 */
export async function recordingTextModel(t: TestContext, home: string, answer: (request: ModelWire) => string) {
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const requests: ModelWire[] = [];
  const model = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    // A round that changed nothing has its ending reviewed (D1②), and a project's pieces get background knowledge cards: both are answered aside, not recorded.
    const wire = JSON.parse(body) as ModelWire, review = asideReply(body); if (!review) requests.push(wire);
    response.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    emit("message_start", { message: { id: randomUUID(), type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: review ?? answer(wire) } });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
    emit("message_stop", {}); response.end();
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
    if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior;
    resetSecretStoreCache();
  });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  await runWithMolisWorkHome(home, () => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    const connection = withConnectorConnections(home, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", base); return created; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: base, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
  }));
  return { requests, base };
}

/** The text of a request's messages, joined. */
export function wireText(request: ModelWire): string {
  return request.messages.map(message => typeof message.content === "string" ? message.content
    : (message.content as Array<{ text?: string }>).map(part => part.text ?? "").join("")).join("\n");
}
