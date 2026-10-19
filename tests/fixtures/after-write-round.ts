// A Coding round with after-write checks on the real Node Host (specs/prologue-adoption §6.0p, A2-2): the model is a script
// (one Anthropic-compatible reply per request), the checks are real processes, and the person answers the reviews.
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { AgentReviewRequest, AgentWriteChecker } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

export type Turn = { readonly tool: string; readonly input: Readonly<Record<string, unknown>>; readonly id?: string } | { readonly text: string };
export const write = (path: string, text: string, id?: string): Turn => ({ tool: "write", input: { path, text }, ...(id ? { id } : {}) });
export const say = (text: string): Turn => ({ text });

const OWNER = { project_id: "board", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "user" };
const until = async <T>(read: () => T | Promise<T>, what: string, limit = 400): Promise<NonNullable<T>> => {
  for (let i = 0; i < limit; i++) { const result = await read(); if (result) return result as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`not reached: ${what}`);
};

/** A checker as the person saves it, with the defaults the store keeps. */
export const kept = (checker: AgentWriteChecker): Required<AgentWriteChecker> => ({ cwd: ".", timeout_ms: 30_000, ...checker });

export async function afterWriteRound(t: TestContext, setup: { readonly checkers?: readonly AgentWriteChecker[]; readonly turns: readonly Turn[] }) {
  const root = await mkdtemp(join(tmpdir(), "after-write-")), project = join(root, "project");
  await mkdir(project);
  const requests: Array<{ messages: unknown[]; tools?: Array<{ name: string }> }> = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    const turn = setup.turns[requests.length - 1] ?? say("done"), events: string[] = [], number = requests.length;
    const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    emit("message_start", { message: { id: `message-${number}`, type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
    if ("tool" in turn) {
      emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: turn.id ?? `call-${number}`, name: turn.tool, input: {} } });
      emit("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(turn.input) } });
    } else {
      emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: turn.text } });
    }
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: "tool" in turn ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
    emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  });
  const queue = new AgentReviewQueue();
  let authorized = true;
  const adapter = await createPrologueNodeAdapter({ app: { appId: "molis.after-write.test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "test" }), resolveCredential: () => "test-only",
    checks: { workspaceAt: async (projectId, path) => authorized && projectId === OWNER.project_id && path === project ? "app" : undefined } });
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  if (setup.checkers?.length) await adapter.writeCheckers.save(OWNER.project_id, "app", 0, setup.checkers.map(kept));
  const directory = { canonical_path: project, realpath_verified: true };
  const session = await adapter.createSession({ ...OWNER, directory, title: "after-write checks" });
  /** The text of the tool result the model got back for this call, in the request that followed it. */
  const result = (callId: string): string | undefined => {
    for (const request of requests) for (const message of request.messages as Array<{ content?: unknown }>) {
      if (!Array.isArray(message.content)) continue;
      for (const block of message.content as Array<{ type?: string; tool_use_id?: string; content?: unknown }>) {
        if (block.type !== "tool_result" || block.tool_use_id !== callId) continue;
        return typeof block.content === "string" ? block.content : (block.content as Array<{ text?: string }>).map(part => part.text ?? "").join("");
      }
    }
    return undefined;
  };
  return {
    project, queue, adapter, requests, session, result,
    /** Takes the project's authorization of the workspace back (or gives it again). */
    authorize(value: boolean) { authorized = value; },
    /** Starts a round; `turns` raises the round's tool turns above the default of 8. */
    start: (tools: readonly string[] = ["read-file", "write"], turns?: number) => adapter.start({ ...OWNER, directory, session, task: "Write the files.", role_id: "writer",
      role: { role_id: "writer", version: 1, execution: "text-edit", prompts: [], host_tools: [...tools] }, ...(turns ? { budget: { max_turns: turns } } : {}) }),
    /** The next review not yet answered, of this kind. */
    pending: (kind: AgentReviewRequest["document"]["kind"], seen: ReadonlySet<string> = new Set()) =>
      until(() => queue.list(OWNER.project_id, "pending").find(row => row.document.kind === kind && !seen.has(row.review_id)), `a pending ${kind} review`),
    pendingNow: () => queue.list(OWNER.project_id, "pending"),
    approve: (review: AgentReviewRequest, remember?: "session") => queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user", ...(remember ? { remember } : {}) }),
    reject: (review: AgentReviewRequest) => queue.respond({ review_id: review.review_id, decision: "reject", actor_id: "user" }),
    ended: (ref: Parameters<typeof adapter.read>[0]) => until(async () => { const view = await adapter.read(ref); return ["completed", "failed", "stopped", "cancelled"].includes(view.phase) ? view : null; }, "the round's end"),
    until,
  };
}
