import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentFrozenCharacter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantCharacterChoice } from "@molis-ai/molis-work-contracts/services/assistant";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantError, AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

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

const EDITOR: AgentFrozenCharacter = { character_id: "editor", title: "严格的编辑", instructions: "你是严格的编辑：每次回答先列出三处可改进的地方。", host_tools: null,
  source: { owner_actor_id: "web-user", draft_revision: 2 }, reference: { artifact_id: "character:board:editor", version: 2 }, board_id: "board",
  content_digest: "digest-2", producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.4.0", binding_signature: "sig" }, published_at: "2026-09-28T00:00:00.000Z" };

async function fixture(t: import("node:test").TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-character-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", board_id: "board", storage_key: "memory:project" };
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    return reply();
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-character-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  host.register(adapter);
  // What the Characters plugin has published in this project: version 2 runs; version 1 was withdrawn.
  let published: AgentFrozenCharacter | null = EDITOR;
  const choices = (): AssistantCharacterChoice[] => [
    { reference: { artifact_id: EDITOR.reference.artifact_id, version: 2 }, title: EDITOR.title, available: published !== null, ...(published ? {} : { reason: "所选 Character 版本不可用" }) },
    { reference: { artifact_id: EDITOR.reference.artifact_id, version: 1 }, title: EDITOR.title, available: false, reason: "这个版本已停用" },
  ];
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => ({ ...assistantAuthority(local, work, () => new Set()),
      resolveCharacter: reference => {
        if (!published || reference.version !== published.reference.version) throw new Error("所选 Character 版本不可用，请明确选择其他版本或移除角色后再执行");
        return structuredClone(published);
      } }),
    characters: async () => choices(), projectTitle: async () => "项目", timeZone: "Asia/Shanghai" }, "web-user");
  return { service, store, requests, project, withdraw: () => { published = null; }, async close() { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); } };
}

test("a Character the person chose really carries the round: its instructions reach the model and the round says who carried it", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  try {
    const choices = await f.service.characters(undefined, { project_ref: f.project });
    assert.deepEqual(choices.map(choice => [choice.reference.version, choice.available]), [[2, true], [1, false]]);
    const sent = await f.service.send({ text: "帮我看看这段说明", request_id: "req-character-1", character: { artifact_id: EDITOR.reference.artifact_id, version: 2 } }, { project_ref: f.project });
    assert.deepEqual(sent.work.character, { artifact_id: EDITOR.reference.artifact_id, version: 2, title: "严格的编辑" });
    const done = await until(async () => { const view = await f.service.read(sent.work.work_id); return view.work.state === "completed" ? view : undefined; }, "completion");
    assert.ok(JSON.stringify(f.requests[0]).includes("每次回答先列出三处可改进的地方"), "the Character's instructions are part of the role the model runs");
    assert.deepEqual(done.rounds[0]!.character, { artifact_id: EDITOR.reference.artifact_id, version: 2, title: "严格的编辑" });

    // The choice stays with the work; clearing it hands the next round back to the Assistant itself.
    const again = await f.service.send({ text: "继续", request_id: "req-character-2", work_id: sent.work.work_id, character: null }, {});
    assert.equal(again.work.character, undefined);
    const second = await until(async () => { const view = await f.service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "second round");
    assert.equal(second.rounds[1]!.character, undefined);
    assert.ok(!JSON.stringify(f.requests.at(-1)).includes("每次回答先列出三处可改进的地方"), "without a Character, its instructions are not in the role");
  } finally { await f.close(); }
});

test("an unavailable Character is refused with why, never swapped for another; personal work cannot have one", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  try {
    await assert.rejects(f.service.send({ text: "用旧版本", request_id: "req-character-3", character: { artifact_id: EDITOR.reference.artifact_id, version: 1 } }, { project_ref: f.project }),
      (error: unknown) => error instanceof AssistantError && error.code === "assistant.character_unavailable" && /已停用/.test(error.message));
    await assert.rejects(f.service.send({ text: "个人事", request_id: "req-character-4", scope: { kind: "personal" }, character: { artifact_id: EDITOR.reference.artifact_id, version: 2 } }, {}),
      /个人工作暂时不能指定角色/);
    // Chosen while available, withdrawn before the next round: the round refuses rather than running as someone else.
    const sent = await f.service.send({ text: "第一轮", request_id: "req-character-5", character: { artifact_id: EDITOR.reference.artifact_id, version: 2 } }, { project_ref: f.project });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "first round");
    f.withdraw();
    const before = f.requests.length;
    await assert.rejects(f.service.send({ text: "第二轮", request_id: "req-character-6", work_id: sent.work.work_id }, {}), /不可用/);
    assert.equal(f.requests.length, before, "no model call ran under the withdrawn Character");
    assert.equal((await f.service.read(sent.work.work_id)).work.draft, "第二轮", "what the person typed is kept");
  } finally { await f.close(); }
});

test("a plugin handing a result back links it to the work as a result; a reply without an object or source is refused", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  try {
    const sent = await f.service.send({ text: "起草一份说明", request_id: "req-reply-1" }, { project_ref: f.project });
    await until(async () => (await f.service.read(sent.work.work_id)).work.state === "completed", "round");
    await f.service.receiveResult(sent.work.work_id, { object: { kind: "pages_document", id: "doc-7", title: "说明", version: 3 }, source: { surface: "pages", title: "Pages" } });
    const relations = f.store.relations.forWork({ work_id: sent.work.work_id, project_id: "project" });
    const result = relations.find(row => row.relation === "result");
    assert.deepEqual([result?.object.kind, result?.object.id, result?.object.revision, result?.cause], ["pages_document", "doc-7", "3", "Pages 交回"]);
    await assert.rejects(f.service.receiveResult(sent.work.work_id, { object: { kind: "pages_document" }, source: { surface: "pages" } }), /对象种类、标识和来自哪里/);
    await assert.rejects(f.service.receiveResult(sent.work.work_id, { object: { kind: "pages_document", id: "x" } }), /对象种类、标识和来自哪里/);
    assert.equal((await f.service.read(sent.work.work_id)).work.state, "completed", "receiving a result does not reopen or finish the work by itself");
  } finally { await f.close(); }
});
