import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority, installHostUiText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { reply } from "./fixtures/fixture-replies.js";
import { answeringEndingReviews } from "./fixtures/ending-review.js";

installHostUiText();

// specs/work-line §3.2, contract-design §10: what the person says at 「现在」 goes to one standing conversation per scope and
// counterpart; it is opened the first time it is used and found again after that.

async function until<T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

async function fixture(t: TestContext, line: Array<{ kind: string; id: string }> = []) {
  const home = await mkdtemp(join(tmpdir(), "molis-main-conversation-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    requests.push(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    return reply(undefined, "好的。");
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.main-conversation", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), projectTitle: async () => "项目",
    // What the work line shows this person in the project: the only thing the service reads through this port here.
    scopeActions: async () => ({ discover: async () => [], invoke: async () => ({ events: line.map(subject => ({ subject })), issues: [] }) }) }, "web-user");
  t.after(async () => { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); });
  const done = (workId: string, rounds: number) => until(async () => { const view = await service.read(workId); return view.work.state === "completed" && view.rounds.length === rounds ? view : undefined; }, `round ${rounds} of ${workId}`);
  return { service, store, requests, done };
}

// PWA-129: new words at 「现在」 go to the scope's main conversation, not to the latest task.
test("WLN-15: what is said at 「现在」 goes to one standing main conversation per scope: opened once, found again, and carried by the main-conversation role", { timeout: 90_000 }, async t => {
  const { service, store, requests, done } = await fixture(t);
  const board = { project_id: "board", storage_key: "memory:board" }, other = { project_id: "other", storage_key: "memory:other" };
  const first = await service.send({ text: "帮我看看今天有什么要办", main: true, request_id: "req-main-0001" }, { project_ref: board });
  assert.equal(first.work.main, true);
  assert.equal(first.work.title, "与助理的对话", "named for the conversation, not for the first thing said in it");
  // Nothing is stored in a language: the name is the reader's (specs/work-line §12, 2026-11-15).
  assert.equal(store.get("web-user", first.work.work_id).title, "", "the main conversation stores no title");
  assert.equal((await runWithLocale("en", () => service.read(first.work.work_id))).work.title, "Conversation with the Assistant");
  // A notice about it was written with the empty title; each reader gets the name in their own language, in the notice and its words.
  store.raiseNotice("web-user", { kind: "completed", work_id: first.work.work_id, work_title: "", text: { owner: "workbench", key: "workbench.assistant-notice.completed", args: [{ name: "title", kind: "text", text: "" }] } }, "main-notice");
  const noticeIn = (locale: "zh" | "en") => runWithLocale(locale, () => service.notices.notices(null).find(one => one.work_id === first.work.work_id)!);
  assert.deepEqual([noticeIn("zh").work_title, noticeIn("en").work_title], ["与助理的对话", "Conversation with the Assistant"]);
  assert.deepEqual(noticeIn("en").text, { owner: "workbench", key: "workbench.assistant-notice.completed", args: [{ name: "title", kind: "text", text: "Conversation with the Assistant" }] });
  await done(first.work.work_id, 1);
  assert.match(requests[0]!, /这是你和用户的主对话/, "the round is told how a main conversation works");
  // Said again without naming a work: the same conversation.
  const again = await service.send({ text: "再帮我查一下汇率", main: true, request_id: "req-main-0002" }, { project_ref: board });
  assert.equal(again.work.work_id, first.work.work_id);
  await done(first.work.work_id, 2);
  assert.equal(store.list("web-user").filter(work => work.main).length, 1);
  // Another project has its own; a personal one too.
  const elsewhere = await service.send({ text: "这边呢", main: true, request_id: "req-main-0003" }, { project_ref: other });
  assert.notEqual(elsewhere.work.work_id, first.work.work_id);
  const personal = await service.send({ text: "我自己的事", main: true, scope: { kind: "personal" }, request_id: "req-main-0004" }, {});
  assert.deepEqual([personal.work.main, personal.work.scope.kind], [true, "personal"]);
  await done(elsewhere.work.work_id, 1); await done(personal.work.work_id, 1);
  // A send that names no main conversation still starts a work of its own, which is not one.
  const ordinary = await service.send({ text: "单独起一件事", request_id: "req-main-0005" }, { project_ref: board });
  assert.equal(ordinary.work.main, undefined);
  assert.notEqual(ordinary.work.work_id, first.work.work_id);
  await done(ordinary.work.work_id, 1);
  assert.doesNotMatch(requests.at(-1)!, /这是你和用户的主对话/, "an ordinary work is not told it is the main conversation");
  // A main conversation is the Assistant's or a Character's, never an executor plugin's.
  await assert.rejects(service.send({ text: "交给 Coding", main: true, executor: { kind: "plugin", plugin_id: "io.molis.work.coding" }, request_id: "req-main-0006" }, { project_ref: board }),
    (error: unknown) => error instanceof ActionError && error.code === "assistant.invalid");
  assert.equal(store.list("web-user").filter(work => work.main).length, 3, "the refused send opened nothing");
});

test("WLN-12 WLN-33: what is said in an event's tab starts one work done for that event; an event the line does not show, or the main conversation, is refused and opens nothing", { timeout: 90_000 }, async t => {
  const todo = { kind: "todo_item", id: "t1" };
  const { service, store, done } = await fixture(t, [todo]);
  const board = { project_id: "board", storage_key: "memory:board" };
  const first = await service.send({ text: "先问预算", for_event: todo, request_id: "req-event-0001" }, { project_ref: board });
  assert.deepEqual([first.work.serves, first.work.main, first.work.line_event], [[todo], undefined, undefined], "done for the event: not an event of its own, not the main conversation");
  await done(first.work.work_id, 1);
  // Said again in the same tab, the page names the work: nothing about the event is read or changed.
  const again = await service.send({ text: "顺便问交期", work_id: first.work.work_id, for_event: { kind: "todo_item", id: "gone" }, request_id: "req-event-0002" }, { project_ref: board });
  assert.deepEqual([again.work.work_id, again.work.serves], [first.work.work_id, [todo]]);
  await done(first.work.work_id, 2);
  const count = store.list("web-user").length;
  const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;
  await assert.rejects(service.send({ text: "为别的事", for_event: { kind: "todo_item", id: "not-on-the-line" }, request_id: "req-event-0003" }, { project_ref: board }), refused("assistant.not_found"));
  await assert.rejects(service.send({ text: "主对话里", main: true, for_event: todo, request_id: "req-event-0004" }, { project_ref: board }), refused("assistant.invalid"));
  await assert.rejects(service.send({ text: "写错了", for_event: { kind: "todo_item" } as never, request_id: "req-event-0005" }, { project_ref: board }), refused("assistant.invalid"));
  assert.equal(store.list("web-user").length, count, "a refused send opens no work");
});
