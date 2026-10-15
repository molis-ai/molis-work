import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";

function reply(tool?: { name: string; input: unknown }, text = "已记录「切换页面后输入内容丢失」（Bug）。"): string {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: randomUUID(), type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: randomUUID(), name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {}); return events.join("");
}

export const FIXTURE_TITLE = "切换页面后输入内容丢失";
export interface IssueModelBehavior {
  /** Reply with words only (no tool): the round ends without a record. */
  replyText?: string;
  /** The first save sends the record's name outside `input` (the real MiniMax failure); the corrected one follows. */
  malformedCaptureOnce?: boolean;
  malformedCaptureAlways?: boolean;
  /** Held until resolved: the capture stays "organizing" meanwhile. */
  firstReply?: Promise<void>;
  question?: "free-text" | "correct-once" | "never-correct";
  unavailable?: boolean;
  /** Fall back to a card the way the method says when the direct save is refused (the person confirms every time). */
  suggest?: boolean;
  title?: string;
  type?: "bug" | "experience" | "feature";
}

/** Model replies are scripted the way the Issue method asks; the Assistant, vision intake, action directory and undo stay real. */
export async function issueModel(t: TestContext, home: string, behavior: IssueModelBehavior = {}) {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const requests: unknown[] = [], rounds = new Map<string, number>();
  const model = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); requests.push(body);
    if (behavior.unavailable) { response.writeHead(503); response.end('{"error":{"message":"fixture model unavailable"}}'); return; }
    const revision = JSON.stringify(body).match(/待整理记录 ([0-9a-f-]{36}) 版本 (\d+)/);
    const draft_id = JSON.stringify(body).match(/录入草稿 ([0-9a-f-]{36})/)?.[1] ?? (revision ? revision[1] + revision[2] + behavior.title : "missing-draft");
    const turn = rounds.get(draft_id) ?? 0; rounds.set(draft_id, turn + 1);
    if (turn === 0) await behavior.firstReply;
    const identity = { capability_id: "issues.capture", version: 1, provider_id: "io.molis.work.issues" };
    const input = { draft_id, title: behavior.title ?? FIXTURE_TITLE, type: behavior.type ?? "bug" };
    // Replay the real MiniMax failure: business values beside `input` instead of inside it.
    const bad = { name: "change-reversible", input: { ...identity, title: input.title, type: input.type, input: "" } };
    const good = { name: "change-reversible", input: { ...identity, input } };
    const card = { name: "suggest-action", input: { title: "记录这条 Issue", summary: `${input.title}（Bug）`, ...identity, input, editable: ["title", "type"] } };
    const ask = (valid: boolean) => ({ name: "ask-user", input: !valid ? {
      why: "需要具体问题", questions: [{ prompt: "如何处理这条录入？", options: [{ description: "补充具体问题后再生成" }] }],
    } : behavior.question === "correct-once" ? {
      why: "需要定位页面", questions: [{ prompt: "在哪个页面点击保存没有反应？", options: ["首页", "项目页"], allowOther: true }],
    } : { why: "你在哪个页面做了什么，出现了什么问题？也可以补充截图。" } });
    // One planned tool call per model turn of a draft; after the plan, the round ends in words.
    const plan = behavior.replyText ? [] : behavior.question === "free-text" ? [ask(true)] : behavior.question === "correct-once" ? [ask(false), ask(true)]
      : behavior.question === "never-correct" ? [ask(false), ask(false), ask(false), ask(false)] : behavior.malformedCaptureAlways ? [bad, bad, bad, bad]
      : behavior.malformedCaptureOnce ? [bad, good] : behavior.suggest ? [good, card] : [good];
    const tool = revision && !behavior.replyText && !behavior.question ? (turn === 0 ? { name: "suggest-action", input: {
      capability_id: "issues.update", version: 2, provider_id: "io.molis.work.issues", title: "重新整理 Issue", summary: input.title,
      input: { id: revision[1], expected_version: Number(revision[2]), title: input.title, type: input.type }, editable: ["title", "type"],
    } } : undefined) : plan[turn];
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(reply(tool, behavior.replyText));
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
