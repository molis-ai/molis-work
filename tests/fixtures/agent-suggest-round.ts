// A per-action Agent round (frozen action_tools) whose role may suggest, against the real Prologue SDK with a scripted
// model: the round's two actions are plain views served by a counting client, so a test sees exactly what ran.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

export const NOTES_WRITE: ActionView = { capability_id: "fixture.notes.write", version: 1, operation: "command",
  provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, availability: { available: true },
  action: { title: "Save a note", description: "Store a note in the project", kind: "operation", scope: "project", audiences: ["agent"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    output_schema: { type: "object", properties: { saved: { type: "string" } }, required: ["saved"] } } };
/** Discoverable by the same caller but not chosen for the round. */
export const NOTES_DELETE: ActionView = { ...NOTES_WRITE, capability_id: "fixture.notes.delete",
  action: { ...NOTES_WRITE.action, title: "Delete every note", description: "Remove all notes" } };
export const refOf = (view: ActionView): ExactActionReference => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

export async function until<T>(read: () => T | Promise<T>): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("Expected SDK state not reached");
}

/** One streamed model reply: a single tool call, or a closing text. */
export function reply(name?: string, input: unknown = {}): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: name ? { type: "tool_use", id: "call-" + Math.random().toString(36).slice(2), name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: name ? { type: "input_json_delta", partial_json: JSON.stringify(input) } : { type: "text_delta", text: "Finished." } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: name ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

type Body = { tools?: Array<{ name: string; description: string; input_schema: { properties?: Record<string, { enum?: string[] }> } }>; messages: unknown[] };
/** What the model does next, given the request it was sent; `undefined` closes the round with text. */
export type Turn = (body: Body) => Response | undefined;

export async function suggestRound(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-agent-suggest-"));
  const turns: Turn[] = [], requests: Body[] = [];
  const counts = { invoked: 0, checked: 0 };
  let available: ActionView[] = [NOTES_WRITE, NOTES_DELETE];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)) as Body;
    requests.push(body);
    return turns.shift()?.(body) ?? reply();
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.suggest-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  let adapter = await make(); host.register(adapter);
  const owner = { project_id: "project", plugin_id: "caller", install_id: "i", actor_id: "user" }, directory = { canonical_path: home, realpath_verified: true };
  const authority = (execution: "read-only" | "workspace-write", hostTools: string[]): AgentStartAuthority => ({ authorizedDirectories: [home],
    manifest: { roles: [{ role_id: "writer", version: 1, name: "Writer", execution, prompts: [], host_tools: hostTools }], prompts: [] },
    actions: async () => ({
      discover: async () => available,
      check: async (_ref: ExactActionReference, input: unknown) => {
        counts.checked++;
        if (typeof (input as { text?: unknown } | null)?.text !== "string") throw new ActionError("actions.input_invalid", "text must be a string");
      },
      invoke: async () => { counts.invoked++; return { saved: "ran" }; },
    }) });
  const session = await adapter.createSession({ ...owner, directory, title: "Suggestions" });
  return {
    home, queue, host, turns, requests, counts, owner, directory, session, authority,
    get adapter() { return adapter; },
    setAvailable(views: ActionView[]) { available = views; },
    start: (task: string, execution: "read-only" | "workspace-write" = "workspace-write", hostTools: string[] = ["suggest-action"], action_tools = [refOf(NOTES_WRITE)]) =>
      host.start("prologue", { ...owner, session, directory, task, role_id: "writer", action_tools }, authority(execution, hostTools)),
    finished: (ref: Parameters<typeof adapter.read>[0]) => until(async () => { const run = await adapter.read(ref); return ["completed", "failed", "cancelled"].includes(run.phase) ? run : undefined; }),
    async reopen() { await adapter.close(); adapter = await make(); },
    async close() { await adapter.close(); await rm(home, { recursive: true, force: true }); },
  };
}

/** The round's suggest tool and the action tool that writes notes, as the model was offered them. */
export function suggestTools(body: Body) {
  const suggest = body.tools?.find(tool => tool.name.startsWith("molis-suggest-"));
  const write = body.tools?.find(tool => tool.description.includes("Save a note"));
  return { suggest, write };
}
