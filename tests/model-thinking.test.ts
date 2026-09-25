import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DatabaseSync } from "node:sqlite";
import type { ModelProviderRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { ModelProviderStore } from "@molis-ai/molis-work-app-local-host";
import { AgentReviewQueue, createPrologueNodeAdapter, prologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";
import { renderModelSettingsDocument, type ModelSettingsPrimitives } from "@molis-ai/molis-work-app-workbench";

/**
 * 思考档是用户对每个供应商的选择：多花用量和时间，所以没选过就是关着，关着时请求里一个字段都没有；
 * 只有 Anthropic 格式有这个字段，别的格式在保存时就说清楚；开着时每一轮记下这一点，请求里带上它。
 */

const p: ModelSettingsPrimitives = {
  L: (text) => text,
  escape: (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
};
const record = (overrides: Partial<ModelProviderRecord> = {}): ModelProviderRecord => ({
  provider_id: "minimax", display_name: "minimax", base_url: "https://api.minimaxi.com/anthropic", api_format: "anthropic-messages",
  credential_ref: "model-provider:minimax", enabled: true, models: [{ model_id: "MiniMax-M3", enabled: true }],
  created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", ...overrides,
});

test("思考档：没选过是关着；打开后保存下来；没有思考字段的格式在保存时拒绝；旧库补列后是关着", () => {
  const directory = mkdtempSync(join(tmpdir(), "model-thinking-"));
  const db = new DatabaseSync(join(directory, "catalog.db"));
  try {
    // A table written before the column existed.
    db.exec(`CREATE TABLE model_providers (provider_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, base_url TEXT NOT NULL,
      api_format TEXT NOT NULL, credential_ref TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, prompt_cache TEXT NOT NULL DEFAULT 'off',
      models_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    db.exec(`INSERT INTO model_providers VALUES ('old', 'old', 'https://x.test', 'anthropic-messages', 'model-provider:old', 1, 'off', '[]', 'a', 'b')`);
    const store = new ModelProviderStore({ db: db as never, secrets: { put: () => {}, get: () => null, delete: () => {} } });
    assert.equal(store.get("old")?.thinking, "off", "an old provider never asked to think");
    const base = { provider_id: "minimax", display_name: "minimax", base_url: "https://api.minimaxi.com/anthropic", api_format: "anthropic-messages" as const };
    assert.equal(store.upsert(base).thinking, "off");
    assert.equal(store.upsert({ ...base, thinking: "adaptive" }).thinking, "adaptive");
    assert.equal(store.upsert(base).thinking, "adaptive", "saving without the field keeps the choice");
    assert.throws(() => store.upsert({ ...base, provider_id: "openai", base_url: "https://api.openai.com/v1", api_format: "openai-chat-completions", thinking: "adaptive" }),
      /没有思考档/);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("思考档：关着时配置里没有这个字段；设置页只在 Anthropic 格式上可选", () => {
  const selection = (provider: ModelProviderRecord) => prologueModelConfiguration({ provider, model: { model_id: "m", enabled: true }, api_key: "k" });
  assert.equal("thinking" in (selection(record())! as object), false);
  assert.equal("thinking" in (selection(record({ thinking: "off" }))! as object), false);
  assert.equal(selection(record({ thinking: "adaptive" }))?.thinking, "adaptive");
  const html = renderModelSettingsDocument({ providers: [record({ thinking: "adaptive" })], health: [], selected_provider_id: "minimax", primitives: p });
  assert.match(html, /data-model-thinking="minimax">.*value="adaptive" selected/s);
  assert.match(html, /用量和等待时间都会增加/);
  const openai = renderModelSettingsDocument({ providers: [record({ provider_id: "openai", api_format: "openai-chat-completions" })], health: [], selected_provider_id: "openai", primitives: p });
  assert.match(openai, /data-model-thinking="openai" disabled/);
});

test("packed SDK: 开着时请求带上思考档、这一轮记下它；关着时请求里没有这个字段", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-thinking-")), project = join(root, "project");await mkdir(project);
  const bodies: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    const events: string[] = [], emit = (type: string, value: unknown) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value as object })}\n\n`);
    emit("message_start", { message: { id: "m" + bodies.length, type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "先想一想。" } });
    emit("content_block_stop", { index: 0 });
    emit("content_block_start", { index: 1, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 1, delta: { type: "text_delta", text: "好的。" } });
    emit("content_block_stop", { index: 1 });emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } });emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  });
  let thinking: "adaptive" | undefined = "adaptive";
  const adapter = await createPrologueNodeAdapter({ app: { appId: "molis.thinking.test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "test", ...(thinking ? { thinking } : {}) }),
    resolveCredential: () => "test-only" });
  try {
    const owner = { board_id: "board", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "user" }, directory = { canonical_path: project, realpath_verified: true };
    const role = { role_id: "reader", version: 1, execution: "read-only" as const, prompts: [], host_tools: [] };
    const session = await adapter.createSession({ ...owner, directory, title: "thinking" });
    const done = async (ref: never) => { for (let i = 0; i < 200; i++) { const view = await adapter.read(ref); if (view.phase === "completed") return view; await new Promise(r => setTimeout(r, 25)); } throw new Error("run did not complete"); };
    const on = await done((await adapter.start({ ...owner, directory, session, task: "说一句话。", role_id: "reader", role })).ref as never);
    assert.deepEqual(bodies[0].thinking, { type: "adaptive" });
    assert.equal(on.frozen.thinking, "adaptive", "the round records that it was asked to think");
    assert.ok(on.activity.some(item => item.name === "reasoning"), "the thinking is shown as its own activity, not as the answer");
    assert.equal(on.turns.filter(turn => turn.kind === "assistant").at(-1)?.text, "好的。");
    thinking = undefined;
    const off = await done((await adapter.start({ ...owner, directory, session, task: "再说一句。", role_id: "reader", role })).ref as never);
    assert.equal("thinking" in bodies.at(-1), false, "off sends no thinking field at all");
    assert.equal(off.frozen.thinking, undefined);
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
