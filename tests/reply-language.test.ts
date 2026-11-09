import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { activeLocale, AssistantService, AssistantStore, assistantAuthority, captureHostLog, lastUsedLocale, LOCALE_COOKIE, LocalHost, MolisWorkLocalHost, pageLocale, readUiLocale, rememberUiLocale, replyLanguagePrompt, runBackgroundWork, runWithLocale, UI_LOCALE_RELATIVE_PATH, type HostLogEntry, type WebLocale } from "@molis-ai/molis-work-app-local-host";
import { ASSISTANT_INSTALL_ID, type AssistantSendResult, type AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { answeringEndingReviews } from "./fixtures/ending-review.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { serveTestHost } from "./fixtures/test-home.js";

const EN = replyLanguagePrompt("en").body, ZH = replyLanguagePrompt("zh").body;
const VERSION = replyLanguagePrompt("en").version;

async function until<T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}
const tick = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** `t.after` runs its hooks in the order given; a test closes the other way, so what uses a Home is gone before the Home is. */
function closing(t: TestContext): (step: () => unknown) => void {
  const steps: Array<() => unknown> = [];
  t.after(async () => { for (const step of steps.reverse()) await step(); });
  return step => { steps.push(step); };
}

async function tempHome(defer: ReturnType<typeof closing>): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "molis-reply-language-"));
  defer(() => rm(home, { recursive: true, force: true }));
  return home;
}

function modelReply(text = "好的。", tool?: string): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${randomUUID()}`, name: tool, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: "{}" } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

/** The real Assistant on the real runtime in a temporary Home; only the model is stood in for, so `requests` holds what it was really told. */
async function assistantOn(t: TestContext, answer: (request: { system: unknown; messages: unknown }, count: number) => Response | Promise<Response> = () => modelReply()) {
  const defer = closing(t), home = await tempHome(defer);
  const requests: Array<{ system: unknown; messages: unknown }> = [];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => modelReply(text), async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)) as { system: unknown; messages: unknown };
    requests.push(request);
    return answer(request, requests.length);
  }));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.reply-language-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host, lastLocale: () => lastUsedLocale(home),
    authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目", timeZone: "Asia/Shanghai" }, "web-user");
  defer(async () => { service.continuations.close(); await adapter.close(); await local.close(); });
  const completed = async (workId: string, rounds: number): Promise<AssistantWorkView> =>
    until(async () => { const view = await service.read(workId); return view.rounds.length === rounds && view.work.state === "completed" ? view : undefined; }, `${rounds} finished rounds`);
  const frozen = async (workId: string) => (await adapter.readSession({ session_id: store.get("web-user", workId).session_id! })).latest_run!.frozen;
  return { home, requests, adapter, host, store, service, completed, frozen };
}

const told = (request: { system: unknown } | undefined) => JSON.stringify(request?.system ?? "");
const sayEnglish = JSON.stringify(EN).slice(1, -1), sayChinese = JSON.stringify(ZH).slice(1, -1);

function assertToldOnly(request: { system: unknown } | undefined, locale: WebLocale, what: string): void {
  const [own, other] = locale === "en" ? [sayEnglish, sayChinese] : [sayChinese, sayEnglish];
  assert.ok(told(request).includes(own), `${what}: the model is told to reply in ${locale}`);
  assert.ok(!told(request).includes(other), `${what}: and not the other language`);
}

/**
 * The real Host over real HTTP in a temporary Home, with a model it reaches like any other; each request says which
 * browser it comes from by its language Cookie, so two browsers on different languages are two arguments here.
 */
async function servedHome(t: TestContext, standIn: Parameters<typeof startModelStandIn>[2] = {}) {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const defer = closing(t), home = await tempHome(defer);
  const model = await startModelStandIn("reply-language-key", "OK", standIn);
  defer(() => model.close());
  const open = async () => { const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); return { host, server: await serveTestHost(null, { home, host }) }; };
  let current = await open();
  const shut = async () => { await current.server.close(); await current.host.close(); };
  defer(() => shut());
  const request = (path: string, locale: WebLocale, body?: object) => fetch(current.server.origin + path, {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: { cookie: `${LOCALE_COOKIE}=${locale}`, origin: current.server.origin, "content-type": "application/json", "x-molis-work-control-token": current.server.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
  const saved = await request("/api/settings/models/fixture", "zh", { display_name: "本机模型", base_url: model.baseUrl, api_format: "openai-chat-completions", prompt_cache: "off", enabled: true, api_key: "reply-language-key", models: [{ model_id: "fixture-model", enabled: true }] });
  assert.equal(saved.status, 200, await saved.text());
  const work = async (workId: string, locale: WebLocale) => await (await request(`/api/assistant/works/${workId}`, locale)).json() as AssistantWorkView;
  const send = async (locale: WebLocale, text: string, extra: object = {}) => {
    const sent = await request("/api/assistant/send", locale, { text, request_id: randomUUID(), scope: { kind: "personal" }, ...extra });
    assert.equal(sent.status, 200, "the send is taken");
    return (await sent.json() as AssistantSendResult).work.work_id;
  };
  const finished = (workId: string, locale: WebLocale) => until(async () => (await work(workId, locale)).work.state === "completed", "the round ends");
  /** What the latest model call told it, and what the work's latest round recorded. */
  const lastRound = async (workId: string, locale: WebLocale) => {
    const { rounds } = await (await request("/api/assistant/diagnostics", locale)).json() as { rounds: Array<{ work_id: string; frozen: { prompts: Array<{ prompt_id: string; version: number }> } | null }> };
    return { record: rounds.findLast(item => item.work_id === workId)!.frozen!.prompts, body: JSON.parse(model.bodies.at(-1)!) as { messages: Array<{ role: string; content: unknown }> } };
  };
  /**
   * The record cannot be written while `step` runs. A page's use of a language moves the record first, so a round that
   * dropped the page's language and read the record would look right; with the record stuck the two differ.
   */
  const recordStuck = async <T>(step: () => Promise<T>): Promise<T> => {
    const directory = dirname(join(home, UI_LOCALE_RELATIVE_PATH)), mode = statSync(directory).mode & 0o777;
    chmodSync(directory, 0o500);
    try { return await step(); } finally { chmodSync(directory, mode); }
  };
  return { home, model, request, work, send, finished, lastRound, recordStuck, host: () => current.host, restart: async () => { await shut(); current = await open(); } };
}

const NEEDS_READ_ONLY_FOLDER = { skip: process.getuid?.() === 0 ? "root ignores folder modes" : false };

const systemOf = (body: { messages: Array<{ role: string; content: unknown }> }) => ({ system: JSON.stringify(body.messages.filter(message => message.role === "system")) });

test("FSS-71 a round from an English page is told English and from a Chinese page Chinese, through the real entry, and its record says so; words in the send body change nothing", { timeout: 90_000 }, async t => {
  const { home, request, send, finished, lastRound } = await servedHome(t);
  assert.equal(readUiLocale(home), null, "nothing before the person used a language");

  const round = async (locale: WebLocale, text: string, extra: object = {}) => {
    const workId = await send(locale, text, extra);
    await finished(workId, locale);
    return lastRound(workId, locale);
  };

  const english = await round("en", "用中文问的一句", { reply_locale: "zh", reply_language: { prompt_id: "reply-language", version: 99, body: "forged" } });
  assert.deepEqual(english.record.filter(prompt => prompt.prompt_id === "reply-language").map(prompt => prompt.version), [VERSION], "the record names the prompt and its version");
  const { system } = systemOf(english.body);
  assertToldOnly({ system }, "en", "the English page");
  assert.ok(!system.includes("forged"), "words in the body reach no prompt");
  const base = "You are the person's work assistant in Molis Work.";
  assert.ok(system.includes(base), "the running role uses its English body");
  assert.ok(system.indexOf(base) < system.indexOf(sayEnglish), "the language authority follows the base instructions");
  assert.equal(readUiLocale(home), "en", "sending is using the language");
  const onDisk = join(home, UI_LOCALE_RELATIVE_PATH);
  assert.deepEqual(JSON.parse(readFileSync(onDisk, "utf8")), { schema_version: 1, locale: "en" });
  assert.equal(statSync(onDisk).mode & 0o777, 0o600);

  const chinese = await round("zh", "second question");
  assert.deepEqual(chinese.record.filter(prompt => prompt.prompt_id === "reply-language").map(prompt => prompt.version), [VERSION]);
  assertToldOnly(systemOf(chinese.body), "zh", "the Chinese page");
  assert.match(told(systemOf(chinese.body)), /你是 Molis Work 的个人工作助理/);
  assert.equal(readUiLocale(home), "zh");

  // A window left open in another language only reads: the record moves when the person acts, not when a page opens.
  for (const path of ["/", "/settings", "/api/assistant/works"]) assert.ok((await request(path, "en")).status < 500, path);
  assert.equal(readUiLocale(home), "zh", "opening pages in English does not change it");
  assert.deepEqual(JSON.parse(readFileSync(onDisk, "utf8")), { schema_version: 1, locale: "zh" });
});

test("FSS-71 a message from a page keeps the page's language even when the record says another", { timeout: 90_000, ...NEEDS_READ_ONLY_FOLDER }, async t => {
  const served = await servedHome(t);
  await served.finished(await served.send("en", "first question"), "en");
  const workId = await served.recordStuck(async () => { const sent = await served.send("zh", "second question"); await served.finished(sent, "zh"); return sent; });
  assertToldOnly(systemOf((await served.lastRound(workId, "zh")).body), "zh", "the Chinese page");
  assert.equal(readUiLocale(served.home), "en", "the record could not move, and the round did not read it");
});

test("FSS-71 a card prepared again follows the page that asked, not the record another browser left", { timeout: 90_000, ...NEEDS_READ_ONLY_FOLDER }, async t => {
  const served = await servedHome(t);
  const definition = { capability_id: "fixture.reply-language.note", version: 1, operation: "command" as const, action: {
    title: "Save note", description: "Save a note", kind: "operation" as const, scope: "home" as const, audiences: ["agent" as const], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: {}, additionalProperties: false }, output_schema: { type: "object", properties: {}, additionalProperties: false } } };
  served.host().actionRegistry().registerProvider({ provider: { provider_id: "fixture.reply-language", kind: "plugin", title: "Fixture" }, definitions: [definition], handlers: [{ ...definition, async handle() { return {}; } }] });
  const workId = await served.send("en", "first question");
  await served.finished(workId, "en");
  assert.equal(readUiLocale(served.home), "en", "another browser, in English, used the Assistant last");

  const placed = await served.request("/api/assistant/cards", "en", { message_id: "reply-language-card", work_id: workId, source: { surface: "fixture" },
    card: { title: "Save note", summary: "Save one note", reference: { capability_id: definition.capability_id, version: 1, provider_id: "fixture.reply-language" }, input: {} } });
  assert.equal(placed.status, 200, "the card is placed");
  const { card } = await placed.json() as { card: { card_id: string } };
  const prepareAgain = async () => {
    const rounds = (await served.work(workId, "zh")).rounds.length;
    const redo = await served.request(`/api/assistant/works/${workId}/cards/${card.card_id}/redo`, "zh", {});
    assert.equal(redo.status, 200, "prepared again from a Chinese page");
    await until(async () => { const view = await served.work(workId, "zh"); return view.rounds.length === rounds + 1 && view.work.state === "completed"; }, "the round it started ends");
  };
  await served.recordStuck(prepareAgain);
  const { record, body } = await served.lastRound(workId, "zh");
  assertToldOnly(systemOf(body), "zh", "the page that asked");
  assert.deepEqual(record.filter(prompt => prompt.prompt_id === "reply-language").map(prompt => prompt.version), [VERSION]);
  assert.equal(readUiLocale(served.home), "en", "the record could not move, and the round did not read it");

  await prepareAgain();
  assert.equal(readUiLocale(served.home), "zh", "asking from the page is using its language");
});

test("FSS-71 the round after an answer to a question parked at a restart follows the page that answered, not the record", { timeout: 90_000, ...NEEDS_READ_ONLY_FOLDER }, async t => {
  let ask = true;
  const served = await servedHome(t, { tool: () => { if (!ask) return undefined; ask = false;
    return { name: "ask-user", input: { why: "约复盘会", questions: [{ id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" }] } }; } });
  const workId = await served.send("en", "book a review");
  const asked = await until(async () => (await served.work(workId, "en")).rounds[0]?.awaiting_input[0], "the question");
  const runId = (await served.work(workId, "en")).rounds[0]!.run_id!;
  await served.restart();
  assert.equal(readUiLocale(served.home), "en", "the record is what the question's own round left");
  const calls = served.model.bodies.length;

  await served.recordStuck(async () => {
    const answered = await served.request(`/api/assistant/works/${workId}/answer`, "zh", { run_id: runId, pending_id: asked.pending_id, pending_revision: asked.pending_revision, answers: [{ question: 0, value: 45 }] });
    assert.equal(answered.status, 200, "answered from a Chinese page");
    await until(() => served.model.bodies.length > calls, "the next round's model call");
    await served.finished(workId, "zh");
  });

  const { record, body } = await served.lastRound(workId, "zh");
  assertToldOnly(systemOf(body), "zh", "the page that answered");
  assert.deepEqual(record.filter(prompt => prompt.prompt_id === "reply-language").map(prompt => prompt.version), [VERSION]);
  assert.equal(readUiLocale(served.home), "en", "the record could not move, and the round did not read it");
});

test("FSS-71 a timed round reads the language last used when it starts, not the page that set it up; a change reaches the next time", { timeout: 90_000 }, async t => {
  const a = await assistantOn(t);
  rememberUiLocale(a.home, "en");
  const seen: Array<WebLocale | null> = [];
  const start = a.host.start.bind(a.host);
  a.host.start = (async (...args: Parameters<typeof start>) => { seen.push(activeLocale()); return start(...args); }) as typeof a.host.start;
  // Everything below is set up inside an English page's request, so its async chain carries that language.
  const sent = await runWithLocale("en", async () => {
    assert.equal(await a.service.notices.attachSchedule(), true);
    const result = await a.service.send({ text: "帮我跟进", request_id: "req-timed-1" }, { reply_locale: "en" });
    await a.completed(result.work.work_id, 1);
    await a.service.followUps.save({ work_id: result.work.work_id, text: "汇总", at: new Date(Date.now() + 400).toISOString(), label: "一次" });
    return result;
  });
  assertToldOnly(a.requests[0], "en", "the person's own round");
  assert.deepEqual((await a.frozen(sent.work.work_id)).prompts.filter(prompt => prompt.prompt_id === "reply-language").map(prompt => prompt.version), [VERSION]);

  // The other browser moves before the time comes.
  rememberUiLocale(a.home, "zh");
  await a.completed(sent.work.work_id, 2);
  assertToldOnly(a.requests.at(-1), "zh", "a timed round after the switch");
  assert.equal((await a.frozen(sent.work.work_id)).prompts.at(-1)?.prompt_id, "reply-language", "the last of the composed prompts");
  assert.deepEqual(seen, ["en", "zh"], "the round starts in a scope of the language it reads, with no page's left over");

  rememberUiLocale(a.home, "en");
  await a.service.followUps.save({ work_id: sent.work.work_id, text: "再汇总", at: new Date(Date.now() + 300).toISOString(), label: "又一次" });
  await a.completed(sent.work.work_id, 3);
  assertToldOnly(a.requests.at(-1), "en", "the next time follows the record again");
});

test("FSS-71 a continuation reads the language last used, not the page whose round registered the wait", { timeout: 90_000 }, async t => {
  const a = await assistantOn(t);
  let ready: unknown[] = [];
  t.mock.method(a.adapter.collaboration!, "awaitReady", async () => { const views = ready; ready = []; await tick(20); return views; });
  rememberUiLocale(a.home, "en");
  const text = "帮我等结果";
  const sent = await runWithLocale("en", () => a.service.send({ text, request_id: "req-continue-1" }, { reply_locale: "en", original_input: {
    input_id: "req-continue-1", text, written_by: "person", occurred_at: new Date().toISOString(), install_id: ASSISTANT_INSTALL_ID } }));
  await a.completed(sent.work.work_id, 1);
  rememberUiLocale(a.home, "zh");
  ready = [{ session_id: a.store.get("web-user", sent.work.work_id).session_id, wait: { state: "satisfied", by: "agent", reason: "条件满足", wait_id: "w" }, continuation: { state: "eligible", auto: true, request_key: "k" } }];
  await a.completed(sent.work.work_id, 2);
  assertToldOnly(a.requests[0], "en", "the first round");
  assertToldOnly(a.requests.at(-1), "zh", "the round the Host continued on its own");
});

test("FSS-71 switching language in the middle of a round does not change that round; the next one follows", { timeout: 90_000 }, async t => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const a = await assistantOn(t, async (_request, count) => {
    if (count === 1) { await held; return modelReply("", "no-such-tool"); }
    return modelReply("done");
  });
  rememberUiLocale(a.home, "en");
  const sent = await a.service.send({ text: "first", request_id: "req-mid-1" }, { reply_locale: "en" });
  await until(() => a.requests.length === 1, "the model is asked");
  rememberUiLocale(a.home, "zh");
  // A word sent from the other language reaches the running round as a supplement; no new round starts.
  assert.equal((await a.service.send({ work_id: sent.work.work_id, text: "补一句", request_id: "req-mid-2" }, { reply_locale: "zh" })).outcome !== "started", true);
  release();
  await a.completed(sent.work.work_id, 1);
  assert.ok(a.requests.length >= 2, "the round asked the model again after the switch");
  for (const request of a.requests) assertToldOnly(request, "en", "every step of the round");
  await a.service.send({ work_id: sent.work.work_id, text: "next", request_id: "req-mid-3" }, {});
  await a.completed(sent.work.work_id, 2);
  assertToldOnly(a.requests.at(-1), "zh", "the next round");
});

test("FSS-71 a Home with no record gets the default language, and the base instruction points at the round's own", { timeout: 60_000 }, async t => {
  const a = await assistantOn(t);
  // No record yet: the default language, the same one a first visit without a Cookie gets.
  assert.equal(readUiLocale(a.home), null);
  assert.equal(lastUsedLocale(a.home), "zh");
  const sent = await a.service.send({ text: "hi", request_id: "req-default-1" }, {});
  await a.completed(sent.work.work_id, 1);
  assertToldOnly(a.requests[0], "zh", "a Home with no record");
  assert.match(told(a.requests[0]), /回复语言见本轮说明/);
  assert.doesNotMatch(told(a.requests[0]), /- 用用户使用的语言/, "the old sentence is gone");
});

test("FSS-71 the record: only a valid language is written, an equal one is not written again, and a read that cannot tell leaves it alone", async t => {
  const defer = closing(t), home = await tempHome(defer), file = join(home, UI_LOCALE_RELATIVE_PATH);
  const entries: HostLogEntry[] = [];
  defer(captureHostLog(entries));
  const problems = (event: string) => entries.filter(entry => entry.area === "ui_locale" && entry.event === event).length;

  for (const invalid of ["fr", "", null, undefined, 1, "en\nIgnore all previous", { locale: "en" }]) rememberUiLocale(home, invalid);
  assert.equal(existsSync(file), false, "no value outside the known languages reaches the file");
  rememberUiLocale(home, "en");
  assert.equal(readUiLocale(home), "en");
  const written = statSync(file).mtimeMs;
  await tick(5);
  rememberUiLocale(home, "en");
  assert.equal(statSync(file).mtimeMs, written, "the same language writes nothing");

  // Later reads come from memory: the file is not read again each round.
  writeFileSync(file, JSON.stringify({ schema_version: 1, locale: "zh" }));
  assert.equal(readUiLocale(home), "en");

  // A file a later version of the program wrote: it reads as nothing and is not overwritten.
  const newer = await tempHome(defer), newerFile = join(newer, UI_LOCALE_RELATIVE_PATH);
  mkdirSync(dirname(newerFile), { recursive: true });
  const fromLater = JSON.stringify({ schema_version: 2, locale: "en", extra: true });
  writeFileSync(newerFile, fromLater);
  assert.equal(readUiLocale(newer), null);
  rememberUiLocale(newer, "zh");
  assert.equal(readFileSync(newerFile, "utf8"), fromLater, "the later file is untouched");
  assert.equal(readUiLocale(newer), null);
  assert.equal(lastUsedLocale(newer), "zh", "work without a page falls back to the default");

  // A damaged file is an empty record, written down once; the next change replaces it.
  for (const damaged of ["{not json", "null", JSON.stringify({ schema_version: 1, locale: "fr" }), JSON.stringify({ locale: "en" })]) {
    const broken = await tempHome(defer), brokenFile = join(broken, UI_LOCALE_RELATIVE_PATH), before = problems("read_failed");
    mkdirSync(dirname(brokenFile), { recursive: true });
    writeFileSync(brokenFile, damaged);
    assert.equal(readUiLocale(broken), null, damaged);
    assert.equal(problems("read_failed"), before + 1, `${damaged}: written down`);
    rememberUiLocale(broken, "en");
    assert.deepEqual(JSON.parse(readFileSync(brokenFile, "utf8")), { schema_version: 1, locale: "en" }, damaged);
  }

  // A path that cannot be read at all: nothing, once in the log, not cached, and not written over since it may hold anything.
  const blocked = await tempHome(defer), blockedFile = join(blocked, UI_LOCALE_RELATIVE_PATH), before = problems("read_failed");
  mkdirSync(blockedFile, { recursive: true });
  assert.equal(readUiLocale(blocked), null);
  assert.equal(readUiLocale(blocked), null);
  rememberUiLocale(blocked, "en");
  assert.equal(problems("read_failed"), before + 1, "a problem is written once however often it is met");
  assert.equal(statSync(blockedFile).isDirectory(), true);
  await rm(blockedFile, { recursive: true });
  rememberUiLocale(blocked, "en");
  assert.equal(readUiLocale(blocked), "en", "it tries again once the path can be read");
});

test("FSS-71 a write that fails stays out of memory, gets in nobody's way, is written down once and is tried again", { skip: process.getuid?.() === 0 ? "root ignores directory permissions" : false }, async t => {
  const defer = closing(t), home = await tempHome(defer), file = join(home, UI_LOCALE_RELATIVE_PATH);
  const entries: HostLogEntry[] = [];
  defer(captureHostLog(entries));
  const config = dirname(file);
  mkdirSync(config, { recursive: true });
  chmodSync(config, 0o500);
  defer(() => chmodSync(config, 0o700));
  assert.doesNotThrow(() => rememberUiLocale(home, "en"));
  rememberUiLocale(home, "en");
  assert.equal(readUiLocale(home), null, "memory moves only with the file");
  assert.equal(entries.filter(entry => entry.area === "ui_locale" && entry.event === "write_failed").length, 1);
  chmodSync(config, 0o700);
  rememberUiLocale(home, "en");
  assert.equal(readUiLocale(home), "en");
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { schema_version: 1, locale: "en" });
});

test("FSS-69 a language scope ends with the function that opened it: a timer started inside reads nothing afterwards, nested or not", async () => {
  const later = () => new Promise<WebLocale | null>(resolve => setTimeout(() => resolve(activeLocale()), 10));
  assert.equal(activeLocale(), null, "outside any scope");

  // A request: async, then a timer that outlives it.
  let timer!: Promise<WebLocale | null>;
  await runWithLocale("en", async () => { assert.equal(activeLocale(), "en"); await tick(1); assert.equal(activeLocale(), "en", "across an await"); timer = later(); });
  assert.equal(await timer, null, "the request is over");

  // A function that returns at once ends at once, thrown or not.
  let sync!: Promise<WebLocale | null>;
  assert.equal(runWithLocale("en", () => { sync = later(); return activeLocale(); }), "en");
  assert.equal(await sync, null);
  let thrown!: Promise<WebLocale | null>;
  assert.throws(() => runWithLocale("en", () => { thrown = later(); throw new Error("x"); }), /x/);
  assert.equal(await thrown, null);
  let rejected!: Promise<WebLocale | null>;
  await assert.rejects(runWithLocale("en", async () => { rejected = later(); throw new Error("y"); }), /y/);
  assert.equal(await rejected, null);

  // Background work, the same.
  let background!: Promise<WebLocale | null>;
  await runBackgroundWork("zh", async () => { assert.equal(activeLocale(), "zh"); background = later(); });
  assert.equal(await background, null);

  // Nested in a request: the inner language inside, and a timer of the inner scope does not fall back on the outer one.
  await runWithLocale("en", async () => {
    let inner!: Promise<WebLocale | null>;
    await runBackgroundWork("zh", async () => { assert.equal(activeLocale(), "zh"); inner = later(); });
    assert.equal(activeLocale(), "en", "the outer scope goes on");
    assert.equal(await inner, null, "the inner one is over");
    let nested!: Promise<WebLocale | null>;
    await runWithLocale("zh", async () => { nested = later(); });
    assert.equal(await nested, null);
  });

  // Concurrent requests do not mix.
  const seen = await Promise.all((["en", "zh", "en", "zh"] as const).map(locale => runWithLocale(locale, async () => { await tick(5); return activeLocale() === locale; })));
  assert.deepEqual(seen, [true, true, true, true]);
});

test("FSS-69 page provenance remains distinct from the live language scope", async () => {
  let timer!: Promise<WebLocale | undefined>;
  await runWithLocale("en", async () => { timer = new Promise(resolve => setTimeout(() => resolve(pageLocale()), 10)); });
  assert.equal(await timer, "en");
  assert.equal(runBackgroundWork("zh", () => pageLocale()), undefined, "background work gives no page");
  assert.equal(runWithLocale("en", () => runBackgroundWork("zh", () => pageLocale())), "en");
});
