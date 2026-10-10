import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";

function reply(tool?: { name: string; input: unknown }, text = "请确认建议卡中的标题和类型。"): string {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: randomUUID(), type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: randomUUID(), name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {}); return events.join("");
}

/** Model replies are scripted; the Assistant, vision intake, action directory and confirmation stay real. */
export async function issueModel(t: TestContext, home: string, behavior: { replyText?: string } = {}) {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const requests: unknown[] = [], rounds = new Map<string, number>();
  const model = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); requests.push(body);
    const draft_id = JSON.stringify(body).match(/录入草稿 ([0-9a-f-]{36})/)?.[1] ?? "missing-draft";
    const turn = rounds.get(draft_id) ?? 0; rounds.set(draft_id, turn + 1);
    const tool = turn === 0 ? { name: "find-capabilities", input: { query: "issues.capture" } } : turn === 1 ? {
      name: "suggest-action", input: { title: "确认记录问题", summary: "切换页面后输入丢失，建议归为 Bug", capability_id: "issues.capture", version: 1,
        provider_id: "io.molis.work.issues", input: { draft_id, title: "切换页面后输入内容丢失", type: "bug" }, editable: ["title", "type"] },
    } : undefined;
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(reply(behavior.replyText ? undefined : tool, behavior.replyText));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
    if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const address = model.address(); if (!address || typeof address === "string") throw new Error("Fixture model did not listen");
  await runWithMolisWorkHome(home, () => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    const base = `http://127.0.0.1:${address.port}`;
    const connection = withConnectorConnections(home, store => { const item = store.createToken({ serviceId: "model-api", displayName: "Issue fixture", token: "fixture-local-model-key" });
      store.assertTarget(item.connection_id, "model-api", base); return item; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "issue-fixture", display_name: "Issue 本机测试", base_url: base,
      api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true, vision: true }] });
  }));
  return { requests };
}
