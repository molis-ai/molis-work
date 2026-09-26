import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { authorizeMcpActions } from "../apps/local-host/src/mcp-action-client.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import type { ActionDefinition, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

async function until<T>(read: () => T | Promise<T>): Promise<NonNullable<T>> {
  for (let i = 0; i < 300; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("Expected SDK state not reached");
}

function response(name?: string, input: unknown = {}): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: name ? { type: "tool_use", id: "call", name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: name ? { type: "input_json_delta", partial_json: JSON.stringify(input) } : { type: "text_delta", text: "Finished." } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: name ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

test("real SDK actions use original Host grants, write original SQLite, reject revocation after review and withdraw next run", { timeout: 40_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-agent-actions-"));
  const db = new DatabaseSync(join(home, "notes.sqlite"));
  db.exec("CREATE TABLE notes (body TEXT NOT NULL, project TEXT NOT NULL, actor TEXT NOT NULL)");
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", board_id: "board", storage_key: "memory:project" };
  const definition: ActionDefinition = { capability_id: "unknown.notes.write", version: 1, operation: "command", action: {
    title: "Save a note", description: "Store a note in the original project", kind: "operation", scope: "project", audiences: ["agent"],
    permissions: ["notes:write"], subject_kinds: [], input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    output_schema: { type: "object", properties: { saved: { type: "string" } }, required: ["saved"] } } };
  const query: ActionDefinition = { ...definition, capability_id: "unknown.notes.count", operation: "query", action: { ...definition.action,
    title: "Count notes", kind: "query", input_schema: { type: "array", maxItems: 0 }, output_schema: { type: "integer" } } };
  let reads = 0;
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "unknown.notes", kind: "plugin", title: "Notes" }, definitions: [definition, query],
    handlers: [{ ...definition, handle(context, input) { const text = (input as { text: string }).text;
      db.prepare("INSERT INTO notes VALUES (?, ?, ?)").run(text, context.project_id, context.actor_id); return { saved: text }; } },
    { ...query, handle(_context, input) { assert.deepEqual(input, []); reads++; return Number(db.prepare("SELECT COUNT(*) n FROM notes").get()!.n); } }] });
  const caller = { actor_id: "agent:prologue", actor_kind: "runtime" as const, audience: "agent" as const, project_id: project.project_id, permissions: [] };
  const catalog = await local.inspectActions(caller, project), view = catalog.find(row => row.capability_id === definition.capability_id)!;
  const grant = createMcpActionGrant(caller.actor_id, project.project_id, view, true);
  await writeMcpActionGrant(home, grant);
  await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, catalog.find(row => row.capability_id === query.capability_id)!, true));
  const selected: ExactActionReference[] = [{ capability_id: definition.capability_id, version: 1, provider_id: view.provider.provider_id }];
  const queryRef: ExactActionReference = { ...selected[0]!, capability_id: query.capability_id };
  const requests: any[] = []; let callNext = false, readNext = false, toolName = "", characterActive = true;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)); requests.push(body);
    if (callNext) { callNext = false; toolName = body.tools.find((tool: any) => tool.description.includes("Save a note"))?.name;
      assert.ok(toolName, JSON.stringify(body.tools)); return response(toolName, { text: "from the model" }); }
    if (readNext) { readNext = false; const tool = body.tools.find((tool: any) => tool.description.includes("Count notes"));
      assert.equal(tool.input_schema.type, "object"); assert.equal(tool.input_schema.properties.input.type, "array"); return response(tool.name, { input: [] }); }
    return response();
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.action-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  let adapter = await make(); host.register(adapter);
  try {
    const owner = { board_id: "board", plugin_id: "caller", install_id: "i", actor_id: "user" }, directory = { canonical_path: home, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Action tools" });
    const character = { character_id: "c", reference: { artifact_id: "character:board:c", version: 1 }, title: "Scoped writer", instructions: "Use the chosen tools.",
      host_tools: null, action_tools: [...selected, queryRef], source: { owner_actor_id: "user", draft_revision: 1 }, board_id: "board", content_digest: "original",
      producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.0.0", binding_signature: "official-characters-binding" }, published_at: "2026-09-26T00:00:00Z" };
    const authority: AgentStartAuthority = { authorizedDirectories: [home], manifest: { roles: [{ role_id: "writer", version: 1, name: "Writer", execution: "workspace-write", prompts: ["base", "writer"], host_tools: [] }],
      characters: { selection: "optional-exact-artifact", scope: "project-owner", role_ids: ["writer"] },
      prompts: [{ prompt_id: "base", version: 1 }, { prompt_id: "writer", version: 1 }] },
      prompts: [{ prompt_id: "base", version: 1, layer: "base", body: "Use the selected action." }, { prompt_id: "writer", version: 1, layer: "role", body: "Write a note." }],
      resolveCharacter: () => { if (!characterActive) throw new Error("Character disabled"); return character; },
      actions: async (_runtime, validate) => {
        const current = (signal?: AbortSignal) => authorizeMcpActions(local, { ...caller, signal }, home, project, validate);
        return { discover: async () => { const auth = await current(); return auth.service.discover(auth.context); },
          invoke: async (ref, input, signal) => { const auth = await current(signal); return auth.service.invoke(auth.context, ref, input); } };
      } };
    for (const outcome of ["allowed", "revoked", "disabled"]) {
      await writeMcpActionGrant(home, grant); characterActive = true;
      callNext = true;
      const handle = await host.start("prologue", { ...owner, session, directory, task: "Save a note", role_id: "writer", action_tools: selected, character: character.reference }, authority);
      const review = await until(async () => { const pending = queue.list("board", "pending")[0]; const run = await adapter.read(handle.ref);
        if (!pending && ["failed", "completed"].includes(run.phase)) throw new Error(JSON.stringify(run)); return pending; });
      assert.equal(review.document.kind, "tool-operation");
      assert.ok(JSON.stringify(review.document).includes("unknown.notes.write"));
      assert.equal(db.prepare("SELECT COUNT(*) n FROM notes").get()!.n, outcome === "allowed" ? 0 : 1);
      if (outcome === "revoked") await writeMcpActionGrant(home, { ...grant, enabled: false });
      if (outcome === "disabled") characterActive = false;
      await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" });
      const run = await until(async () => { const value = await adapter.read(handle.ref); return ["completed", "failed", "cancelled"].includes(value.phase) ? value : undefined; });
      assert.equal(run.phase, "completed", run.stop_reason);
      assert.deepEqual(run.frozen.action_tools, selected);
      const wire = JSON.stringify(requests.at(-1).messages);
      assert.match(wire, outcome === "revoked" ? /no longer accessible|revoked|forbidden/ : outcome === "disabled" ? /Character disabled/ : /from the model/);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM notes").get()!.n, 1, "revoked pending action cannot reach original handler");
    }
    assert.deepEqual(JSON.parse(JSON.stringify(db.prepare("SELECT * FROM notes").all())), [{ body: "from the model", project: "project", actor: "agent:prologue" }]);
    await writeMcpActionGrant(home, grant);
    let previousNames: string[] | undefined;
    for (const refs of [[...selected, queryRef], [queryRef, ...selected], [queryRef]]) {
      readNext = true;
      const combined = await host.start("prologue", { ...owner, session, directory, task: "Count notes", role_id: "writer", action_tools: refs }, authority);
      await until(async () => (await adapter.read(combined.ref)).phase === "completed");
      const names = requests.at(-1).tools.map((tool: any) => tool.name).sort();
      if (refs.length === 2 && previousNames) assert.deepEqual(names, previousNames, "reordering the same choice reuses its SDK registrations");
      previousNames = names;
    }
    assert.equal(reads, 3, "non-object schema must arrive unchanged at the original owner");
    const next = await host.start("prologue", { ...owner, session, directory, task: "Continue without actions", role_id: "writer", action_tools: [] }, authority);
    await until(async () => (await adapter.read(next.ref)).phase === "completed");
    assert.ok(!requests.at(-1).tools?.some((tool: any) => tool.name === toolName), "previous selection must not remain callable");
    await adapter.close(); adapter = await make();
    const restored = await adapter.readSession(session);
    assert.deepEqual(restored.latest_run?.frozen.action_tools, []);
    assert.ok(!JSON.stringify(restored).includes("fixture-only"));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM notes").get()!.n, 1, "history restore cannot replay an action");
  } finally { await adapter.close(); await local.close(); db.close(); await rm(home, { recursive: true, force: true }); }
});

test("real SDK binds identical tools to separate callers and cancellation reaches the original action handler", { timeout: 40_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-agent-action-isolation-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "p", board_id: "b", storage_key: "memory:p" };
  const definition: ActionDefinition = { capability_id: "unknown.actor.read", version: 1, operation: "query", action: {
    title: "Read caller", description: "Read using the original caller", kind: "query", scope: "project", scheduling: "concurrent", audiences: ["agent"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false },
    output_schema: { type: "object", properties: { actor: { type: "string" } }, required: ["actor"] } } };
  const firstEntered = Promise.withResolvers<void>(), firstRelease = Promise.withResolvers<void>();
  const cancelEntered = Promise.withResolvers<void>(), cancelRelease = Promise.withResolvers<void>();
  let cancelledSignal: AbortSignal | undefined, cancelledCompleted = 0;
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "unknown", kind: "plugin", title: "Unknown" }, definitions: [definition],
    handlers: [{ ...definition, async handle(context, input) {
      const key = (input as { key: string }).key;
      if (key === "A") { firstEntered.resolve(); await firstRelease.promise; }
      if (key === "cancel") { cancelledSignal = context.signal; cancelEntered.resolve(); await cancelRelease.promise; context.signal?.throwIfAborted(); cancelledCompleted++; }
      return { actor: context.actor_id };
    } }] });
  const selected = [{ capability_id: definition.capability_id, version: 1, provider_id: "unknown" }];
  const requests: any[] = []; let nextCall: string | null = null;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)); requests.push(body);
    if (nextCall) { const key = nextCall; nextCall = null; return response(body.tools.find((tool: any) => tool.description.includes("Read caller")).name, { key }); }
    return response();
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.action-isolation", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  const host = new AgentHost(); host.register(adapter);
  const owner = { board_id: "b", plugin_id: "caller", install_id: "i", actor_id: "user" }, directory = { canonical_path: home, realpath_verified: true };
  const authority = async (actor: string): Promise<AgentStartAuthority> => {
    const caller = { actor_id: actor, audience: "agent" as const, project_id: "p", permissions: [] };
    await writeMcpActionGrant(home, createMcpActionGrant(actor, "p", (await local.inspectActions(caller, project))[0]!, true));
    return { authorizedDirectories: [home], manifest: { roles: [{ role_id: "reader", version: 1, name: "Reader", prompts: [], host_tools: [] }], prompts: [] },
      actions: async (_runtime, validate) => {
        const current = (signal?: AbortSignal) => authorizeMcpActions(local, { ...caller, signal }, home, project, validate);
        return { discover: async () => { const auth = await current(); return auth.service.discover(auth.context); },
          invoke: async (ref, input, signal) => { const auth = await current(signal); return auth.service.invoke(auth.context, ref, input); } };
      } };
  };
  try {
    const a = await adapter.createSession({ ...owner, directory, title: "A" }), b = await adapter.createSession({ ...owner, directory, title: "B" });
    const authA = await authority("agent:A"), authB = await authority("agent:B");
    nextCall = "A";
    const first = await host.start("prologue", { ...owner, session: a, directory, task: "Read A", role_id: "reader", action_tools: selected }, authA);
    await firstEntered.promise;
    nextCall = "B";
    const second = await host.start("prologue", { ...owner, session: b, directory, task: "Read B", role_id: "reader", action_tools: selected }, authB);
    await until(async () => (await adapter.read(second.ref)).phase === "completed");
    assert.match(JSON.stringify(requests.at(-1).messages), /agent:B/);
    firstRelease.resolve();
    await until(async () => (await adapter.read(first.ref)).phase === "completed");
    assert.match(JSON.stringify(requests.at(-1).messages), /agent:A/);
    assert.doesNotMatch(JSON.stringify(requests.at(-1).messages), /agent:B/);
    nextCall = "cancel";
    const third = await host.start("prologue", { ...owner, session: a, directory, task: "Wait then cancel", role_id: "reader", action_tools: selected }, authA);
    await cancelEntered.promise;
    await adapter.control(third.ref, { kind: "cancel" });
    assert.equal(cancelledSignal?.aborted, true, "the actual handler must receive the run cancellation despite SDK omitting its signal");
    cancelRelease.resolve();
    await until(async () => (await adapter.read(third.ref)).phase === "cancelled");
    assert.equal(cancelledCompleted, 0);
  } finally { firstRelease.resolve(); cancelRelease.resolve(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
