import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { asideReply } from "./ending-review.js";

/**
 * Fixed model output; the Assistant, projection, HTTP, review and business effects remain real. With `pace`, the rest of the
 * first reply comes in that many pieces, `pause` ms apart, the way a model writes it.
 */
export async function assistantTextModel(t: TestContext, home: string, text: string, pace?: { pieces: number; pause: number }) {
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const finish = Promise.withResolvers<void>();
  let first = true, nextReview: string | null = null;
  const model = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    // The ending review (D1②) and knowledge's background cards are answered aside: neither is held as the first reply nor spends a scripted turn.
    const review = asideReply(raw);
    const title = review ? null : nextReview; if (!review) nextReview = null;
    const tool = title ? { name: "change-capability", input: { capability_id: "todo.items.create", version: 1, provider_id: "io.molis.work.todo", input: { title } } } : null;
    response.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    emit("message_start", { message: { id: randomUUID(), type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: randomUUID(), name: tool.name, input: {} } : { type: "text", text: "" } });
    if (first && !review) {
      first = false;
      emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "先看 **第一段**。\n\n" } });
      await finish.promise;
      const points = [...text], size = Math.ceil(points.length / (pace?.pieces ?? 1));
      for (let at = 0; at < points.length; at += size) {
        if (at && pace) await new Promise(resolve => setTimeout(resolve, pace.pause));
        emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: points.slice(at, at + size).join("") } });
      }
    } else emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text: review ?? "这一轮结束。" } });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
    emit("message_stop", {}); response.end();
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    finish.resolve(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
    if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior;
    resetSecretStoreCache();
  });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  await runWithMolisWorkHome(home, () => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    const base = `http://127.0.0.1:${address.port}`;
    const connection = withConnectorConnections(home, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", base); return created; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: base, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
  }));
  return { finish: () => finish.resolve(), review: (title: string) => { nextReview = title; } };
}
