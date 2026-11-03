import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type PrologueInferenceClient } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextualCandidate, SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { DEFAULT_JUDGMENT_WORDING, fragmentCandidates } from "@molis-ai/molis-work-kernel/contextual";
import { pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { codingManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { AgentDefinitions, agentDefinitionsFor, agentRegistration } from "../apps/local-host/dist/agent-definitions/agent-definitions.js";
import { builtinAgents, builtinRegistrations } from "../apps/local-host/dist/agent-definitions/builtin-agents.js";
import { handleContextualHttp, judgmentWording, judgmentWordingRevision } from "../apps/local-host/dist/contextual/contextual-http.js";
import { bindPrologueInference } from "../apps/local-host/dist/prologue-inference-host.js";
import { ASSISTANT_PROMPTS } from "../apps/local-host/dist/assistant/assistant-agent.js";

const BASE_VERSION = ASSISTANT_PROMPTS.find(prompt => prompt.prompt_id === "assistant-base")!.version;

function registry(now = () => new Date("2026-09-28T00:00:00.000Z")) {
  const definitions = new AgentDefinitions(new DatabaseSync(":memory:"), now);
  for (const agent of builtinAgents()) definitions.register(agentRegistration(agent.owner_id, agent.source, agent.manifest, agent.prompts));
  // A plugin's Agent comes with its running definition (PG-051): Coding's, as its definition registers it.
  definitions.register(agentRegistration(codingManifest.plugin_id, { kind: "plugin", plugin_id: codingManifest.plugin_id, plugin_version: codingManifest.version,
    title: codingManifest.name, state: "enabled" }, codingManifest.agent!, codingPrompts), "coding-install");
  return definitions;
}

test("every built-in Agent is registered: its prompts named for the roles that use them, its roles and children with what they may do", () => {
  const definitions = registry();
  const prompts = definitions.prompts();
  const assistant = prompts.find(prompt => prompt.key === `${ASSISTANT_PLUGIN_ID}/assistant-base`)!;
  assert.equal(assistant.source.kind, "system");
  assert.equal(assistant.layer, "base");
  assert.deepEqual(assistant.used_by, ["个人工作助理", "委派的子任务"], "a delegated work runs on the same base");
  assert.deepEqual(prompts.find(prompt => prompt.key === `${ASSISTANT_PLUGIN_ID}/assistant-work`)!.used_by, ["个人工作助理"], "delegating and memory are the person's own work's layer");
  assert.deepEqual(prompts.find(prompt => prompt.key === `${ASSISTANT_PLUGIN_ID}/assistant-delegated`)!.used_by, ["委派的子任务"], "being delegated is that role's own layer");
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
  // The system's Agents and the running plugin's, nothing else.
  assert.deepEqual([...new Set(prompts.map(prompt => prompt.owner_id))].sort(), [...builtinAgents().map(agent => agent.owner_id), codingManifest.plugin_id].sort());
});

const NEXT_KEY = "system:contextual/contextual.next", SURFACE_KEY = "system:contextual/contextual.surface";

test("ADH-12 ADH-13 the base decides where 「记一下」 goes by one judgment, and each judgment the round's materials no longer carry is said once, in one layer", () => {
  const body = (id: string) => ASSISTANT_PROMPTS.find(prompt => prompt.prompt_id === id)!.body;
  const layers = { base: body("assistant-base"), work: body("assistant-work"), delegated: body("assistant-delegated") };
  assert.deepEqual(layers.base.split("\n").filter(line => line.includes("记一下")),
    ["- 用户让你“记一下”“记下来”“别忘了”时，选目录里用途和要记的东西相符的能力；用户点名了地方就记在那里，分不清记到哪里时用 ask-user 问。项目里的工作记在当前项目，个人工作或用户说是私事的才放个人空间。"]);
  assert.doesNotMatch(layers.base, /待办|日程|日历|笔记|灵感/, "no table of kinds: the directory says what each capability is for");
  const once = (text: string, layer: keyof typeof layers) => {
    for (const [name, words] of Object.entries(layers)) assert.equal(words.includes(text), name === layer, `${text}: ${name}`);
  };
  once("用户撤销过的修改，除非用户再次要求，不再做。", "base");
  once("「可用的方法」里有适合这件事的方法时，先读取它的步骤再照着做，并告诉用户用了哪个方法；不适合就不用。", "base");
  once("这项工作的对象已不存在或被移走时，先告诉用户它的现状；除非用户明确要求，不在这里重新创建，也不按旧内容改写。", "base");
  once("用户收回的子任务由这项工作接着做完（可以读取它们已产出的对象），不再委托出去，也不再对它们追加要求。", "work");
  once("「允许记住」关着时，用户要你以后照做的，在这项工作里照做，并告诉用户没有长期记下、在哪里可以打开。", "work");
});

test("the two questions of the selection bar are listed under 选区推荐 with their default text, and what the person leaves in them is read back without recording a use", async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-definitions-wording-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const definitions = agentDefinitionsFor(home, builtinRegistrations);
  const next = definitions.prompt(NEXT_KEY), surface = definitions.prompt(SURFACE_KEY);
  for (const view of [next, surface]) {
    assert.deepEqual(view.source, { kind: "system", module: "contextual", title: "选区推荐" });
    assert.equal(view.kind, "instruction");
    assert.equal(view.effective, "default");
    assert.deepEqual(view.used_by, ["选区旁推荐"]);
  }
  assert.equal(next.body, DEFAULT_JUDGMENT_WORDING.next);
  assert.equal(surface.body, DEFAULT_JUDGMENT_WORDING.surface);
  assert.deepEqual([next.title, surface.title], ["选区推荐：下一步", "选区推荐：助手要不要出面"]);

  assert.equal(judgmentWordingRevision(home), "-.-", "the default is in force");
  assert.deepEqual(definitions.uses(NEXT_KEY), [], "reading the revision records no use");
  assert.deepEqual(judgmentWording(home), DEFAULT_JUDGMENT_WORDING);
  assert.equal(definitions.uses(NEXT_KEY).length, 1, "reading the text records one use");
  assert.equal(definitions.uses(NEXT_KEY)[0]!.caller, "contextual.judgment");

  definitions.save(NEXT_KEY, "只看内容。\n\n选一个。", null, "web-user");
  assert.equal(judgmentWordingRevision(home), "1.-");
  assert.equal(definitions.uses(NEXT_KEY).length, 1, "and still none for the revision");
  assert.deepEqual(judgmentWording(home), { next: "只看内容。\n\n选一个。", surface: DEFAULT_JUDGMENT_WORDING.surface });
  assert.equal(definitions.uses(NEXT_KEY).length, 2);
  definitions.save(SURFACE_KEY, "要不要出面？", null, "web-user");
  assert.equal(judgmentWordingRevision(home), "1.1");
  definitions.reset(NEXT_KEY, 1, "web-user");
  assert.equal(judgmentWordingRevision(home), "-.1", "restoring the default clears the person's revision of that question only");
});

// A pane with a page open and a selection in it: the candidates are Pages' own writing choices.
const pagesProvider = { provider_id: "io.molis.work.pages", title: "Pages" } as ActionView["provider"];
const pagesView = (capability_id: string, extra: Partial<ActionView["action"]> = {}): ActionView => ({
  capability_id, version: 1, provider_id: pagesProvider.provider_id, operation: extra.fragment_offer_choices ? "query" : "command", provider: pagesProvider, availability: { available: true },
  action: { title: capability_id, description: capability_id, kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: ["doc"], input_schema: { type: "object" }, ...extra } as ActionView["action"],
});
const selection = (): SurfaceFocus => ({ context_id: "ctx-wording", plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "range",
  object: { kind: "pages_document", id: "d1", version: 3, title: "计划" }, targets: [{ kind: "text_range", role: "paragraph", text: "我们认为主因是上手困难。" }] });

const FROZEN_FIRST = "先看内容本身是什么：观点或判断（需要检验或推敲）、事实或数据（可以作为依据）、计划或步骤（需要落地跟踪）、风险、进展、用户原话、结论、术语，或者是正在写的草稿。";
const FROZEN_SECOND = "再结合所在位置和当前目标，从选项里选出他此刻最可能要做的一件事。不要只看选区的长短。";
const instructionsOf = (questions: Record<string, unknown>, which: "next" | "surface") => (questions[which] as { instructions: string }).instructions;

test("over HTTP: what the person saved in 设置 › 提示词 for the selection bar is what Jev is asked, the default is asked before, and a restored default again", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "contextual-wording-"));
  const previousKey = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "fixture-typesafe-key";
  const views = [pagesView("pages.fragment.offers", { ...pagesActions.fragmentOffers.action }), pagesView("pages.ai")];
  const candidates: readonly ContextualCandidate[] = fragmentCandidates(views, selection());
  const counter = candidates.find(item => item.offer_id === "counter")!;
  const asked: Record<string, unknown>[] = [];
  const unexpected = async (): Promise<never> => { throw new Error("unexpected model call"); };
  const inference: PrologueInferenceClient = { completeText: unexpected, completeTextResult: unexpected, generateImages: unexpected,
    evaluateTypeSafe: async input => { asked.push(input.questions); return { answers: { next: { choice: counter.key, probabilities: { [counter.key]: 0.6 }, confidence: 0.7 }, surface: { choice: "none" } } }; } };
  const unbind = bindPrologueInference(home, inference);
  const actions = { discover: async () => views, invoke: async () => ({ offers: [] }) };
  const server = createServer((request, response) => {
    void handleContextualHttp(request, response, new URL(request.url!, "http://local"), { homeDirectory: home, scope: "wording-home", actor_id: "user", actions: () => actions })
      .then(handled => { if (!handled) { response.statusCode = 404; response.end(); } });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.close(); unbind();
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = previousKey;
    await rm(home, { recursive: true, force: true });
  });
  const judge = async () => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/contextual/judge`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pane_id: "main", focus: selection() }) });
    return { status: response.status, body: await response.json() as { plan: { basis: string }; receipt: unknown } };
  };
  const definitions = agentDefinitionsFor(home, builtinRegistrations);
  const opening = "用户在文档里选中了一段内容，想对它做一件事。";

  const first = await judge();
  assert.equal(first.status, 200);
  assert.equal(first.body.plan.basis, "judgment", JSON.stringify(first.body.receipt));
  assert.equal(instructionsOf(asked[0]!, "next"), opening + FROZEN_FIRST + FROZEN_SECOND, "before any edit the questions read as they always did");
  assert.equal(instructionsOf(asked[0]!, "surface"), DEFAULT_JUDGMENT_WORDING.surface);
  assert.equal(definitions.uses(NEXT_KEY).length, 1, "the question that was really asked records one use");
  await judge();
  assert.equal(asked.length, 1, "the same context is not asked again");
  assert.equal(definitions.uses(NEXT_KEY).length, 1, "and a cached judgment records no use");

  const saved = definitions.save(NEXT_KEY, "只看这段话。\n\n选一个。", null, "web-user");
  definitions.save(SURFACE_KEY, "要不要出面？", null, "web-user");
  const changed = await judge();
  assert.equal(changed.body.plan.basis, "judgment");
  assert.equal(asked.length, 2, "an edit in settings takes effect on the next judgment");
  assert.equal(instructionsOf(asked[1]!, "next"), opening + "只看这段话。选一个。");
  assert.equal(instructionsOf(asked[1]!, "surface"), "要不要出面？");
  assert.equal(definitions.uses(NEXT_KEY).at(0)?.user_revision, saved.user!.revision, "the use says it ran the person's version");

  definitions.reset(NEXT_KEY, saved.user!.revision, "web-user");
  await judge();
  assert.equal(instructionsOf(asked[2]!, "next"), opening + FROZEN_FIRST + FROZEN_SECOND, "restoring the default takes effect too");
});

test("the person's edit is kept apart from the default: saved, conflict-checked, restorable, and flagged when the default moves on", () => {
  let clock = 0;
  const definitions = registry(() => new Date(Date.UTC(2026, 8, 28, 0, 0, clock++)));
  const key = `${ASSISTANT_PLUGIN_ID}/assistant-base`;
  assert.throws(() => definitions.save(key, "   ", null, "web-user"), /不能为空/);
  assert.throws(() => definitions.save(key, "x".repeat(20_001), null, "web-user"), /最长/);
  const saved = definitions.save(key, "只用中文回答。", null, "web-user");
  assert.deepEqual([saved.effective, saved.body, saved.user?.revision, saved.user?.base_version, saved.default_updated], ["user", "只用中文回答。", 1, BASE_VERSION, false]);
  assert.throws(() => definitions.save(key, "改第二次", null, "web-user"), /已在别处修改/, "an edit made against the default cannot overwrite one made since");
  const second = definitions.save(key, "只用中文回答，简短。", 1, "web-user");
  assert.equal(second.user?.revision, 2);

  // The run's text is the person's version, marked so its record can say so; other prompts pass through.
  const effective = definitions.effective(ASSISTANT_PLUGIN_ID, { prompt_id: "assistant-base", version: BASE_VERSION, layer: "base", body: "default" });
  assert.deepEqual([effective.body, effective.user_revision], ["只用中文回答，简短。", 2]);
  assert.deepEqual(definitions.effective("io.molis.work.unknown", { prompt_id: "x", version: 1, body: "as given" }).body, "as given");
  assert.equal(definitions.prompt(key).last_used?.user_revision, 2);

  // A newer default does not replace the person's version; it is flagged for them to look at.
  const [assistant] = builtinAgents();
  definitions.register(agentRegistration(assistant!.owner_id, assistant!.source, { ...assistant!.manifest, prompts: assistant!.manifest.prompts!.map(prompt => prompt.prompt_id === "assistant-base" ? { ...prompt, version: BASE_VERSION + 1 } : prompt) },
    assistant!.prompts.map(prompt => prompt.prompt_id === "assistant-base" ? { ...prompt, version: BASE_VERSION + 1, body: "新的默认" } : prompt)));
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
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user")) }, "web-user");
  try {
    const sent = await service.send({ text: "你好", request_id: "req-00000201" }, {});
    for (let i = 0; i < 400 && (await service.read(sent.work.work_id)).work.state !== "completed"; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(JSON.stringify(requests[0]), /每句话都以「收到」开头/);
    assert.doesNotMatch(JSON.stringify(requests[0]), /你是 Molis Work 的个人工作助理/, "the default text did not run");
    const session = await host.adapter("prologue").readSession({ session_id: store.get("web-user", sent.work.work_id).session_id! });
    const frozen = (session as any).latest_run.frozen.prompts.find((prompt: { prompt_id: string }) => prompt.prompt_id === "assistant-base");
    assert.deepEqual([frozen.version, frozen.user_revision], [BASE_VERSION, 1]);
  } finally { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

// ADH-16: the ending review is a registered prompt of the round's owner: listed for the person, run in their version, frozen with its version.
test("the ending review runs with the person's version of its instructions, and the run's record says which (D1②)", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-definitions-"));
  const requests: { system?: unknown; tools?: unknown }[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    return reply(requests.length === 1 ? "我先查一下有哪些待办。" : '{"last":"answer","changed":"","kept":"","forgot":"","button":""}');
  });
  // The shipped instructions ask for the one JSON line the Host reads back (announce-guard.ts, endingClaims).
  const shipped = ASSISTANT_PROMPTS.find(prompt => prompt.prompt_id === "assistant-ending-review")!;
  for (const name of ["next_step", "changed", "kept", "forgot", "button"]) assert.match(shipped.body, new RegExp(`- ${name}：`));
  const definitions = registry(), key = `${ASSISTANT_PLUGIN_ID}/assistant-ending-review`;
  assert.deepEqual([definitions.prompt(key).title, definitions.prompt(key).used_by], ["收尾核对", ["收尾核对"]], "the person finds it among the prompts");
  definitions.save(key, "测试用的收尾核对：对照事实读这段话，只输出一行 JSON。", null, "web-user");
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue, prompts: definitions });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.definitions-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => store.disabledActions("web-user")) }, "web-user");
  try {
    const sent = await service.send({ text: "看看有哪些待办", request_id: "req-00000202" }, {});
    for (let i = 0; i < 400 && (await service.read(sent.work.work_id)).work.state !== "completed"; i++) await new Promise(resolve => setTimeout(resolve, 20));
    // The round called nothing and ended on what it would do: its ending is checked once, with the person's text.
    const reviews = requests.filter(request => JSON.stringify(request.system ?? "").includes("测试用的收尾核对"));
    assert.equal(reviews.length, 1, JSON.stringify(requests.map(request => request.system)));
    assert.equal(reviews[0].tools, undefined, "the review has no tools");
    assert.ok(!requests.some(request => JSON.stringify(request.system ?? "").includes("你读一段 AI 助理在这一轮结束时")), "the shipped text did not run");
    assert.doesNotMatch(JSON.stringify(requests[0].system), /测试用的收尾核对/, "it is never composed into the round's own role");
    const session = await host.adapter("prologue").readSession({ session_id: store.get("web-user", sent.work.work_id).session_id! });
    assert.deepEqual(session.latest_run?.frozen.ending_review, { prompt_id: "assistant-ending-review", version: 1, user_revision: 1 });
  } finally { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("PMAT-25 PMAT-30 the Assistant's and Coding's base say once when to look in project knowledge, how to search step by step down to the original, and that a card is not the text", () => {
  const assistant = ASSISTANT_PROMPTS.find(prompt => prompt.prompt_id === "assistant-base")!.body;
  const coding = codingPrompts.find(prompt => prompt.prompt_id === "coding-base")!.body;
  for (const [name, body] of Object.entries({ assistant, coding })) {
    for (const title of ["列出项目资料", "查找项目资料", "查看资料结构", "读取资料原文", "在资料里逐行查找"]) assert.ok(body.includes(`「${title}」`), `${name}: ${title}`);
    assert.match(body, /卡片[^。]*(只用来找|只是指路)/u, `${name}: a card points the way`);
    assert.match(body, /原文/u);
    assert.match(body, /行号/u, `${name}: a line found leads to where reading starts`);
  }
  for (const id of ["assistant-work", "assistant-delegated"]) assert.doesNotMatch(ASSISTANT_PROMPTS.find(prompt => prompt.prompt_id === id)!.body, /项目资料/u, "said once, in the base");
});
