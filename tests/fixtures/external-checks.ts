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
 * §4.6.8), with the Host's action service behind it: a read-only status query, a command and a judgment, and switches for
 * the round's plugin instance, its action grant and its directory.
 */
export type ModelReply = { text: string } | { tool: string; input: unknown };

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

const definition = (capability_id: string, operation: "query" | "command", kind: "query" | "operation" | "judgment", title: string, effect?: "read"): ActionDefinition => ({
  capability_id, version: 1, operation, action: { title, description: title, kind, ...(effect ? { effect } : {}), scope: "project", audiences: ["agent"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { job: { type: "string" } }, required: ["job"], additionalProperties: false },
    output_schema: { type: "object", properties: { state: { type: "string" } }, required: ["state"] } },
});

export async function externalChecks(t: TestContext, script: (turn: number, messages: string) => ModelReply) {
  const root = await mkdtemp(join(tmpdir(), "molis-external-checks-"));
  await writeFile(join(root, "README.md"), "sandbox\n");
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const messages = JSON.stringify(body.messages);
    requests.push(messages);
    return sse(script(requests.length, messages));
  });
  const switches = { pluginActive: true, actionsGranted: true, directoryAuthorized: true, state: "running" as string | Error };
  const calls = { status: 0, cancel: 0, judge: 0, roundChecks: 0, discovers: 0 };
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "p", storage_key: "memory:p" };
  const provider = { provider_id: "fixture.jobs", kind: "plugin" as const, title: "Jobs" };
  const status = definition("fixture.jobs.status", "query", "query", "Job status"), cancel = definition("fixture.jobs.cancel", "command", "operation", "Cancel job"),
    // A judgment asks a model; it is declared a command, even one that only reads.
    judge = definition("fixture.jobs.judge", "command", "judgment", "Judge job", "read");
  local.actionRegistry(project).registerProvider({ provider, definitions: [status, cancel, judge], handlers: [
    { ...status, handle() { calls.status++; if (switches.state instanceof Error) throw switches.state; return { state: switches.state }; } },
    { ...cancel, handle() { calls.cancel++; return { state: "cancelled" }; } },
    { ...judge, handle() { calls.judge++; return { state: "good" }; } },
  ] });
  const ref = (definition: ActionDefinition): ExactActionReference => ({ capability_id: definition.capability_id, version: 1, provider_id: provider.provider_id });
  const caller = { actor_id: "agent:prologue", actor_kind: "runtime" as const, audience: "agent" as const, project_id: project.project_id, permissions: [] };
  const authority: AgentStartAuthority = { manifest: codingAgentManifest, prompts: [...codingPrompts], authorizedDirectories: [root],
    // The plugin instance that started the round: the real one throws this once the instance stops (plugin-host-services.ts).
    beforeDispatch: async () => { calls.roundChecks++; if (!switches.pluginActive) throw new ActionError("actions.forbidden", "此插件实例已停止，请重新打开"); },
    actions: async (_runtime, validate) => {
      const client = local.actionClient(project);
      const current = async () => { if (!switches.actionsGranted) throw new ActionError("actions.forbidden", "动作授权已收回"); await validate?.(); };
      return { discover: async () => { calls.discovers++; await current(); return client.discover(caller); },
        invoke: async (reference, input) => { await current(); return client.invoke(caller, reference, input); } };
    } };
  const queue = new AgentReviewQueue();
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.external-checks-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only", checks: { directoryAuthorized: async (projectId, directory) => switches.directoryAuthorized && projectId === "p" && directory === root } });
  const adapter = await open();
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  t.after(async () => { await adapter.close(); await local.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "p", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "Waits outside" });
  const start = async (task: string, extra: object = {}) => {
    const started = await host.start("prologue", { ...owner, session, directory, role_id: "builder", task, session_title: "Waits outside", ...extra } as never, authority);
    await until("the round ends", async () => ["completed", "failed", "cancelled", "stopped"].includes((await adapter.read(started.ref)).phase));
    return started;
  };
  const wait = async () => (await adapter.collaboration!.read("p", session.session_id))[0]?.wait;
  const continuation = async () => (await adapter.collaboration!.read("p", session.session_id))[0]?.continuation;
  return { root, requests, switches, calls, adapter, start, wait, continuation, refs: { status: ref(status), cancel: ref(cancel), judge: ref(judge) }, reopen: open };
}

/** The model's call that registers the wait, as `board-wait` takes it. */
export const boardWait = (checker: string, params: unknown) => ({ tool: "board-wait", input: { on: [{ kind: "external", checker, params }], reason: "等外面的结果" } });
