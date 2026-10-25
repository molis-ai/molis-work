import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { agentQuestionHtml, hostQuestionTypes, hostReferenceKinds, questionErrors } from "@molis-ai/molis-work-app-local-host";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type ReferenceKindCandidate, type ReferenceKindsFor } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import type { AgentPendingQuestion, AgentQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { questionAnswer } from "@molis-ai/molis-work-plugin-sdk";

// specs/ai-interaction-experience T2 (AC-28): a reference question names kinds; the person finds objects by name and picks.

const say = (text: string, values?: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values && key in values ? String(values[key]) : whole);
const reference = (overrides: Partial<AgentQuestion>): AgentQuestion => ({ index: 0, prompt: "关联的 Goal", type: "reference", required: true, options: [], multiple: false,
  allow_other: false, ref_kinds: ["goal"], ...overrides });
const card = (questions: AgentQuestion[]): AgentPendingQuestion => ({ pending_id: "p1", kind: "questionnaire", prompt: "约复盘会", options: [], allows_free_text: false, questions });

test("AC-28-2: a reference question is drawn as a search of its own kinds, listing no candidates", () => {
  const html = agentQuestionHtml(card([reference({}), reference({ index: 1, prompt: "参考资料", ref_kinds: ["cognia_material", "shelf_item"], multiple: true, max_count: 3 })]), say);
  assert.match(html, /data-ix-field="r0"[\s\S]*?data-ix-references data-ix-ref-source="goal" data-ix-ref-max="1"/, "one object by default");
  assert.match(html, /data-ix-field="r1"[\s\S]*?data-ix-ref-source="cognia_material,shelf_item" data-ix-multiple data-ix-ref-max="3"/, "the search asks for exactly the question's kinds");
  assert.match(html, /placeholder="输入名称搜索"/);
  assert.match(html, /data-ix-ref-labels="[^"]*&quot;found&quot;:&quot;\{n\} 个结果&quot;/, "the count's placeholder is left for the client to fill");
  assert.doesNotMatch(html, /data-ix-ref-option/, "drawing the card searches nothing: candidates come only while the person types");
});

test("AC-28-3: a drafted pick is drawn again as a chip; the label is the person's draft only", () => {
  const html = agentQuestionHtml(card([reference({ multiple: true })]), say, { r0: [{ value: "goal g1", label: "内部试用 <上线>" }] });
  assert.match(html, /<li class="mw-ix-chip" data-ix-reference="goal g1"><span>内部试用 &lt;上线&gt;<\/span>/);
  assert.match(html, /aria-label="去掉 内部试用 &lt;上线&gt;"/);
});

test("AC-28-3: the card's picks read back as objects; an empty optional pick is nothing picked", () => {
  const read = questionAnswer({ r0: [{ value: "goal g1", label: "内部试用" }, { value: "page a b", label: "x".repeat(300) }], r1: [] });
  assert.ok(read && "answers" in read);
  assert.deepEqual(read.answers[0], { question: 0, value: [{ kind: "goal", id: "g1", label: "内部试用" }, { kind: "page", id: "a b", label: "x".repeat(200) }] },
    "split at the first space (a kind has none), the page's label kept short: the Host replaces it with the owner's");
  assert.deepEqual(read.answers[1], { question: 1, value: [] });
});

test("AC-28-3: a refused pick is worded on its own field, with the cap when there is one", () => {
  const questions = [reference({ multiple: true, max_count: 2 }), reference({ index: 1 })];
  assert.deepEqual(questionErrors([{ question: 0, reason: "too-many" }, { question: 1, reason: "kind-not-allowed" }], say, questions),
    { r0: "最多选 2 个", r1: "选的对象不是这一题要的那一类" });
  assert.deepEqual(questionErrors([{ question: 1, reason: "reference-unavailable" }, { question: 0, reason: "required" }], say, questions),
    { r1: "选的对象已不存在或现在不能用，请重新选择", r0: "这一题需要回答" });
});

// BL-152 (S-32): each round asks its own project which kinds it offers, external plugins included, in a fixed order; without
// that list the Runtime's built-in one stands, and the round's subagents keep the round's.
type Tool = { name: string; input_schema: { properties: { questions: { items: { properties: Record<string, { items?: { enum?: string[] } }> } } } } };
type Body = { tools?: Tool[]; messages?: unknown; system?: unknown };
const enumOf = (body: Body | undefined) => body?.tools?.find(tool => tool.name === "ask-user")?.input_schema.properties.questions.items.properties.refKinds?.items?.enum;
const external = (kind: string, title: string, plugin_id = "io.example.notes"): ReferenceKindCandidate => ({ plugin_id, installation: plugin_id, kind, title });
const owner = { project_id: "questions", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
const helper = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };

async function rounds(t: TestContext, referenceKindsFor: ReferenceKindsFor | undefined, reply: (body: Body, index: number) => Response, count = 1) {
  const home = await mkdtemp(join(tmpdir(), "agent-reference-kinds-"));
  const bodies: Body[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(await new Request(input, init).text()) as Body;
    bodies.push(body);
    return reply(body, bodies.length - 1);
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.reference-kinds-rounds", appVersion: "1.0.0" },
    storageRoot: join(home, "sdk"), questionTypes: hostQuestionTypes(), referenceKinds: hostReferenceKinds(), reviewQueue: new AgentReviewQueue(),
    ...(referenceKindsFor ? { referenceKindsFor } : {}),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only",
  });
  t.after(async () => { await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const handles = [];
  for (let n = 0; n < count; n++) {
    const session = await adapter.createSession({ ...owner, workspace: "business", title: `Round ${n}` });
    const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role: helper, task: "把复盘挂到笔记下" });
    for (const deadline = Date.now() + 20_000; bodies.length <= n;) { assert.ok(Date.now() < deadline, "the model was not called"); await new Promise(resolve => setTimeout(resolve, 10)); }
    handles.push(handle);
  }
  return { adapter, bodies, handles };
}

test("BL-152: an external plugin's kind can be asked for, and the person gets that question", { timeout: 30_000 }, async t => {
  const asked = { why: "挂到哪里", questions: [{ id: "where", type: "reference", prompt: "放在哪条笔记下", refKinds: ["x_note"] }] };
  const { adapter, bodies, handles } = await rounds(t, async () => [external("x_note", "笔记")], (_body, index) => index === 0 ? cogniaScriptedResponse({ name: "ask-user", input: asked }) : cogniaModelResponse("好"));
  assert.deepEqual(enumOf(bodies[0]), ["x_note"], "the schema is the round's own list");
  assert.ok(enumOf(bodies[0])!.includes("x_note"), "the external kind is in the schema");
  let pending;
  for (const deadline = Date.now() + 20_000; !(pending = (await adapter.read(handles[0]!.ref)).awaiting_input.find(item => item.answerable));) {
    assert.ok(Date.now() < deadline, "the question did not reach the person"); await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.deepEqual(pending.questions?.[0]?.ref_kinds, ["x_note"]);
});

test("BL-152: two rounds in one project see the same kinds in the same order, however the Host lists them", { timeout: 30_000 }, async t => {
  const listed = [external("x_note", "笔记"), external("x_card", "卡片", "io.example.cards"), external("goal", "目标", "io.molis.work.goals"), external("x_board", "看板")];
  let calls = 0;
  const { bodies } = await rounds(t, async () => (calls++ % 2 ? [...listed].reverse() : listed), () => cogniaModelResponse("好"), 2);
  assert.deepEqual(enumOf(bodies[0]), ["x_card", "x_board", "x_note", "goal"], "by plugin id and kind, built-in or not (PG-015)");
  assert.deepEqual(enumOf(bodies[1]), enumOf(bodies[0]), "the tool schema does not change between rounds, so the prompt cache holds");
});

test("BL-152: without the Host's port, or with nothing from it, the round keeps the Runtime's built-in kinds", { timeout: 60_000 }, async t => {
  const builtin = hostReferenceKinds().map(entry => entry.kind);
  for (const port of [undefined, async () => [], async () => { throw new Error("目录读不了"); }, async () => [external("Bad Kind", "坏")]] as const) {
    await t.test(String(port ?? "no port"), async t => {
      const { bodies } = await rounds(t, port, () => cogniaModelResponse("好"));
      assert.deepEqual(enumOf(bodies[0]), builtin);
    });
  }
});

// The SDK hands a round's own kinds to the subagents it dispatches (Prologue's surfaces.js, "子任务…同一份"). A Molis child role
// cannot hold ask-user at all (childSetup in prologue-run.ts allows reads, writes and commands only), so no question in the
// round can name a kind outside the round's list; this pins both halves.
test("BL-152: the round's kinds are the only ones a question in it may name; a subagent it dispatches cannot ask the person", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "reference-kinds-child-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bodies: Body[] = [];
  const opening = (message: { role?: string; content?: unknown }) => typeof message.content === "string" ? message.content
    : (message.content as Array<{ text?: string }> | undefined ?? []).map(block => block.text ?? "").join("");
  let parent = 0, parentKinds: string[] | undefined;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(await new Request(input, init).text()) as Body & { messages: Array<{ role?: string; content?: unknown }> };
    if (body.messages.some(message => message.role === "user" && opening(message).startsWith("CHILD_ASKS"))) { bodies.push(body); return cogniaModelResponse("问完了"); }
    parent++;
    if (parent === 1) parentKinds = enumOf(body);
    if (parent === 1) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@4/)?.[0]; assert.ok(character, "the coordinator can dispatch a child");
      return cogniaScriptedResponse({ name: "dispatch-subagent", input: { instruction: "CHILD_ASKS which note to use.", tools: ["read", "ask-user"], character, idempotencyKey: "kinds-child" } });
    }
    const ref = JSON.stringify(body.messages).match(/sub-[a-z0-9-]+/)?.[0];
    return parent === 2 && ref ? cogniaScriptedResponse({ name: "await-subagents", input: { refs: [ref], mode: "all", timeoutMs: 0 } }) : cogniaModelResponse("好");
  });
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.reference-kinds-child", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    questionTypes: hostQuestionTypes(), referenceKinds: hostReferenceKinds(), referenceKindsFor: async () => [external("x_note", "笔记")],
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  t.after(() => adapter.close());
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  const coding = { project_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const session = await adapter.createSession({ ...coding, directory, title: "Parent" });
  const handle = await host.start("prologue", { ...coding, session, directory, role_id: "coordinator", task: "Delegate one question." },
    { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] });
  const decided = new Set<string>();
  for (const deadline = Date.now() + 40_000; !bodies.length && !["completed", "failed", "cancelled"].includes((await adapter.read(handle.ref)).phase);) {
    assert.ok(Date.now() < deadline, "the child was not called");
    for (const review of queue.list("b", "pending")) if (!decided.has(review.review_id)) { decided.add(review.review_id); await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" }); }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(bodies.length, "the child reached the model");
  assert.deepEqual(parentKinds, ["x_note"], "the dispatching round asks with its project's kinds");
  assert.ok(!bodies[0]!.tools?.some(tool => tool.name === "ask-user"), "the child holds no ask-user, though the dispatch asked for it");
});
