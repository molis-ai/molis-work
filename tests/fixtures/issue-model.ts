import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { ISSUE_ASK } from "@molis-ai/molis-work-plugin-issues";
import { asideReply } from "./ending-review.js";

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
  /** Reply with words only (no tool): an Assistant round ends without a record, and Issue's naming call gets no JSON. */
  replyText?: string;
  /** Issue's naming call: answered with a title Issue refuses, so nothing is saved. */
  unusable?: boolean;
  /** Issue's naming call is held until resolved: the capture stays "organizing" meanwhile. */
  firstReply?: Promise<void>;
  /** Issue's naming call: too little to go on, so the one question comes back. In the Assistant: one free-text question. */
  question?: "free-text";
  unavailable?: boolean;
  title?: string;
  type?: "bug" | "experience" | "feature";
  /** Ask the Assistant's memory to keep this, quoting the person (`said`); then end in words. */
  remember?: { text: string; said: string };
  /** After the free-text question, state how it handles the supplement the round was given (by the id the runtime showed). */
  acknowledge?: { treatment: string; kind?: string; impacts: string[] };
  /** The first `times` Assistant calls are refused with 429 and `Retry-After` (seconds): the runtime waits and tries again. */
  rateLimited?: { times: number; retryAfterSeconds: number };
}

/**
 * One local model for a Home. Issue's naming call (its own registered instruction, the words fenced after it) is answered
 * with the JSON Issue asks for; Assistant rounds are scripted one tool call per turn. Issue, the Assistant, vision intake,
 * the action directory and undo stay real. `requests` are the Assistant's rounds, `namings` the text of each naming call.
 */
export async function issueModel(t: TestContext, home: string, behavior: IssueModelBehavior = {}) {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const requests: unknown[] = [], namings: string[] = [];
  let turn = 0, limited = 0;
  const model = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8"), review = asideReply(raw);
    // The ending review (D1②) and knowledge's background cards are answered aside, so neither spends a scripted turn or counts as a request.
    if (review) { response.writeHead(200, { "content-type": "text/event-stream" }); response.end(reply(undefined, review)); return; }
    const body = JSON.parse(raw);
    if (behavior.unavailable) { response.writeHead(503); response.end('{"error":{"message":"fixture model unavailable"}}'); return; }
    if (raw.includes("BEGIN_ISSUE_")) {
      namings.push(JSON.stringify(body)); await behavior.firstReply;
      const answer = behavior.replyText ?? JSON.stringify(behavior.question ? { status: "needs_input", question: ISSUE_ASK }
        : behavior.unusable ? { status: "named", title: "", type: "question" } : { status: "named", title: behavior.title ?? FIXTURE_TITLE, type: behavior.type ?? "bug" });
      response.writeHead(200, { "content-type": "text/event-stream" }); response.end(reply(undefined, answer)); return;
    }
    if (behavior.rateLimited && limited < behavior.rateLimited.times) {
      limited++;
      response.writeHead(429, { "content-type": "application/json", "retry-after": String(behavior.rateLimited.retryAfterSeconds) });
      response.end('{"type":"error","error":{"type":"rate_limit_error","message":"fixture rate limit"}}'); return;
    }
    requests.push(body);
    const ask = { name: "ask-user", input: { why: ISSUE_ASK } };
    // One planned tool call per model turn; after the plan, the round ends in words.
    const steer = raw.match(/steer-[0-9a-z]+-[0-9a-z]+/)?.[0];
    const handled = behavior.acknowledge && steer ? { name: "acknowledge-inputs", input: { items: [{ input: steer, ...behavior.acknowledge }] } } : undefined;
    const plan = behavior.replyText ? [] : behavior.acknowledge ? [ask, handled] : behavior.remember ? [{ name: "remember", input: { ...behavior.remember, scope: "personal" } }]
      : behavior.question === "free-text" ? [ask] : [];
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(reply(plan[turn++], behavior.replyText));
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
  return { requests, namings };
}
