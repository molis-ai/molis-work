import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentQuestionHtml, hostQuestionTypes, hostReferenceKinds, questionErrors } from "@molis-ai/molis-work-app-local-host";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentPendingQuestion, AgentQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { questionAnswer } from "@molis-ai/molis-work-plugin-sdk";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

// specs/ai-interaction-experience T1 (AC-27): words, numbers, dates and a date and time are offered once both surfaces draw them.

const say = (text: string, values?: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values?.[key] ?? ""));
const ASKED = { why: "约下周的复盘会", questions: [
  { id: "title", type: "text", prompt: "会议标题" },
  { id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" },
  { id: "due", type: "date", prompt: "截止日期", required: false },
  { id: "at", type: "datetime", prompt: "开会时间", min: "2026-10-19T09:00+08:00" },
] };

type Tool = { name: string; input_schema: { properties: { questions: { items: { properties: Record<string, { enum?: string[] }> } } } } };

test("AC-27-1 AC-27-3 AC-27-5 AC-27-6: the model is offered the six types, and the card's values reach the run as the Runtime checks them", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-question-types-"));
  const bodies: Array<{ tools?: Tool[]; messages?: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(await new Request(input, init).text()) as { tools?: Tool[]; messages?: unknown };
    bodies.push(body);
    return bodies.length === 1 ? cogniaScriptedResponse({ name: "ask-user", input: ASKED }) : cogniaModelResponse("复盘会已安排。");
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.question-types-test", appVersion: "1.0.0" },
    storageRoot: join(home, "sdk"), questionTypes: hostQuestionTypes(), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only",
  });
  t.after(async () => { await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const owner = { project_id: "questions", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Questions" });
  const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };
  const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role, task: "约复盘会" });
  const deadline = Date.now() + 20_000;
  let pending: AgentPendingQuestion | undefined;
  while (!(pending = (await adapter.read(handle.ref)).awaiting_input.find(item => item.answerable && item.kind === "questionnaire"))) {
    assert.ok(Date.now() < deadline, "the SDK did not reach the questionnaire wait");
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // What the provider really receives: the six types the surfaces draw, with their limits.
  const fields = bodies[0]!.tools!.find(tool => tool.name === "ask-user")!.input_schema.properties.questions.items.properties;
  assert.deepEqual(hostQuestionTypes(), ["choice", "text", "number", "date", "datetime", "reference"]);
  assert.deepEqual(fields.type!.enum, ["choice", "text", "number", "date", "datetime", "reference"], "the tool's own schema names the types");
  for (const name of ["default", "multiline", "maxLength", "min", "max", "integer", "unit", "refKinds", "maxCount"]) assert.ok(fields[name], `the schema carries ${name}`);
  const questions = pending.questions!;
  assert.deepEqual(questions.map(item => [item.index, item.type]), [[0, "text"], [1, "number"], [2, "date"], [3, "datetime"]]);
  assert.equal(questions[1]!.unit, "分钟", "AC-27-6: the run holds the number's unit as the model wrote it");

  const send = (values: Record<string, unknown>) => {
    const answer = questionAnswer(values);
    assert.ok(answer && "answers" in answer);
    return adapter.control(handle.ref, { kind: "answer", pending_id: pending!.pending_id, pending_revision: pending!.pending_revision, answers: answer.answers });
  };
  const refused = async (values: Record<string, unknown>) => {
    let problems: unknown;
    await assert.rejects(send(values), (error: unknown) => {
      assert.ok(error instanceof ActionError); assert.equal(error.code, "agent.answer_invalid");
      problems = (error as ActionError & { problems?: unknown }).problems;
      return true;
    });
    return problems as Parameters<typeof questionErrors>[0];
  };
  const good = { t0: "Q4 发布复盘", n1: "45", d2: "", w3: { date: "2026-10-23", time: "15:00" } };
  // The field name only says how a value is read: a number sent under a text field's name is still the Runtime's to judge.
  const { n1, ...renamed } = good;
  assert.deepEqual(await refused({ ...renamed, t1: n1 }), [{ question: 1, id: "minutes", reason: "not-a-number" }], "a number question sent as text is refused, not taken");
  // A value past its limit is refused on its own question, and the line beside it names the limit.
  const over = await refused({ ...good, n1: "240", w3: { date: "2026-10-18", time: "09:00" } });
  assert.deepEqual(over.map(problem => [problem.question, problem.reason]), [[1, "too-large"], [3, "too-early"]]);
  assert.deepEqual(questionErrors(over, say, questions), { n1: "不能超过 120 分钟", w3: `不能早于 ${localStamp("2026-10-19T09:00+08:00")}` });
  assert.equal((await adapter.read(handle.ref)).phase, "awaiting-input", "a refused answer leaves the question open");
  assert.equal(bodies.length, 1);

  await send(good);
  while (!["completed", "failed", "stopped", "cancelled"].includes((await adapter.read(handle.ref)).phase)) {
    assert.ok(Date.now() < deadline, "the run did not go on after the answer");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await adapter.read(handle.ref)).phase, "completed");
  const told = JSON.stringify(bodies[1]!.messages);
  for (const part of ["Q4 发布复盘", "45", "2026-10-23T15:00"]) assert.ok(told.includes(part), `the run went on with ${part}`);
});

const two = (part: number) => String(part).padStart(2, "0");
/** A moment's time of day on this computer, as the card shows it. */
function localTime(moment: string): string {
  const at = new Date(moment);
  return `${two(at.getHours())}:${two(at.getMinutes())}`;
}
/** A moment as this computer's date and time, as an error line names it. */
function localStamp(moment: string): string {
  const at = new Date(moment);
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${localTime(moment)}`;
}

test("AC-27-3: the card's fields read back by what they answer; a date and time carries this computer's offset", () => {
  const read = questionAnswer({ q0: ["1"], t1: "  标题 ", n2: "4.5", d3: "2026-10-30", w4: { date: "2026-10-23", time: "15:00" }, t5: "", n6: "四十五", w7: { date: "2026-10-23", time: "" } });
  assert.ok(read && "answers" in read);
  const [choice, text, number, date, moment, empty, words, half] = read.answers;
  assert.deepEqual([choice, text, number, date, empty, words, half], [{ question: 0, indexes: [1] }, { question: 1, value: "标题" }, { question: 2, value: 4.5 },
    { question: 3, value: "2026-10-30" }, { question: 5, value: null }, { question: 6, value: "四十五" }, { question: 7, value: "2026-10-23T" }]);
  assert.ok("value" in moment! && typeof moment.value === "string");
  assert.match(moment.value, /^2026-10-23T15:00[+-]\d{2}:\d{2}$/);
  assert.equal(Date.parse(moment.value), new Date(2026, 9, 23, 15, 0).getTime(), "the moment is the one typed, on this computer's clock");
  assert.deepEqual(questionAnswer({ text: " 好 " }), { text: "好" }, "a question in words is unchanged");
});

test("AC-27-2 AC-27-6: the shared card draws words, numbers, dates and a date and time, with the person's draft and no stray weekday", () => {
  const typed = (overrides: Partial<AgentQuestion>): AgentQuestion => ({ index: 0, prompt: "?", type: "text", required: true, options: [], multiple: false, allow_other: false, ...overrides });
  const question: AgentPendingQuestion = { pending_id: "p1", kind: "questionnaire", prompt: "约复盘会", options: [], allows_free_text: false, questions: [
    typed({ index: 0, prompt: "会议标题", multiline: true, max_length: 80 }),
    typed({ index: 1, prompt: "时长", type: "number", min: 15, max: 120, integer: true, default: 45, unit: "分钟" }),
    typed({ index: 2, prompt: "截止日期", type: "date", required: false }),
    typed({ index: 3, prompt: "开会时间", type: "datetime", default: "2026-10-23T15:00+08:00" }),
  ] };
  const html = agentQuestionHtml(question, say, { d2: "2026-10-30" });
  assert.match(html, /<textarea[^>]*maxlength="80"[^>]*data-ix-value="t0"/);
  assert.match(html, /value="45"[^>]*inputmode="numeric"[^>]*data-ix-min="15" data-ix-max="120" data-ix-value="n1"/);
  assert.match(html, /aria-label="减少 1"/);
  // AC-27-6: the unit sits beside the stepper and is read with the field.
  assert.match(html, /aria-describedby="([^"]*-n1-unit) [^"]*-n1-error"[^>]*>[\s\S]*?<span class="mw-ix-unit" id="\1">分钟<\/span>/, "the unit is beside the number and describes it");
  assert.match(html, /value="2026-10-30"[^>]*data-ix-value="d2"[\s\S]*?data-ix-weekday aria-hidden="true">周五</, "the drafted date shows its weekday");
  const blank = agentQuestionHtml(question, say);
  assert.match(blank, /placeholder="YYYY-MM-DD"[^>]*data-ix-value="d2"[\s\S]*?data-ix-weekday aria-hidden="true"><\/span>/, "an empty date shows its format and no weekday");
  const when = localTime("2026-10-23T15:00+08:00");
  assert.match(blank, new RegExp(`value="${when}"[^>]*data-ix-part="time"`), "a default moment is shown on this computer's clock");
  assert.match(blank, /<span class="mw-ix-clock"><input[^>]*mw-ix-time[\s\S]*?<span class="mw-ix-zone">[^<]*UTC[+-]\d/, "the zone sits once, right after the time");
  assert.doesNotMatch(blank, /按你本机时区/);
  assert.deepEqual(questionErrors([{ question: 0, reason: "too-long" }, { question: 2, reason: "bad-date" }, { question: 3, reason: "bad-date" }, { question: 1, reason: "not-an-integer" }], say, question.questions),
    { t0: "不能超过 80 个字", d2: "请按 2026-10-23 这样的格式填日期", w3: "请填日期和时刻，例如 2026-10-23 15:00", n1: "请填整数" });
  assert.deepEqual(questionErrors([{ question: 1, reason: "too-small" }], say, question.questions), { n1: "不能小于 15 分钟" }, "AC-27-6: a limit is named in the question's unit");
  assert.deepEqual(questionErrors([{ question: 1, reason: "too-large" }], say), { q1: "这个数太大了" }, "without the questions, the reason alone");
});

// T2 (AC-28-1): the model is told which kinds of object it may ask for, as an enum of the kinds the Host's plugins list and read
// back, each with its owner's name; a kind outside them is refused before the person is asked (Prologue's askUserReferenceKinds).
test("AC-28-1: the ask-user schema names the Home's readable kinds, and a question asking for another kind never reaches the person", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-reference-kinds-"));
  const bodies: Array<{ tools?: Tool[]; messages?: unknown }> = [];
  const guessed = { why: "挂到哪里", questions: [{ id: "where", type: "reference", prompt: "放在哪份资料下", refKinds: ["material"] }] };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(await new Request(input, init).text()) as { tools?: Tool[]; messages?: unknown };
    bodies.push(body);
    return bodies.length === 1 ? cogniaScriptedResponse({ name: "ask-user", input: guessed }) : cogniaModelResponse("这类对象没有，我换一种问法。");
  });
  const kinds = hostReferenceKinds();
  assert.ok(kinds.some(entry => entry.kind === "goal" && entry.title === "目标") && kinds.some(entry => entry.kind === "cognia_material"), "the kinds come from the plugins' search sources");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.reference-kinds-test", appVersion: "1.0.0" },
    storageRoot: join(home, "sdk"), questionTypes: hostQuestionTypes(), referenceKinds: kinds, reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only",
  });
  t.after(async () => { await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const owner = { project_id: "questions", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Questions" });
  const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };
  const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role, task: "把复盘挂到资料下" });
  const deadline = Date.now() + 20_000;
  while (bodies.length < 2) { assert.ok(Date.now() < deadline, "the model was not told about the refused question"); await new Promise(resolve => setTimeout(resolve, 10)); }
  const fields = bodies[0]!.tools!.find(tool => tool.name === "ask-user")!.input_schema.properties.questions.items.properties as Record<string, { items?: { enum?: string[] } }>;
  assert.deepEqual(fields.refKinds!.items!.enum, kinds.map(entry => entry.kind), "AC-28-1: refKinds is an enum of exactly the Home's kinds");
  assert.equal((await adapter.read(handle.ref)).awaiting_input.length, 0, "a guessed kind never opens a wait the person would see");
  assert.match(JSON.stringify(bodies[1]!.messages), /material/, "the model hears which kind was not one the App has");
});
