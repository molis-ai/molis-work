import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionDefinition, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

/**
 * A Coding builder round on the real Node adapter that registers a step's wait on something outside (specs/prologue-adoption
 * §4.6.8), with the Host's action service behind it: a read-only status query, a command, a judgment and a read-only query
 * that asks a model, and switches for the round's plugin instance, its action grant and its directory.
 */
export type ModelReply = { text: string } | { tool: string; input: unknown };
/** A real provider instead of scripted replies (the live eval): its key is read only through `key`, never written anywhere. */
export interface LiveModel { readonly endpoint: string; readonly model: string; readonly key: () => string }
export interface ToolUse { readonly name: string; readonly input: unknown }
/** A tool as the model was offered it. */
export interface OfferedTool { readonly name: string; readonly description: string }
/** The name of the offered action tool with this title: what the model sees and calls, never a hash built here. */
export const toolTitled = (tools: readonly OfferedTool[], title: string) => tools.find(tool => tool.name.startsWith("molis-action-") && tool.description.includes(` · ${title}`))?.name ?? `no tool titled ${title}`;

/** What a streamed Anthropic-compatible reply said, as text. */
const textOf = (stream: string) => stream.split("\n").filter(line => line.startsWith("data:")).map(line => {
  try { const event = JSON.parse(line.slice(5)); return event.type === "content_block_delta" && event.delta?.type === "text_delta" ? String(event.delta.text ?? "") : ""; } catch { return ""; }
}).join("");
/** The tool calls in a streamed Anthropic-compatible reply, in order. */
const toolUses = (stream: string): ToolUse[] => {
  const blocks = new Map<number, { name: string; json: string }>();
  for (const line of stream.split("\n")) {
    if (!line.startsWith("data:")) continue;
    let event: { type?: string; index?: number; content_block?: { type?: string; name?: string }; delta?: { type?: string; partial_json?: string } };
    try { event = JSON.parse(line.slice(5)); } catch { continue; }
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") blocks.set(event.index ?? 0, { name: event.content_block.name ?? "", json: "" });
    if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") { const block = blocks.get(event.index ?? 0); if (block) block.json += event.delta.partial_json ?? ""; }
  }
  return [...blocks.values()].map(block => { try { return { name: block.name, input: JSON.parse(block.json || "{}") }; } catch { return { name: block.name, input: block.json }; } });
};

const sse = (reply: ModelReply) => {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 30, output_tokens: 0 } } });
  if ("tool" in reply) {
    emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: `call-${Math.random()}`, name: reply.tool, input: {} } });
    emit("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(reply.input) } });
  } else {
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: reply.text } });
  }
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "tool" in reply ? "tool_use" : "end_turn" }, usage: { output_tokens: 8 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
};

export const until = async (what: string, check: () => Promise<boolean> | boolean, ms = 30_000) => {
  for (const deadline = Date.now() + ms; !(await check());) {
    if (Date.now() > deadline) throw new Error(`timed out: ${what}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
};
export const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const definition = (capability_id: string, operation: "query" | "command", kind: "query" | "operation" | "judgment", title: string, effect?: "read", permissions: string[] = []): ActionDefinition => ({
  capability_id, version: 1, operation, action: { title, description: title, kind, ...(effect ? { effect } : {}), ...(permissions.length ? { scheduling: "concurrent" as const } : {}), scope: "project", audiences: ["agent"], permissions, subject_kinds: [],
    input_schema: { type: "object", properties: { job: { type: "string" } }, required: ["job"], additionalProperties: false },
    output_schema: { type: "object", properties: { state: { type: "string" } }, required: ["state"] } },
});

export async function externalChecks(t: TestContext, script: (turn: number, messages: string, tools: readonly OfferedTool[]) => ModelReply, live?: LiveModel) {
  const root = await mkdtemp(join(tmpdir(), "molis-external-checks-"));
  await writeFile(join(root, "README.md"), "sandbox\n");
  const requests: string[] = [], replies: ToolUse[][] = [], said: string[] = [], real = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], init: RequestInit) => {
    // With a real model, only its endpoint is the model: anything else (the resolver's DNS over HTTPS) goes out as it is.
    if (live && String(url instanceof Request ? url.url : url) !== live.endpoint) return real(url, init);
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const messages = JSON.stringify(body.messages);
    requests.push(messages);
    const tools: { name: string; description?: string }[] = body.tools ?? [];
    // Tools whose shapes were left out are listed by name in find-tools' description: "- <name>: <provider> · <effect> · <title> …".
    const deferred = [...(tools.find(tool => tool.name === "find-tools")?.description ?? "").matchAll(/^- (molis-action-[\w-]+): (.*)$/gm)];
    const offered: OfferedTool[] = [...tools.map(tool => ({ name: tool.name, description: tool.description ?? "" })), ...deferred.map(row => ({ name: row[1]!, description: row[2]! }))];
    if (!live) return sse(script(requests.length, messages, offered));
    // Only the request's messages and the reply's tool calls are kept; headers (the key) are not.
    const response = await real(url, init);
    const stream = await response.clone().text();
    replies.push(toolUses(stream)); said.push(textOf(stream));
    return response;
  });
  const switches = { pluginActive: true, actionsGranted: true, directoryAuthorized: true, state: "running" as string | Error };
  const calls = { status: 0, cancel: 0, judge: 0, summary: 0, roundChecks: 0, discovers: 0 };
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "p", storage_key: "memory:p" };
  const provider = { provider_id: "fixture.jobs", kind: "plugin" as const, title: "Jobs" };
  const status = definition("fixture.jobs.status", "query", "query", "Job status"), cancel = definition("fixture.jobs.cancel", "command", "operation", "Cancel job"),
    // A judgment asks a model; it is declared a command, even one that only reads.
    judge = definition("fixture.jobs.judge", "command", "judgment", "Judge job", "read"),
    // A query that only reads but asks a model for its answer: it declares model:invoke.
    summary = definition("fixture.jobs.summary", "query", "query", "Summarize job", "read", ["model:invoke"]);
  local.actionRegistry(project).registerProvider({ provider, definitions: [status, cancel, judge, summary], handlers: [
    { ...status, handle() { calls.status++; if (switches.state instanceof Error) throw switches.state; return { state: switches.state }; } },
    { ...cancel, handle() { calls.cancel++; return { state: "cancelled" }; } },
    { ...judge, handle() { calls.judge++; return { state: "good" }; } },
    { ...summary, handle() { calls.summary++; return { state: "done" }; } },
  ] });
  const ref = (definition: ActionDefinition): ExactActionReference => ({ capability_id: definition.capability_id, version: 1, provider_id: provider.provider_id });
  // The round holds model:invoke, so only the checker's own rule keeps the model-backed query out.
  const caller = { actor_id: "agent:prologue", actor_kind: "runtime" as const, audience: "agent" as const, project_id: project.project_id, permissions: ["model:invoke"] };
  const authority: AgentStartAuthority = { manifest: codingAgentManifest, prompts: [...codingPrompts], authorizedDirectories: [root],
    // The plugin instance that started the round: the real one throws this once the instance stops (plugin-host-services.ts).
    beforeDispatch: async () => { calls.roundChecks++; if (!switches.pluginActive) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开"); },
    actions: async (_runtime, validate) => {
      const client = local.actionClient(project);
      const current = async () => { if (!switches.actionsGranted) throw new ActionError("actions.forbidden", "动作授权已收回"); await validate?.(); };
      return { discover: async () => { calls.discovers++; await current(); return client.discover(caller); },
        invoke: async (reference, input) => { await current(); return client.invoke(caller, reference, input); } };
    } };
  const queue = new AgentReviewQueue(), reviewed: { kind: string; approved: boolean; what: string }[] = [];
  // With a real model: a file it writes in the sandbox and a call of one of the round's action tools are approved (the eval counts which
  // actions ran); any command and any other tool operation is turned down (nothing runs on this machine).
  if (live) queue.observe(request => {
    const document = request.document;
    if (document.kind !== "text-edit" && document.kind !== "command" && document.kind !== "tool-operation") return;
    const approved = document.kind === "text-edit" || document.kind === "tool-operation" && document.tool.startsWith("molis-action-");
    reviewed.push({ kind: document.kind, approved, what: document.kind === "text-edit" ? document.target_path : document.kind === "command" ? [document.command, ...document.args].join(" ") : document.tool });
    queueMicrotask(() => void queue.respond({ review_id: request.review_id, decision: approved ? "approve" : "reject", actor_id: "user" }).catch(() => undefined));
  });
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.external-checks-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => live ? { protocol: "anthropic-compatible", endpoint: live.endpoint, model: live.model, credential_ref: "live:minimax" }
      : { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" },
    resolveCredential: () => live ? live.key() : "test-only", checks: { directoryAuthorized: async (projectId, directory) => switches.directoryAuthorized && projectId === "p" && directory === root } });
  const adapter = await open();
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  t.after(async () => { await adapter.close(); await local.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "p", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "Waits outside" });
  const start = async (task: string, extra: object = {}, roundMs = live ? 300_000 : 30_000) => {
    const started = await host.start("prologue", { ...owner, session, directory, role_id: "builder", task, session_title: "Waits outside", ...extra } as never, authority);
    await until("the round ends", async () => ["completed", "failed", "cancelled", "stopped"].includes((await adapter.read(started.ref)).phase), roundMs);
    return started;
  };
  const wait = async () => (await adapter.collaboration!.read("p", session.session_id))[0]?.wait;
  const continuation = async () => (await adapter.collaboration!.read("p", session.session_id))[0]?.continuation;
  return { root, requests, replies, said, reviewed, switches, calls, adapter, start, wait, continuation, refs: { status: ref(status), cancel: ref(cancel), judge: ref(judge), summary: ref(summary) }, reopen: open };
}

/** The model's call that registers the wait, as `board-wait` takes it. */
export const boardWait = (checker: string, params: unknown) => ({ tool: "board-wait", input: { on: [{ kind: "external", checker, params }], reason: "等外面的结果" } });
