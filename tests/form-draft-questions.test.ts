import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ActionExecutionContext, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FormRecord } from "@molis-ai/molis-work-plugin-form/contract";
import type { AgentQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { formActions, createFormActionHandlers, ownFormStores } from "@molis-ai/molis-work-plugin-form";
import { openFormStore } from "./fixtures/plugin-home-stores.js";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";

// specs/ai-interaction-experience S1 (AC-26): 「AI 生成题目」 first asks what it needs to know when the request does not say,
// keeps those questions, checks the person's answer against them, and drafts with the answer; a call that went wrong writes nothing.
// AC-09: Forms is not an Agent; these are its structured way of going on from the person's answer.

const ASK = { status: "needs_input", why: "先确认问卷给谁填、要几题", questions: [
  { id: "audience", prompt: "给谁填？", options: [{ label: "内部同事", description: "可以用内部说法", recommended: true }, { label: "外部客户" }], allow_other: true },
  { id: "size", prompt: "要几题？", options: [{ label: "3 题" }, { label: "5 题" }] },
] };
const DONE = { status: "done", questions: [
  { title: "你最常用的工具是什么？", type: "text" },
  { title: "你对内部试用满意吗？", type: "singleChoice", options: ["满意", "一般", "不满意"], required: true },
  { title: "给内部试用打分", type: "rating" },
] };

/** Either reply, read without narrowing: each test knows which one it expects. */
type Drafted = { status: string; interaction: { interaction_id: string; why: string; questions: AgentQuestion[] }; form: FormRecord };

async function fixture(t: import("node:test").TestContext, replies: unknown[]) {
  const home = await mkdtemp(join(tmpdir(), "form-draft-"));
  const forms = openFormStore(home);
  t.after(async () => { forms.close(); await rm(home, { recursive: true, force: true }); });
  const heard: string[] = [];
  const handlers: ActionHandlerBinding[] = createFormActionHandlers({ ...ownFormStores(run => run(forms)), modelAvailability: () => ({ available: true }),
    completeText: async prompt => { heard.push(JSON.stringify(prompt)); const next = replies.shift(); return typeof next === "string" ? next : JSON.stringify(next); } });
  const draft = handlers.find(handler => handler.capability_id === formActions.draft.capability_id)!;
  const caller: ActionExecutionContext = { actor_id: "web-user", project_id: "p", audience: "user", permissions: [], beforeEffect: async () => {} };
  const form = forms.create({ project_id: "p", title: "试用反馈" });
  return { forms, form, heard, call: (input: Record<string, unknown>) => draft.handle(caller, { id: form.id, prompt: "做一份试用反馈问卷", ...input }) as Promise<Drafted> };
}

test("AC-09 AC-26 a request that does not say enough is asked about first, in questions the shared card draws", async t => {
  const f = await fixture(t, [ASK]);
  const asked = await f.call({});
  assert.equal(asked.status, "needs_input");
  assert.match(asked.interaction.interaction_id, /^draft-/);
  assert.equal(asked.interaction.why, "先确认问卷给谁填、要几题");
  assert.deepEqual(asked.interaction.questions.map((question: { index: number; type: string; required: boolean }) => [question.index, question.type, question.required]), [[0, "choice", true], [1, "choice", true]]);
  assert.deepEqual(asked.interaction.questions[0].options[0], { index: 0, label: "内部同事", description: "可以用内部说法", recommended: true });
  assert.equal(f.forms.get(f.form.id, "p").questions.length, 0, "asking writes nothing");
});

test("AC-09 AC-26 the answer is checked against the questions asked, each field on its own, and then drafting goes on with it", async t => {
  const f = await fixture(t, [ASK, DONE]);
  const { interaction } = await f.call({});
  await assert.rejects(f.call({ interaction: { interaction_id: interaction.interaction_id, values: { q0: { picked: ["0"] }, q1: [] } } }), (error: { code?: string; details?: { problems?: unknown } }) =>
    error.code === "form.answer_invalid" && JSON.stringify(error.details?.problems) === JSON.stringify([{ question: 1, id: "size", reason: "required" }]));
  assert.equal(f.heard.length, 1, "a refused answer does not call the model");
  const done = await f.call({ interaction: { interaction_id: interaction.interaction_id, values: { q0: { picked: [], other: "合作伙伴" }, q1: ["1"] } } });
  assert.equal(done.status, "done");
  assert.deepEqual(done.form.questions.map((question: { title: string; type: string }) => [question.type, question.title]),
    [["text", "你最常用的工具是什么？"], ["singleChoice", "你对内部试用满意吗？"], ["rating", "给内部试用打分"]]);
  assert.match(f.heard[1]!, /合作伙伴/); assert.match(f.heard[1]!, /5 题/); assert.match(f.heard[1]!, /做一份试用反馈问卷/, "the original request goes on with the answer");
  await assert.rejects(f.call({ interaction: { interaction_id: interaction.interaction_id, values: { q0: ["0"], q1: ["0"] } } }), (error: { code?: string }) => error.code === "form.invalid",
    "an answered question set is used once");
});

test("AC-26 a form changed while the person answered is asked about afresh, and a made-up interaction is refused", async t => {
  const f = await fixture(t, [ASK]);
  const { interaction } = await f.call({});
  f.forms.update(f.form.id, { title: "试用反馈（改）", expected_version: f.form.version }, "p");
  await assert.rejects(f.call({ interaction: { interaction_id: interaction.interaction_id, values: { q0: ["0"], q1: ["0"] } } }), (error: { code?: string }) => error.code === "form.conflict");
  await assert.rejects(f.call({ interaction: { interaction_id: "draft-made-up", values: {} } }), (error: { code?: string }) => error.code === "form.invalid");
  assert.equal(f.heard.length, 1);
});

test("AC-26 the model is asked once: after an answer it must draft, and a reply Form cannot hold writes nothing", async t => {
  const again = await fixture(t, [ASK, ASK]);
  const { interaction } = await again.call({});
  await assert.rejects(again.call({ interaction: { interaction_id: interaction.interaction_id, values: { q0: ["0"], q1: ["0"] } } }), /仍没有拟出题目/);
  for (const reply of ["随便写的文字", { status: "done", questions: [{ title: "选一个", type: "singleChoice", options: ["只有一个"] }] },
    { status: "needs_input", questions: [{ prompt: "问什么？", options: [] }] }, { status: "maybe" }]) {
    const f = await fixture(t, [reply]);
    await assert.rejects(f.call({}), (error: { code?: string }) => error.code === "form.invalid", JSON.stringify(reply));
    assert.equal(f.forms.get(f.form.id, "p").questions.length, 0);
  }
});

test("LOGIC-05 questions the form cannot store leave the answers in place, so the same card can be sent again", async t => {
  const bad = { status: "done", questions: [{ title: "选一个", type: "singleChoice", options: ["只有一个"] }] };
  const f = await fixture(t, [ASK, bad, DONE]);
  const { interaction } = await f.call({});
  const values = { q0: ["0"], q1: ["0"] };
  await assert.rejects(f.call({ interaction: { interaction_id: interaction.interaction_id, values } }), (error: { code?: string }) => error.code === "form.invalid");
  const done = await f.call({ interaction: { interaction_id: interaction.interaction_id, values } });
  assert.equal(done.status, "done");
  assert.equal(done.form.questions.length, 3);
});

test("LOGIC-05 a failed save keeps the answers until the questions are actually stored", async t => {
  const home = await mkdtemp(join(tmpdir(), "form-draft-"));
  const forms = openFormStore(home);
  t.after(async () => { forms.close(); await rm(home, { recursive: true, force: true }); });
  const replies = [ASK, DONE, DONE];
  let failWrite = true;
  const stores = ownFormStores(run => run(forms));
  const handlers: ActionHandlerBinding[] = createFormActionHandlers({ ...stores, modelAvailability: () => ({ available: true }),
    write: async (caller, run) => { if (failWrite) { failWrite = false; throw new Error("落库失败"); } return stores.write(caller, run); },
    completeText: async () => JSON.stringify(replies.shift()) });
  const draft = handlers.find(handler => handler.capability_id === formActions.draft.capability_id)!;
  const caller: ActionExecutionContext = { actor_id: "web-user", project_id: "p", audience: "user", permissions: [], beforeEffect: async () => {} };
  const form = forms.create({ project_id: "p", title: "试用反馈" });
  const call = (input: Record<string, unknown>) => draft.handle(caller, { id: form.id, prompt: "做一份试用反馈问卷", ...input }) as Promise<Drafted>;
  const { interaction } = await call({});
  const values = { q0: ["0"], q1: ["0"] };
  await assert.rejects(call({ interaction: { interaction_id: interaction.interaction_id, values } }), /落库失败/);
  const done = await call({ interaction: { interaction_id: interaction.interaction_id, values } });
  assert.equal(done.status, "done");
  assert.equal(forms.get(form.id, "p").questions.length, 3);
});

test("AC-26 「AI 生成题目」 is a well-formed metered model action that waits for the model off the project's queue", () => {
  assert.deepEqual(inspectActionDeclarations([formActions.draft], undefined), []);
  assert.equal(formActions.draft.action.scheduling, "concurrent");
  assert.ok(formActions.draft.action.permissions.includes("model:invoke"));
});
test("RAC-1667 a drafting request is counted in Unicode characters like the action schema: 500 go to the model whole, 501 are refused before it is asked", async t => {
  // FORM_DRAFT_INPUT_SCHEMA (src/drafting.ts) counts characters; one 🟢 is one character but two UTF-16 units.
  const wide = (count: number) => "🟢".repeat(count);
  const f = await fixture(t, [DONE, DONE]);
  const done = await f.call({ prompt: wide(500) });
  assert.equal(done.status, "done", "a 500-character request is drafted");
  assert.equal(done.form.questions.length, 3);
  assert.equal(f.heard.length, 1);
  assert.equal(JSON.parse(JSON.parse(f.heard[0]!).data).request, wide(500), "the request goes to the model whole");
  await assert.rejects(f.call({ prompt: wide(501) }), { code: "form.invalid", message: "生成要求须为 1 到 500 个字" }, "501 characters is still past the limit");
  assert.equal(f.heard.length, 1, "the refused request did not reach the model");
  assert.equal(f.forms.get(f.form.id, "p").questions.length, 3, "and wrote nothing");
});
