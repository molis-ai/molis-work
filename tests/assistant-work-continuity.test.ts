import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, defineSubjectContextAction, subjectContext, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

function reply(tool?: { name: string; input: unknown }, text = "Done."): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

/** A small notes plugin with what the continuity protocol asks of an owner: a subject reader and version-checked writes. */
const note = { type: "object", properties: { id: { type: "string" }, version: { type: "integer" }, text: { type: "string" } } };
const create: ActionDefinition = { capability_id: "fixture.notes.create", version: 1, operation: "command", action: {
  title: "New note", description: "Create a note", kind: "operation", scope: "project", audiences: ["agent", "user"], permissions: ["notes:write"], subject_kinds: ["note"],
  input_schema: { type: "object", properties: { text: { type: "string", title: "内容" } }, required: ["text"], additionalProperties: false },
  output_schema: { type: "object", properties: { note } } } };
const update: ActionDefinition = { capability_id: "fixture.notes.update", version: 1, operation: "command", action: {
  title: "Edit note", description: "Change a note", kind: "operation", scope: "project", audiences: ["agent", "user"], permissions: ["notes:write"], subject_kinds: ["note"],
  result_subject: { id: "note.id", revision: "note.version" },
  input_schema: { type: "object", properties: { id: { type: "string" }, text: { type: "string", title: "内容" }, expected_version: { type: "integer", minimum: 1 } }, required: ["id", "text"], additionalProperties: false },
  output_schema: { type: "object", properties: { note } } } };
const subject = defineSubjectContextAction("fixture.notes.subject.read", "note", "笔记", ["notes:read"]);

async function fixture(t: import("node:test").TestContext, script: Array<(body: any) => Response>) {
  const home = await mkdtemp(join(tmpdir(), "molis-continuity-"));
  const notes = new Map<string, { text: string; version: number }>();
  let next = 0;
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", board_id: "board", storage_key: "memory:project" };
  const bump = (id: string, text: string, expected?: number) => {
    const current = notes.get(id);
    if (!current) throw new ActionError("notes.not_found", "没有这条笔记");
    if (expected !== undefined && expected !== current.version) throw new ActionError("notes.conflict", "笔记已改变");
    const value = { text, version: current.version + 1 };
    notes.set(id, value);
    return { note: { id, ...value } };
  };
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, definitions: [create, update, subject],
    handlers: [
      { ...create, handle(_c, input) { const id = `n${++next}`; notes.set(id, { text: (input as { text: string }).text, version: 1 }); return { note: { id, version: 1, text: (input as { text: string }).text } }; } },
      { ...update, handle(_c, input) { const value = input as { id: string; text: string; expected_version?: number }; return bump(value.id, value.text, value.expected_version); } },
      { ...subject, handle(_c, input) {
        const id = (input as { subject_id: string }).subject_id, value = notes.get(id);
        if (!value) throw new ActionError("notes.not_found", "没有这条笔记");
        return subjectContext({ subject: { kind: "note", id }, revision: String(value.version), title: value.text.slice(0, 20), content: value.text, goal_ids: [], session_id: null, open: { surface: "notes", id } });
      } },
    ] });
  const requests: any[] = [];
  let turn = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script[turn++] ?? (() => reply()))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.continuity-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const person: ActionCallContext = { actor_id: "web-user", project_id: "project", audience: "user", permissions: ["notes:read", "notes:write"] };
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user"), undefined, (view, input, output) => service.recordResult(work, view, input, output)),
    scopeActions: async () => ({ discover: () => local.actionClient(project).discover(person), invoke: (action, input) => local.actionClient(project).invoke(person, action, input) }),
    projectTitle: async () => "Fixture project" }, "web-user");
  return { service, store, notes, requests, project, async close() { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); } };
}

const ref = (capability_id: string) => ({ capability_id, version: 1, provider_id: "fixture.notes" });

test("a work keeps what it used and produced; an edit by hand shows as changed and the next round is told; the related query finds it", { timeout: 60_000 }, async t => {
  const f = await fixture(t, [
    () => reply({ name: "change-capability", input: { ...ref("fixture.notes.create"), input: { text: "Q4 draft" } } }),
    () => reply(undefined, "已新建笔记。"),
    // Second round: asked to continue. First without the version it read — refused before any review — then with it.
    body => { assert.match(JSON.stringify(body), /这项工作的对象/); assert.match(JSON.stringify(body), /已被修改/); return reply({ name: "change-capability", input: { ...ref("fixture.notes.update"), input: { id: "n1", text: "Q4 draft + hand edit, shorter" } } }); },
    body => { assert.match(JSON.stringify(body), /expected_version/); return reply({ name: "change-capability", input: { ...ref("fixture.notes.update"), input: { id: "n1", text: "Q4 draft + hand edit, shorter", expected_version: 2 } } }); },
    () => reply(undefined, "已在你的修改上继续。"),
  ]);
  try {
    // The person starts from a note they are looking at, and puts another one into the round.
    f.notes.set("bg", { text: "background", version: 4 });
    const sent = await f.service.send({ text: "按背景写一份 Q4 草稿", request_id: "req-00000101",
      context: { source: { surface: "notes", title: "Notes" }, object: { kind: "note", id: "bg", version: 4, title: "background" }, captured_at: new Date().toISOString() },
      materials: [{ material_id: "m1", kind: "object", title: "background", explicit: true, object: { kind: "note", id: "bg", version: 4 }, text: "background" }] }, { project_ref: f.project });
    const held = await until(async () => { const v = await f.service.read(sent.work.work_id); return v.reviews.length ? v : undefined; }, "review");
    await f.service.decide(sent.work.work_id, { review_id: held.reviews[0]!.review_id, decision: "approve" });
    let view = await until(async () => { const v = await f.service.read(sent.work.work_id); return v.work.state === "completed" ? v : undefined; }, "first round");
    const produced = view.objects.find(object => object.relation === "result")!;
    assert.deepEqual({ relation: produced.relation, kind: produced.subject.kind, recorded: produced.recorded_revision, state: produced.state, open: produced.open },
      { relation: "result", kind: "note", recorded: "1", state: "current", open: { surface: "notes", id: produced.subject.id } });
    assert.deepEqual(view.objects.filter(object => object.relation !== "result").map(object => [object.relation, object.subject.id, object.recorded_revision, object.state]),
      [["origin", "bg", "4", "current"], ["material", "bg", "4", "current"]]);

    // The person edits the result by hand, in the plugin: nothing is recorded anywhere but the owner's new version.
    const id = produced.subject.id;
    f.notes.set(id, { text: "Q4 draft + hand edit", version: 2 });
    view = await f.service.read(sent.work.work_id);
    assert.deepEqual(view.objects.filter(object => object.relation === "result").map(object => [object.state, object.recorded_revision, object.current_revision]), [["changed", "1", "2"]]);

    // Other entries can ask which works relate to the note.
    assert.deepEqual((await f.service.related("project", { kind: "note", id })).map(row => [row.work_id, row.relation]), [[sent.work.work_id, "result"]]);
    assert.deepEqual(await f.service.related(null, { kind: "note", id }), [], "a project's objects are not another scope's");

    // Continue the same work.
    assert.equal(id, "n1");
    const again = await f.service.send({ work_id: sent.work.work_id, text: "再短一点", request_id: "req-00000102" }, { project_ref: f.project });
    assert.equal(again.outcome, "started");
    const second = await until(async () => { const v = await f.service.read(sent.work.work_id); return v.reviews.length ? v : undefined; }, "second review");
    // The first attempt without a version never reached the person.
    assert.equal(second.reviews.length, 1);
    assert.ok(second.reviews[0]!.fields.some(field => field.value === "2"), "the approved change carries the version it was read at");
    await f.service.decide(sent.work.work_id, { review_id: second.reviews[0]!.review_id, decision: "approve" });
    view = await until(async () => { const v = await f.service.read(sent.work.work_id); return v.work.state === "completed" ? v : undefined; }, "second round");
    assert.deepEqual(f.notes.get("n1"), { text: "Q4 draft + hand edit, shorter", version: 3 });
    const results = view.objects.filter(object => object.relation === "result").map(object => [object.subject.id, object.recorded_revision, object.state]);
    assert.deepEqual(results, [["n1", "3", "current"]]);
  } finally { await f.close(); }
});
