import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { inspectActionDeclarations, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { actionKey, assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

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

const noteSchema = { type: "object", properties: { text: { type: "string", title: "内容" } }, required: ["text"], additionalProperties: false };
// Saving a note says how it is taken back: remove the note its output names.
const add: ActionDefinition = { capability_id: "fixture.notes.add", version: 1, operation: "command", action: {
  title: "Add a note", description: "Store a note", kind: "operation", scope: "project", audiences: ["agent"], permissions: ["notes:write"], subject_kinds: [],
  input_schema: noteSchema, undo: { capability_id: "fixture.notes.remove", version: 1, input: { note_id: "note.id" } } } };
const remove: ActionDefinition = { capability_id: "fixture.notes.remove", version: 1, operation: "command", action: {
  title: "Remove a note", description: "Remove a note", kind: "operation", scope: "project", audiences: ["user", "agent"], permissions: ["notes:write"], subject_kinds: [],
  input_schema: { type: "object", properties: { note_id: { type: "string" } }, required: ["note_id"], additionalProperties: false } } };

test("an undo is declared only on a change that can be taken back, pointing at its input in the output", () => {
  assert.deepEqual(inspectActionDeclarations([add, remove], []), []);
  const onQuery = { ...add, operation: "query" as const };
  assert.match(inspectActionDeclarations([onQuery], []).join(), /撤销声明/);
  const irreversible = { ...add, action: { ...add.action, effect: "irreversible" as const } };
  assert.match(inspectActionDeclarations([irreversible], []).join(), /撤销声明/);
  const badPath = { ...add, action: { ...add.action, undo: { capability_id: "fixture.notes.remove", version: 1, input: { note_id: "not a path" } } } };
  assert.match(inspectActionDeclarations([badPath], []).join(), /撤销声明/);
});

test("a change that can be undone runs when asked without a confirmation, and the person can take it back once; set to confirm each time it asks first", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-undo-"));
  const notes = new DatabaseSync(":memory:");
  notes.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", storage_key: "memory:project" };
  let next = 0;
  const unregister = local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, definitions: [add, remove],
    handlers: [{ ...add, handle(_context, input) { const id = `note-${++next}`; notes.prepare("INSERT INTO notes VALUES (?, ?)").run(id, (input as { text: string }).text); return { note: { id } }; } },
      { ...remove, handle(_context, input) { notes.prepare("DELETE FROM notes WHERE id = ?").run((input as { note_id: string }).note_id); return { removed: true }; } }] });
  const script: Array<(body: any) => Response> = [
    () => reply({ name: "change-reversible", input: { capability_id: "fixture.notes.add", version: 1, provider_id: "fixture.notes", input: { text: "周三前交方案" } } }),
    () => reply(undefined, "记下了，可以在工作面板撤销。"),
    () => reply(undefined, "好的，不再记这条。"),
    // Second work, after the person asks to confirm this capability each time: the direct route is refused, the ordinary one asks.
    () => reply({ name: "change-reversible", input: { capability_id: "fixture.notes.add", version: 1, provider_id: "fixture.notes", input: { text: "周五复盘" } } }),
    () => reply({ name: "change-capability", input: { capability_id: "fixture.notes.add", version: 1, provider_id: "fixture.notes", input: { text: "周五复盘" } } }),
    () => reply(undefined, "已提交，等你确认。"),
  ];
  const requests: string[] = [];
  let turn = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    requests.push(body);
    return (script[turn++] ?? (() => reply()))(JSON.parse(body));
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-undo-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user"), undefined, (view, input, output) => service.recordResult(work, view, input, output),
      undefined, undefined, undefined, () => store.confirmAlways("web-user")),
    // The person's own actions, for taking a change back by their click.
    scopeActions: async () => ({ discover: async () => local.actionClient(project).discover({ actor_id: "web-user", project_id: "project", audience: "user", permissions: ["notes:write"] }),
      invoke: async (action, input) => local.actionClient(project).invoke({ actor_id: "web-user", project_id: "project", audience: "user", permissions: ["notes:write"] }, action, input) }),
    projectTitle: async () => "Fixture project", timeZone: "Asia/Shanghai" }, "web-user");
  try {
    const sent = await service.send({ text: "记一下：周三前交方案", request_id: "undo-send-1" }, { project_ref: project });
    await until(() => requests[0], "first request");
    assert.ok(requests[0]!.includes("Add a note（可撤销）"), "the directory marks what may run without asking");
    assert.ok(JSON.parse(requests[0]!).tools.some((tool: { name: string }) => tool.name === "change-reversible"), JSON.stringify(JSON.parse(requests[0]!).tools.map((tool: { name: string }) => tool.name)));
    const done = await until(async () => { const v = await service.read(sent.work.work_id); return v.work.state === "completed" ? v : undefined; }, "round");
    assert.equal(done.reviews.length, 0, "nothing waited for a confirmation");
    assert.deepEqual(done.rounds[0]!.activity.map(item => `${item.verb}:${item.state}`), ["change:completed"], JSON.stringify(done.rounds[0]!.activity));
    assert.equal(notes.prepare("SELECT COUNT(*) n FROM notes").get()!.n, 1);
    assert.deepEqual(done.undoable?.map(item => [item.title, item.state]), [["Notes · Add a note", "available"]]);
    // The page that owns the note rereads once it is taken back: the view names the capability that takes it back.
    assert.equal(done.undoable![0]!.capability_id, "fixture.notes.remove");

    // Taken back once, by the person's click; the owner's own undo runs, and a second click is refused.
    const undone = await service.undo(sent.work.work_id, done.undoable![0]!.undo_id);
    assert.equal(notes.prepare("SELECT COUNT(*) n FROM notes").get()!.n, 0);
    assert.equal(undone.undoable![0]!.state, "undone");
    await assert.rejects(service.undo(sent.work.work_id, done.undoable![0]!.undo_id), /已经撤销过了/);
    // The next round of the work hears it was taken back, once.
    await service.send({ text: "好", request_id: "undo-send-1b", work_id: sent.work.work_id }, {});
    await until(async () => { const v = await service.read(sent.work.work_id); return v.rounds.length === 2 && v.work.state === "completed"; }, "second round");
    assert.ok(requests.at(-1)!.includes("用户撤销的修改") && requests.at(-1)!.includes("Notes · Add a note"), "the round is told what the person took back");

    // Set to confirm each time: the same change is no longer marked, the direct route is refused and the ordinary one asks.
    store.setConfirmAlways("web-user", actionKey({ capability_id: "fixture.notes.add", version: 1, provider_id: "fixture.notes" }), true);
    const again = await service.send({ text: "记一下：周五复盘", request_id: "undo-send-2" }, { project_ref: project });
    const waiting = await until(async () => { const v = await service.read(again.work.work_id); return v.reviews.length ? v : undefined; }, "review");
    assert.ok(requests.at(-1)!.includes("Add a note（修改）"));
    assert.equal(waiting.rounds[0]!.activity[0]!.state, "failed", "the direct route is refused for it");
    assert.equal(notes.prepare("SELECT COUNT(*) n FROM notes").get()!.n, 0, "nothing ran before the person confirms");
  } finally { unregister(); await adapter.close(); await local.close(); notes.close(); await rm(home, { recursive: true, force: true }); }
});

test("a round that makes exactly an offered undo's change spends that undo: the panel stops offering a take-back that can only fail", () => {
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => { throw new Error("not used"); }, authority: async () => { throw new Error("not used"); } }, "web-user");
  const work = store.create({ actor_id: "web-user", title: "今日要闻", scope: { kind: "personal" }, origin: null });
  const view = (definition: ActionDefinition) => ({ ...definition, provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, availability: { available: true } }) as never;
  service.recordResult(work, view(add), { text: "周三前交方案" }, { note: { id: "note-1" } });
  assert.deepEqual(store.undos("web-user", work.work_id).map(undo => undo.state), ["available"]);
  // Another note removed: the offered undo stands.
  service.recordResult(work, view(remove), { note_id: "note-9" }, { removed: true });
  assert.deepEqual(store.undos("web-user", work.work_id).map(undo => undo.state), ["available"]);
  // The round removed that very note itself (seen: asked to drop a document it made, it discarded the document).
  service.recordResult(work, view(remove), { note_id: "note-1" }, { removed: true });
  assert.deepEqual(store.undos("web-user", work.work_id).map(undo => undo.state), ["undone"]);
});

/** The undo fixture's service over a runtime whose model can be switched off, and a notes provider whose removal takes a moment. */
async function undoFixture(t: import("node:test").TestContext, script: Array<(body: any) => Response>) {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-undo-"));
  const notes = new DatabaseSync(":memory:");
  notes.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", storage_key: "memory:project" };
  let next = 0;
  const removes: string[] = [];
  const unregister = local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, definitions: [add, remove],
    handlers: [{ ...add, handle(_context, input) { const id = `note-${++next}`; notes.prepare("INSERT INTO notes VALUES (?, ?)").run(id, (input as { text: string }).text); return { note: { id } }; } },
      { ...remove, async handle(_context, input) {
        removes.push((input as { note_id: string }).note_id);
        await new Promise(resolve => setTimeout(resolve, 30));
        if (!notes.prepare("DELETE FROM notes WHERE id = ?").run((input as { note_id: string }).note_id).changes) throw Object.assign(new Error("note not_found"), { code: "notes.not_found" });
        return { removed: true };
      } }] });
  const requests: string[] = [];
  let turn = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    requests.push(body);
    return (script[turn++] ?? (() => reply()))(JSON.parse(body));
  });
  const flags = { model: true };
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-undo-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => flags.model ? { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" } : null, resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user"), undefined, (view, input, output) => service.recordResult(work, view, input, output),
      undefined, undefined, undefined, () => store.confirmAlways("web-user")),
    scopeActions: async () => ({ discover: async () => local.actionClient(project).discover({ actor_id: "web-user", project_id: "project", audience: "user", permissions: ["notes:write"] }),
      invoke: async (action, input) => local.actionClient(project).invoke({ actor_id: "web-user", project_id: "project", audience: "user", permissions: ["notes:write"] }, action, input) }),
    projectTitle: async () => "Fixture project", timeZone: "Asia/Shanghai" }, "web-user");
  const noteAdded = () => reply({ name: "change-reversible", input: { capability_id: "fixture.notes.add", version: 1, provider_id: "fixture.notes", input: { text: "周三前交方案" } } });
  return { service, store, requests, flags, removes, project, notes, noteAdded,
    close: async () => { unregister(); await adapter.close(); await local.close(); notes.close(); await rm(home, { recursive: true, force: true }); } };
}

test("a round that could not start has told the next one nothing: undone changes, ended background work and settled changes are still to be told", { timeout: 60_000 }, async t => {
  const f = await undoFixture(t, [() => f.noteAdded(), () => reply(undefined, "记下了。"), () => reply(undefined, "好的。"), () => reply(undefined, "好的。")]);
  try {
    const sent = await f.service.send({ text: "记一下：周三前交方案", request_id: "undo-told-1" }, { project_ref: f.project });
    const workId = sent.work.work_id;
    const done = await until(async () => { const v = await f.service.read(workId); return v.work.state === "completed" ? v : undefined; }, "round");
    await f.service.undo(workId, done.undoable![0]!.undo_id);
    // Background work that ended and a change that settled after a stop: both for the next round to hear once.
    const at = new Date().toISOString();
    f.store.saveJob("web-user", { key: "job-key-1", job_id: "job-1", work_id: workId, title: "Research · Start research", state: "completed", last_state: "completed", started_at: at, ended_at: at,
      status: { capability_id: "fixture.jobs.status", version: 1, provider_id: "fixture.jobs" }, input: "id", path: "status", done: ["completed"], failed: ["failed"], checks: 1 });
    f.store.saveUnsettled("web-user", { change_id: "chg-1", work_id: workId, title: "Notes · Add a note", started_at: at, state: "completed", settled_at: at });
    const untold = () => ({ undos: f.store.undos("web-user", workId).filter(undo => undo.state === "undone" && !undo.told).length,
      jobs: f.store.jobs("web-user", workId).filter(job => !job.told).length, unsettled: f.store.unsettled("web-user", workId, true).length });
    assert.deepEqual(untold(), { undos: 1, jobs: 1, unsettled: 1 });

    // The send fails before any round exists (no model): nothing was told.
    f.flags.model = false;
    await assert.rejects(f.service.send({ text: "继续", request_id: "undo-told-2", work_id: workId }, {}), /模型/);
    assert.deepEqual(untold(), { undos: 1, jobs: 1, unsettled: 1 }, "a round that never started told nobody");
    assert.equal((await f.service.read(workId)).rounds.length, 1);

    // The next round that does start hears all three, and then they are told.
    f.flags.model = true;
    await f.service.send({ text: "继续", request_id: "undo-told-3", work_id: workId }, {});
    await until(async () => { const v = await f.service.read(workId); return v.rounds.length === 2 && v.work.state === "completed"; }, "second round");
    // The role's own text names these sections, so what counts is the data line each puts in the round.
    const told = (body: string) => ({ undo: body.includes("用户已经撤销；除非用户再次要求"), job: body.includes("（任务 job-1）"), unsettled: body.includes("停止后已完成：不要再次提交") });
    assert.deepEqual(told(f.requests.at(-1)!), { undo: true, job: true, unsettled: true }, "the round that started was told all three");
    assert.deepEqual(untold(), { undos: 0, jobs: 0, unsettled: 0 }, "told once the round has started");
    await f.service.send({ text: "再继续", request_id: "undo-told-4", work_id: workId }, {});
    await until(async () => { const v = await f.service.read(workId); return v.rounds.length === 3 && v.work.state === "completed"; }, "third round");
    assert.ok(!told(f.requests.at(-1)!).undo && !told(f.requests.at(-1)!).job && !told(f.requests.at(-1)!).unsettled, "and not told again");
  } finally { await f.close(); }
});

test("two undo requests at once run the owner's undo once and agree on the outcome; a later failure never overwrites 'undone'", { timeout: 60_000 }, async t => {
  const f = await undoFixture(t, [() => f.noteAdded(), () => reply(undefined, "记下了。")]);
  try {
    const sent = await f.service.send({ text: "记一下：周三前交方案", request_id: "undo-claim-1" }, { project_ref: f.project });
    const workId = sent.work.work_id;
    const done = await until(async () => { const v = await f.service.read(workId); return v.work.state === "completed" ? v : undefined; }, "round");
    const undoId = done.undoable![0]!.undo_id;
    const results = await Promise.allSettled([f.service.undo(workId, undoId), f.service.undo(workId, undoId)]);
    assert.deepEqual(results.map(result => result.status), ["fulfilled", "fulfilled"], JSON.stringify(results.map(result => result.status === "rejected" ? String(result.reason) : "ok")));
    assert.equal(f.removes.length, 1, "the owner's undo ran once");
    assert.deepEqual(f.store.undos("web-user", workId).map(undo => [undo.state, undo.detail ?? null]), [["undone", null]]);
    assert.equal(f.notes.prepare("SELECT COUNT(*) n FROM notes").get()!.n, 0);

    // The owner cannot take it back, but the round itself had already removed the note meanwhile: the undo is spent, not failed.
    const second = await f.service.send({ text: "再记一条", request_id: "undo-claim-2", work_id: workId }, {});
    assert.equal(second.outcome, "started");
    await until(async () => { const v = await f.service.read(workId); return v.rounds.length === 2 && v.work.state === "completed"; }, "second round");
    const work = f.store.get("web-user", workId);
    const view = { ...remove, provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, availability: { available: true } } as never;
    f.service.recordResult(work, { ...add, provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, availability: { available: true } } as never, { text: "x" }, { note: { id: "note-gone" } });
    const fresh = f.store.undos("web-user", workId).find(undo => undo.state === "available")!;
    const running = f.service.undo(workId, fresh.undo_id);
    f.service.recordResult(work, view, { note_id: "note-gone" }, { removed: true });
    const settled = await running;
    assert.deepEqual(settled.undoable!.find(undo => undo.undo_id === fresh.undo_id)!.state, "undone", "the owner's later 'not found' did not turn a spent undo into a failed one");
    // A genuine failure is still a failure, and can be tried again.
    f.service.recordResult(work, { ...add, provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, availability: { available: true } } as never, { text: "y" }, { note: { id: "note-gone-2" } });
    const failing = f.store.undos("web-user", workId).find(undo => undo.state === "available")!;
    await assert.rejects(f.service.undo(workId, failing.undo_id), /没能撤销/);
    assert.equal(f.store.undos("web-user", workId).find(undo => undo.undo_id === failing.undo_id)!.state, "failed");
    f.notes.prepare("INSERT INTO notes VALUES ('note-gone-2', 'back')").run();
    await f.service.undo(workId, failing.undo_id);
    assert.equal(f.store.undos("web-user", workId).find(undo => undo.undo_id === failing.undo_id)!.state, "undone", "a failed undo can be tried again");
  } finally { await f.close(); }
});
