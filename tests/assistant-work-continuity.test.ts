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
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user"), (offer, views) => service.recordOffer(work, offer, views), (view, input, output) => service.recordResult(work, view, input, output)),
    scopeActions: async () => ({ discover: () => local.actionClient(project).discover(person), invoke: (action, input) => local.actionClient(project).invoke(person, action, input) }),
    projectTitle: async () => "Fixture project" }, "web-user");
  return { service, store, notes, requests, project, local, async close() { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); } };
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

    // The person removes what the work produced, by hand: the work says so, and nothing recreates it.
    f.notes.delete("n1");
    view = await f.service.read(sent.work.work_id);
    assert.deepEqual(view.objects.filter(object => object.relation === "result").map(object => [object.subject.id, object.state, object.current_revision]), [["n1", "missing", null]]);
  } finally { await f.close(); }
});

test("an object edited by hand while a change to it waits for approval is not overwritten; the round shows the conflict", { timeout: 60_000 }, async t => {
  const f = await fixture(t, [
    () => reply({ name: "change-capability", input: { ...ref("fixture.notes.update"), input: { id: "n9", text: "assistant rewrite", expected_version: 1 } } }),
    body => { assert.match(JSON.stringify(body.messages), /笔记已改变/); return reply(undefined, "笔记在等待确认期间被你改过，没有覆盖。"); },
  ]);
  try {
    f.notes.set("n9", { text: "original", version: 1 });
    const sent = await f.service.send({ text: "改写 n9", request_id: "req-00000121" }, { project_ref: f.project });
    const held = await until(async () => { const v = await f.service.read(sent.work.work_id); return v.reviews.length ? v : undefined; }, "review");
    f.notes.set("n9", { text: "the person's own edit", version: 2 });
    await f.service.decide(sent.work.work_id, { review_id: held.reviews[0]!.review_id, decision: "approve" });
    const done = await until(async () => { const v = await f.service.read(sent.work.work_id); return ["completed", "failed"].includes(v.work.state) ? v : undefined; }, "end");
    assert.deepEqual(f.notes.get("n9"), { text: "the person's own edit", version: 2 }, "the newer version stays");
    const change = done.rounds[0]!.activity.find(item => item.verb === "change")!;
    assert.equal(change.state, "failed");
    assert.match(change.detail ?? "", /笔记已改变/);
    assert.equal(done.objects.filter(object => object.relation === "result").length, 0, "a refused change produced nothing");
  } finally { await f.close(); }
});

test("what the person does in the plugin settles what it made redundant: a suggestion about a note they changed is not run, a “做完了” about a result they edited goes quiet", { timeout: 60_000 }, async t => {
  const f = await fixture(t, [
    () => reply({ name: "suggest-action", input: { title: "改短这条笔记", summary: "把笔记改短", ...ref("fixture.notes.update"), input: { id: "n7", text: "short", expected_version: 1 } } }),
    () => reply(undefined, "给了一个建议。"),
    () => reply({ name: "change-capability", input: { ...ref("fixture.notes.create"), input: { text: "made by the assistant" } } }),
    () => reply(undefined, "已新建。"),
  ]);
  try {
    f.notes.set("n7", { text: "a long note", version: 1 });
    const sent = await f.service.send({ text: "看看 n7 能不能改短", request_id: "req-00000131" }, { project_ref: f.project });
    let view = await until(async () => { const v = await f.service.read(sent.work.work_id); return v.work.state === "completed" && v.cards.length ? v : undefined; }, "card");
    assert.equal(view.cards[0]!.status, "ready");
    // The person shortens the note themselves, in the plugin.
    f.notes.set("n7", { text: "short by hand", version: 2 });
    view = await f.service.read(sent.work.work_id);
    assert.equal(view.cards[0]!.status, "stale");
    assert.match(view.cards[0]!.outcome ?? "", /你在原处改过「a long note」/);
    const clicked = await f.service.runCard(sent.work.work_id, view.cards[0]!.card_id, { revision: view.cards[0]!.revision });
    assert.equal(clicked.status, "stale");
    assert.deepEqual(f.notes.get("n7"), { text: "short by hand", version: 2 }, "the suggestion never ran over their edit");

    // A result made while the person was elsewhere raises “做完了”; once they edit that result in the plugin, it goes quiet.
    await f.service.list();
    await f.service.send({ work_id: sent.work.work_id, text: "再新建一条", request_id: "req-00000132" }, {});
    const held = await until(async () => { await f.service.list(); const v = await f.service.read(sent.work.work_id); return v.reviews.length ? v : undefined; }, "review");
    await f.service.decide(sent.work.work_id, { review_id: held.reviews[0]!.review_id, decision: "approve" });
    await until(async () => (await f.service.list()).find(work => work.work_id === sent.work.work_id)?.state === "completed", "completed");
    assert.ok(f.service.notices(null).some(notice => notice.work_id === sent.work.work_id && notice.kind === "completed"));
    assert.equal(await f.service.settleHandledNotices(), 0, "not yet acted on");
    const made = [...f.notes.entries()].find(([, value]) => value.text === "made by the assistant")![0];
    f.notes.set(made, { text: "made, then edited by hand", version: 2 });
    assert.equal(await f.service.settleHandledNotices(), 1);
    assert.equal(f.service.notices(null).filter(notice => notice.work_id === sent.work.work_id && notice.kind === "completed").length, 0);
  } finally { await f.close(); }
});

test("an object the person moved to another project is named where it went, not read across; a deleted one stays missing", { timeout: 60_000 }, async t => {
  const f = await fixture(t, [
    () => reply(undefined, "看过了。"),
    body => {
      const text = JSON.stringify(body);
      assert.match(text, /已被用户移到项目「Other project」/);
      assert.match(text, /被移走的对象不要在这里重新创建/);
      assert.match(text, /「background」已被移到项目「Other project」。这项工作的范围读不到它现在的正文/);
      assert.doesNotMatch(text, /secret plan of the other project/, "a Home object of another project is not read from here");
      return reply(undefined, "它已移到 Other project。");
    },
  ]);
  // The placement service follows moves: the old identity finds the object in its new place.
  const where = new Map<string, { project_id: string; title: string }>();
  const describe: ActionDefinition = { capability_id: "placement.describe", version: 1, operation: "query", action: {
    title: "对象放在哪里", description: "按对象身份说明它现在存放在哪里", kind: "query", scope: "project", audiences: ["user", "agent"], permissions: ["notes:read"], subject_kinds: [],
    input_schema: { type: "object", properties: { object: { type: "object" } }, required: ["object"], additionalProperties: false } } };
  f.local.actionRegistry(f.project).registerProvider({ provider: { provider_id: "system.placement", kind: "system", title: "放置" }, definitions: [describe],
    handlers: [{ ...describe, handle(_c, input) {
      const object = (input as { object: { kind: string; id: string; project_id: string | null } }).object, now = where.get(object.id);
      const here = { kind: "project", project_id: "project", title: "Fixture project", access: "project", access_label: "项目成员" };
      if (!now) return { state: "missing", reason: "已删除", object, title: object.id, plugin: null, location: null, moved_from: null, associations: [], can: { move: false, copy: false, use_in_project: false }, open: null };
      return { state: "ok", reason: null, object: { ...object, project_id: now.project_id }, title: object.id === "t1" ? "Ship it" : "background", plugin: null,
        location: { kind: "project", project_id: now.project_id, title: now.title, access: "project", access_label: "项目成员" }, moved_from: here,
        associations: [], can: { move: true, copy: true, use_in_project: true }, open: { project_id: now.project_id, surface: "notes", id: object.id } };
    } }] });
  // A Home-kept to-do says which project it belongs to; the reader alone would still hand it over.
  let todoProject = "project";
  const todoReader = defineSubjectContextAction("fixture.todo.subject.read", "todo", "待办", ["notes:read"], "home");
  f.local.actionRegistry(f.project).registerProvider({ provider: { provider_id: "fixture.todo", kind: "plugin", title: "Todo" }, definitions: [todoReader],
    handlers: [{ ...todoReader, handle: () => subjectContext({ subject: { kind: "todo", id: "t1" }, revision: "1", title: "Ship it", content: todoProject === "project" ? "ship" : "secret plan of the other project",
      goal_ids: [], session_id: null, project_id: todoProject }) }] });
  try {
    f.notes.set("bg", { text: "background", version: 4 });
    f.notes.set("old", { text: "old note", version: 1 });
    const page = { source: { surface: "notes", title: "Notes" }, object: { kind: "note", id: "bg", version: 4, title: "background" }, captured_at: new Date().toISOString() };
    const sent = await f.service.send({ text: "看看这两条", request_id: "req-00000131", context: page,
      materials: [{ material_id: "m1", kind: "object", title: "old note", explicit: true, object: { kind: "note", id: "old", version: 1 }, text: "old note" },
        { material_id: "m2", kind: "object", title: "Ship it", explicit: true, object: { kind: "todo", id: "t1", version: 1 }, text: "ship" }] }, { project_ref: f.project });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "first round");

    // The person moves one note to another project and deletes the other, in their plugins.
    f.notes.delete("bg"); where.set("bg", { project_id: "other", title: "Other project" });
    f.notes.delete("old");
    todoProject = "other"; where.set("t1", { project_id: "other", title: "Other project" });
    const view = await f.service.read(sent.work.work_id);
    const states = view.objects.map(object => [object.relation, object.subject.id, object.state, object.title, object.moved_to ?? null, object.open ?? null]);
    assert.deepEqual(states, [
      ["origin", "bg", "moved", "background", { title: "Other project", kind: "project" }, null],
      ["material", "old", "missing", "old", null, null],
      ["material", "t1", "moved", "Ship it", { title: "Other project", kind: "project" }, null],
    ]);

    // Continued from the page that still shows the moved note: the round hears where it went, and nothing of its body.
    await f.service.send({ work_id: sent.work.work_id, text: "继续", request_id: "req-00000132", context: page }, { project_ref: f.project });
    await until(async () => { const v = await f.service.read(sent.work.work_id); return v.rounds.length === 2 && v.work.state === "completed"; }, "second round");
  } finally { await f.close(); }
});

test("a subject reader may live in the Home, and one declared with the schema before `open` is still accepted", async () => {
  const { inspectActionDeclarations, SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_OPEN } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const home = defineSubjectContextAction("fixture.calendar.subject.read", "calendar_item", "日历事项", ["calendar:read"], "home");
  assert.equal(home.action.scope, "home");
  assert.deepEqual(inspectActionDeclarations([home], undefined), []);
  const older = { ...subject, action: { ...subject.action, output_schema: SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_OPEN } };
  assert.deepEqual(inspectActionDeclarations([older], undefined), []);
  const wrong = { ...subject, action: { ...subject.action, output_schema: { type: "object" } } };
  assert.equal(inspectActionDeclarations([wrong], undefined).length, 1);
});
