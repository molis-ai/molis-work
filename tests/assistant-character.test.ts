import assert from "node:assert/strict";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentFrozenCharacter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CharacterRoleCatalog, CharacterTaskSelection } from "@molis-ai/molis-work-contracts/modules/characters";

// The Assistant words every round's materials in the language it runs in (`format.date`): the process needs the
// Host's text context installed, as a running Host has it.
installHostUiText();
import { installHostUiText, LocalHost } from "@molis-ai/molis-work-app-local-host";
import { AssistantStore } from "@molis-ai/molis-work-app-local-host";
import { AssistantService } from "@molis-ai/molis-work-app-local-host";
import { assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import { answeringEndingReviews } from "./fixtures/ending-review.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

function reply(text = "好的。"): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

// The person's original 「严格的编辑」 and its member in this project (role-service-design §2): a round names the stable choice and the
// Host pins the version. A second member, 旧编辑, is turned off.
const EDITOR_VERSION = { kind: "project" as const, member_id: "m-editor", member_version: 2, original: { kind: "personal" as const, character_id: "editor", version: 2 } };
const EDITOR: AgentFrozenCharacter = { version: EDITOR_VERSION, character_id: "editor", title: "严格的编辑", instructions: "你是严格的编辑：每次回答先列出三处可改进的地方。", host_tools: null,
  project_id: "project", owner_actor_id: "web-user", saved_at: "2026-09-28T00:00:00.000Z" };
const ORIGINAL: AgentFrozenCharacter = { ...EDITOR, version: EDITOR_VERSION.original, project_id: null };
const editorRef = { kind: "project" as const, member_id: "m-editor" }, oldRef = { kind: "project" as const, member_id: "m-old" };
const editorChoice = { ref: editorRef, title: "严格的编辑", character_id: "editor" };
type MemberState = "active" | "disabled" | "removed";

/** What Characters answers for the person: the original, and in the project its members (旧编辑 turned off). */
function roleCatalog(project: unknown, editor: MemberState): CharacterRoleCatalog {
  const original = { ref: { kind: "personal" as const, character_id: "editor" }, title: EDITOR.title, state: "active" as const, draft_revision: 2, version: 2, origin: null,
    use: { projects: 1, changed: 0 }, host_tools: null, availability: { available: true as const } };
  const member = (member_id: string, state: "active" | "disabled", title: string) => ({ title, host_tools: null,
    role: { layer: "project" as const, state, revision: "r2", current: { ...EDITOR_VERSION, member_id }, origin: null, sections: { work_style: { mode: "follow" as const }, capabilities: { mode: "follow" as const } } },
    availability: state === "active" ? { available: true as const } : { available: false as const, reason: "disabled" as const } });
  return { in_project: Boolean(project), originals: [original],
    members: project ? [...(editor === "removed" ? [] : [member("m-editor", editor, EDITOR.title)]), member("m-old", "disabled", "旧编辑")] : [],
    defaults: { personal: null, project: null }, effective: { kind: "assistant", source: "assistant" } };
}

/** Characters' two answers to the Host: the current version of a choice (a turned-off one is refused), and a fixed version (gone once removed). */
function roleAuthority(state: () => MemberState) {
  return {
    resolveCharacter: (choice: CharacterTaskSelection) => {
      if (choice.kind === "personal" && choice.character_id === "editor") return structuredClone(ORIGINAL);
      if (choice.kind === "project" && choice.member_id === "m-editor" && state() === "active") return structuredClone(EDITOR);
      throw new Error("所选角色已停用或不在本项目里");
    },
    characterVersion: (version: AgentFrozenCharacter["version"]) => {
      if (version.kind === "personal") return structuredClone(ORIGINAL);
      if (state() === "removed") throw new Error("角色已移出");
      return structuredClone(EDITOR);
    },
  };
}

async function fixture(t: import("node:test").TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-character-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", storage_key: "memory:project" };
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(text), async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    return reply();
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "system.assistant-character-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  host.register(adapter);
  let editor: MemberState = "active";
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set()), ...roleAuthority(() => editor) }),
    characters: async scope => roleCatalog(scope, editor), projectTitle: async () => "项目", timeZone: "Asia/Shanghai" }, "web-user");
  return { service, store, db, requests, project, set: (state: MemberState) => { editor = state; }, async close() { service.continuations.close(); db.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); } };
}

test("B36F-02 a persisted artifact selection refuses sending and keeps the draft until the person chooses again", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  try {
    const first = await f.service.send({ text: "保留这一轮", request_id: "legacy-first", character: editorRef }, { project_ref: f.project });
    const id = first.work.work_id;
    await until(async () => (await f.service.read(id)).work.state === "completed", "first round");
    const old = JSON.stringify({ artifact_id: "published-old-role", version: 1, title: "旧角色" });
    f.db.prepare("UPDATE assistant_works SET body = json_set(body, '$.character', json(?)) WHERE work_id = ?").run(old, id);
    f.db.prepare("UPDATE assistant_rounds SET body = json_set(body, '$.character', json(?)) WHERE work_id = ?").run(old, id);
    f.db.prepare("UPDATE assistant_requests SET result = json_set(result, '$.work.character', json(?)) WHERE work_id = ?").run(old, id);
    const before = await f.service.read(id);
    assert.equal(before.work.character, undefined);
    assert.equal(before.work.character_selection_required, true);
    assert.equal(before.rounds[0]?.character, undefined);
    assert.equal(before.rounds[0]?.text, "保留这一轮");
    const receipt = f.store.requests.read("web-user", "legacy-first");
    assert.equal(receipt.state, "sent");
    assert.equal(receipt.result.work.character, undefined);
    assert.equal(receipt.result.work.character_selection_required, true);
    const calls = f.requests.length;
    await assert.rejects(f.service.send({ work_id: id, request_id: "legacy-refused", text: "下一轮原话" }, {}),
      (error: unknown) => error instanceof ActionError && error.code === "assistant.character_unavailable" && /重新选择角色/.test(error.message));
    assert.equal(f.requests.length, calls);
    assert.equal((await f.service.read(id)).work.draft, "下一轮原话");
    const resumed = await f.service.send({ work_id: id, request_id: "legacy-cleared", text: "下一轮原话", character: null }, {});
    assert.equal(resumed.work.work_id, id);
    assert.equal(resumed.work.character_selection_required, undefined);
    await until(async () => { const view = await f.service.read(id); return view.rounds.length === 2 && view.work.state === "completed"; }, "resumed round");

    const incomplete = JSON.stringify({ ref: editorRef, title: editorChoice.title });
    f.db.prepare("UPDATE assistant_works SET body = json_set(body, '$.character', json(?)) WHERE work_id = ?").run(incomplete, id);
    assert.equal((await f.service.read(id)).work.character_selection_required, true);
    const corrected = await f.service.send({ work_id: id, request_id: "legacy-reselected", text: "还是请原来的编辑", character: editorRef }, {});
    assert.deepEqual(corrected.work.character, editorChoice);
    const last = await until(async () => {
      const view = await f.service.read(id);
      return view.rounds.length === 3 && view.work.state === "completed" ? view : undefined;
    }, "the same role resumed");
    assert.deepEqual(last.rounds.map(round => round.text), ["保留这一轮", "下一轮原话", "还是请原来的编辑"]);
    assert.deepEqual(last.rounds[2]?.character, { ...editorChoice, version: EDITOR_VERSION });
  } finally { await f.close(); }
});

test("a Character the person chose really carries the round: its instructions reach the model and the round says who carried it", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  try {
    const choices = await f.service.characters(undefined, { project_ref: f.project });
    assert.deepEqual(choices!.members.map(entry => [entry.role.current.member_id, entry.availability.available]), [["m-editor", true], ["m-old", false]]);
    const sent = await f.service.send({ text: "帮我看看这段说明", request_id: "req-character-1", character: editorRef }, { project_ref: f.project });
    assert.deepEqual(sent.work.character, editorChoice, "the work keeps the stable choice, never a version");
    const done = await until(async () => { const view = await f.service.read(sent.work.work_id); return view.work.state === "completed" ? view : undefined; }, "completion");
    assert.ok(JSON.stringify(f.requests[0]).includes("每次回答先列出三处可改进的地方"), "the Character's instructions are part of the role the model runs");
    assert.deepEqual(done.rounds[0]!.character, { ...editorChoice, version: EDITOR_VERSION }, "the round says which version the Host pinned");

    // The choice stays with the work; clearing it hands the next round back to the Assistant itself.
    const again = await f.service.send({ text: "继续", request_id: "req-character-2", work_id: sent.work.work_id, character: null }, {});
    assert.equal(again.work.character, undefined);
    const second = await until(async () => { const view = await f.service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "second round");
    assert.equal(second.rounds[1]!.character, undefined);
    assert.ok(!JSON.stringify(f.requests.at(-1)).includes("每次回答先列出三处可改进的地方"), "without a Character, its instructions are not in the role");
  } finally { await f.close(); }
});

test("ROLE-08 ROLE-11 an unavailable role is refused with why, never swapped for another; personal work has roles too; a role turned off mid-work keeps its version, one removed stops it", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  try {
    await assert.rejects(f.service.send({ text: "用旧编辑", request_id: "req-character-3", character: oldRef }, { project_ref: f.project }),
      (error: unknown) => error instanceof ActionError && error.code === "assistant.character_unavailable" && error.kind === "invalid" && /已停用/.test(error.message));
    // Plan C: personal work takes the person's own roles.
    const personal = await f.service.send({ text: "个人事", request_id: "req-character-4", scope: { kind: "personal" }, character: { kind: "personal", character_id: "editor" } }, {});
    assert.deepEqual(personal.work.character, { ref: { kind: "personal", character_id: "editor" }, title: "严格的编辑", character_id: "editor" });
    await until(async () => (await f.service.read(personal.work.work_id)).work.state === "completed", "personal round");
    // Chosen while available, turned off before the next round: the work goes on with the version it started with.
    const sent = await f.service.send({ text: "第一轮", request_id: "req-character-5", character: editorRef }, { project_ref: f.project });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "first round");
    f.set("disabled");
    await f.service.send({ text: "第二轮", request_id: "req-character-6", work_id: sent.work.work_id }, {});
    const second = await until(async () => { const view = await f.service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "second round");
    assert.deepEqual(second.rounds[1]!.character?.version, EDITOR_VERSION);
    // Removed from the project: its version is gone, and the round refuses rather than running as someone else.
    f.set("removed");
    const before = f.requests.length;
    await assert.rejects(f.service.send({ text: "第三轮", request_id: "req-character-7", work_id: sent.work.work_id }, {}), /已移出/);
    assert.equal(f.requests.length, before, "no model call ran under the removed role");
    assert.equal((await f.service.read(sent.work.work_id)).work.draft, "第三轮", "what the person typed is kept");
  } finally { await f.close(); }
});


test("a plugin handing a result back links it to the work as a result; a reply without an object or source is refused", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  try {
    const sent = await f.service.send({ text: "起草一份说明", request_id: "req-reply-1" }, { project_ref: f.project });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "round");
    await f.service.outcomes.receiveResult(sent.work.work_id, { object: { kind: "pages_document", id: "doc-7", title: "说明", version: 3 }, source: { surface: "pages", title: "Pages" } });
    const relations = f.store.relations.forWork({ work_id: sent.work.work_id, project_id: "project" });
    const result = relations.find(row => row.relation === "result");
    assert.deepEqual([result?.object.kind, result?.object.id, result?.object.revision, result?.cause], ["pages_document", "doc-7", "3", "Pages 交回"]);
    await assert.rejects(f.service.outcomes.receiveResult(sent.work.work_id, { object: { kind: "pages_document" }, source: { surface: "pages" } }), /对象种类、标识和来自哪里/);
    await assert.rejects(f.service.outcomes.receiveResult(sent.work.work_id, { object: { kind: "pages_document", id: "x" } }), /对象种类、标识和来自哪里/);
    assert.equal((await f.service.read(sent.work.work_id)).work.state, "completed", "receiving a result does not reopen or finish the work by itself");
  } finally { await f.close(); }
});

function toolReply(name: string, input: unknown): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name, input: {} } });
  emit("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

test("with no role chosen, the Assistant hands a part to a professional role by id: the sub-task runs as exactly that role; a role not on offer is refused, never swapped", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-role-delegation-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", storage_key: "memory:project" };
  const parentRequests: any[] = [], childRequests: any[] = [];
  let step = 0;
  const script: Array<(body: any) => Response> = [
    body => { assert.match(JSON.stringify(body.messages), /可委托的专业角色[\s\S]*严格的编辑」（id：project:m-editor）/); return toolReply("delegate-work", { title: "润色开头", brief: "把这句周报开头改得更精炼。", acceptance: "给出一版改写", character: "project:m-editor" }); },
    () => toolReply("delegate-work", { title: "法务审阅", brief: "审一下。", acceptance: "有结论", character: "法务专员" }),
    body => { assert.match(JSON.stringify(body.messages), /没有「法务专员」这个专业角色/); return reply("一部分交给了严格的编辑；没有法务角色，法务那部分没有委托。"); },
  ];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(text), async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    if (JSON.stringify(body.messages).includes("委托的子任务")) { childRequests.push(body); return reply("改写：本周完成三项交付。"); }
    parentRequests.push(body);
    return (script[step++] ?? (() => reply()))(body);
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "system.assistant-role-delegation-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), ...roleAuthority(() => "active") }),
    characters: async scope => roleCatalog(scope, "active"),
    projectTitle: async () => "项目" }, "web-user");
  try {
    const sent = await service.send({ text: "帮我改改周报开头，再找法务看一下", request_id: "req-role-delegation" }, { project_ref: project });
    const done = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && view.delegated?.[0]?.state === "completed" ? view : undefined; }, "parent and child");
    assert.equal(done.work.character, undefined, "the parent itself carries no role");
    const child = await service.read(done.delegated![0]!.work_id);
    assert.deepEqual(child.work.character, editorChoice);
    assert.deepEqual(child.rounds[0]!.character, { ...editorChoice, version: EDITOR_VERSION }, "the sub-task's round says who carried it");
    assert.ok(JSON.stringify(childRequests[0]).includes("每次回答先列出三处可改进的地方"), "the role's instructions reach the sub-task's model");
    assert.deepEqual(child.work.delegated_by?.work_id, sent.work.work_id, "where it came from stays visible");
    assert.equal(done.delegated!.length, 1, "the role not on offer started nothing");
  } finally { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("WLN-40 PWA-158: said to a Character, the words go to its own main conversation; a task it hands to the background is done by it and comes back to it; the Assistant's main conversation is another work", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-character-main-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", storage_key: "memory:project" };
  const childRequests: Array<{ messages: unknown }> = [];
  let step = 0;
  const script: Array<() => Response> = [
    () => toolReply("delegate-work", { title: "润色开头", brief: "把这句周报开头改得更精炼。", acceptance: "给出一版改写" }),
    () => reply("已经放到后台改，改好告诉你。"),
  ];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(text), async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)) as { messages: unknown };
    if (JSON.stringify(body.messages).includes("委托的子任务")) { childRequests.push(body); return reply("改写：本周完成三项交付。"); }
    return (script[step++] ?? (() => reply()))();
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "system.assistant-character-main-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), ...roleAuthority(() => "active") }),
    characters: async scope => roleCatalog(scope, "active"),
    projectTitle: async () => "项目" }, "web-user");
  const editor = editorRef;
  try {
    const sent = await service.send({ text: "帮我改改周报开头", main: true, character: editor, request_id: "req-character-main-1" }, { project_ref: project });
    assert.deepEqual([sent.work.main, sent.work.character?.title], [true, "严格的编辑"]);
    const done = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && view.delegated?.[0]?.state === "completed" ? view : undefined; }, "the Character's conversation and its task");
    // The task names no role: it is done by the one the person is talking to, and the board of that conversation has it.
    const child = await service.read(done.delegated![0]!.work_id);
    assert.deepEqual(child.work.character, editorChoice);
    assert.deepEqual(child.rounds[0]!.character, { ...editorChoice, version: EDITOR_VERSION }, "the task's round says who carried it");
    assert.ok(JSON.stringify(childRequests[0]).includes("每次回答先列出三处可改进的地方"), "the Character's instructions reach the task's model");
    assert.equal(child.work.delegated_by?.work_id, sent.work.work_id, "it reports back to the Character's conversation");
    // The Assistant's main conversation of the same project is its own work, with its own draft and nothing of the Character's.
    const own = await service.send({ text: "今天有什么要办", main: true, request_id: "req-character-main-2" }, { project_ref: project });
    assert.notEqual(own.work.work_id, sent.work.work_id);
    assert.equal(own.work.character, undefined);
    assert.equal((await service.read(own.work.work_id)).delegated?.length ?? 0, 0, "the Character's task is not on the Assistant's board");
    // Said again to the Character: the same standing conversation.
    const again = await service.send({ text: "再短一点", main: true, character: editor, request_id: "req-character-main-3" }, { project_ref: project });
    assert.equal(again.work.work_id, sent.work.work_id);
  } finally { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
