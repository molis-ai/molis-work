import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { AgentDefinitions, agentRegistration } from "../apps/local-host/src/agent-definitions/agent-definitions.js";
import { builtinAgents } from "../apps/local-host/src/agent-definitions/builtin-agents.js";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

function registry(now = () => new Date("2026-09-28T00:00:00.000Z")) {
  const definitions = new AgentDefinitions(new DatabaseSync(":memory:"), now);
  for (const agent of builtinAgents()) definitions.register(agentRegistration(agent.owner_id, agent.source, agent.manifest, agent.prompts));
  return definitions;
}

test("every built-in Agent is registered: its prompts named for the roles that use them, its roles and children with what they may do", () => {
  const definitions = registry();
  const prompts = definitions.prompts();
  const assistant = prompts.find(prompt => prompt.key === `${ASSISTANT_PLUGIN_ID}/assistant-base`)!;
  assert.equal(assistant.source.kind, "system");
  assert.equal(assistant.layer, "base");
  assert.deepEqual(assistant.used_by, ["个人工作助理"]);
  assert.equal(assistant.effective, "default");
  const coding = prompts.filter(prompt => prompt.owner_id === "io.molis.work.coding");
  assert.ok(coding.length >= 5, "Coding's base, role and compaction prompts");
  assert.ok(coding.some(prompt => prompt.prompt_id === "coding-base" && prompt.title === "基础约束"));
  assert.ok(coding.some(prompt => prompt.title === "上下文整理"));
  const roles = definitions.roles();
  assert.ok(roles.some(role => role.owner_id === "io.molis.work.coding" && role.subagent), "child roles are listed");
  // Every role's prompts are registered, so nothing a role runs with escapes the settings.
  const keys = new Set(prompts.map(prompt => prompt.key));
  for (const role of roles) for (const key of role.prompt_keys) assert.ok(keys.has(key), `${role.key} → ${key}`);
  // Every built-in Agent owner is present.
  assert.deepEqual([...new Set(prompts.map(prompt => prompt.owner_id))].sort(), builtinAgents().map(agent => agent.owner_id).sort());
});

test("the person's edit is kept apart from the default: saved, conflict-checked, restorable, and flagged when the default moves on", () => {
  let clock = 0;
  const definitions = registry(() => new Date(Date.UTC(2026, 8, 28, 0, 0, clock++)));
  const key = `${ASSISTANT_PLUGIN_ID}/assistant-base`;
  assert.throws(() => definitions.save(key, "   ", null, "web-user"), /不能为空/);
  assert.throws(() => definitions.save(key, "x".repeat(20_001), null, "web-user"), /最长/);
  const saved = definitions.save(key, "只用中文回答。", null, "web-user");
  assert.deepEqual([saved.effective, saved.body, saved.user?.revision, saved.user?.base_version, saved.default_updated], ["user", "只用中文回答。", 1, 5, false]);
  assert.throws(() => definitions.save(key, "改第二次", null, "web-user"), /已在别处修改/, "an edit made against the default cannot overwrite one made since");
  const second = definitions.save(key, "只用中文回答，简短。", 1, "web-user");
  assert.equal(second.user?.revision, 2);

  // The run's text is the person's version, marked so its record can say so; other prompts pass through.
  const effective = definitions.effective(ASSISTANT_PLUGIN_ID, { prompt_id: "assistant-base", version: 5, layer: "base", body: "default" });
  assert.deepEqual([effective.body, effective.user_revision], ["只用中文回答，简短。", 2]);
  assert.deepEqual(definitions.effective("io.molis.work.unknown", { prompt_id: "x", version: 1, body: "as given" }).body, "as given");
  assert.equal(definitions.prompt(key).last_used?.user_revision, 2);

  // A newer default does not replace the person's version; it is flagged for them to look at.
  const [assistant] = builtinAgents();
  definitions.register(agentRegistration(assistant!.owner_id, assistant!.source, { ...assistant!.manifest, prompts: [{ prompt_id: "assistant-base", version: 6, layer: "base" }] },
    [{ ...assistant!.prompts[0]!, version: 6, body: "新的默认" }]));
  assert.deepEqual([definitions.prompt(key).effective, definitions.prompt(key).default_updated, definitions.prompt(key).default_body], ["user", true, "新的默认"]);

  const reset = definitions.reset(key, 2, "web-user");
  assert.deepEqual([reset.effective, reset.body, reset.user], ["default", "新的默认", undefined]);
  assert.deepEqual(definitions.history(key).map(row => [row.revision, row.action]), [[3, "reset"], [2, "save"], [1, "save"]]);
  assert.throws(() => definitions.instruction(ASSISTANT_PLUGIN_ID, "assistant-base", "test"), /不是模型调用的指令/);
});

function reply(text: string): Response {
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

test("a run starts with the person's version of a registered prompt, and its record says which version it used", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-definitions-"));
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    return reply("好的。");
  });
  const definitions = registry();
  definitions.save(`${ASSISTANT_PLUGIN_ID}/assistant-base`, "你是测试用的助理：每句话都以「收到」开头。", null, "web-user");
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue, prompts: definitions });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.definitions-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user")) }, "web-user");
  try {
    const sent = await service.send({ text: "你好", request_id: "req-00000201" }, {});
    for (let i = 0; i < 400 && (await service.read(sent.work.work_id)).work.state !== "completed"; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(JSON.stringify(requests[0]), /每句话都以「收到」开头/);
    assert.doesNotMatch(JSON.stringify(requests[0]), /你是 Molis Work 的个人工作助理/, "the default text did not run");
    const session = await host.adapter("prologue").readSession({ session_id: store.get("web-user", sent.work.work_id).session_id! });
    const frozen = (session as any).latest_run.frozen.prompts.find((prompt: { prompt_id: string }) => prompt.prompt_id === "assistant-base");
    assert.deepEqual([frozen.version, frozen.user_revision], [5, 1]);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
