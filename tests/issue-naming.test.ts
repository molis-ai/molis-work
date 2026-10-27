import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPluginDatabase } from "@molis-ai/molis-work-app-local-host";
import { IssueStore, IssueCaptures, ISSUES_DATABASE, ISSUES_NAME, ISSUES_PLUGIN_ID, ISSUE_ASK, ISSUE_SCREENSHOTS_UNREAD, ISSUE_TITLE_RULES, ISSUE_TOO_LITTLE, ISSUE_TYPE_RULES,
  createIssuesPlugin, issueActionHandlers, issuesActions, issuesManifest, issuesSkills, titleLanguage, type Issue, type IssueListResult } from "@molis-ai/molis-work-plugin-issues";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginModelAvailability, PluginModelClient, PluginModelRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const caller: ActionExecutionContext = { actor_id: "owner", project_id: null, audience: "user", permissions: ["issues:read", "issues:write", "model:invoke"], beforeEffect: async () => {} };
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=";
const shots = [{ name: "保存.png", data_url: png }, { name: "列表.png", data_url: png }];

type Call = { prompt: InstructedPrompt; request: PluginModelRequest | undefined };
/** The Host's text model as the plugin sees it; each answer is what the model would have returned as JSON. */
function model(answer: (call: Call) => unknown, state: PluginModelAvailability = { available: true, runtime_label: "测试模型", vision: false }) {
  const calls: Call[] = [];
  let validate = () => {};
  const client: PluginModelClient = {
    choices: () => [],
    availability: () => state,
    async complete(prompt, request) {
      const call = { prompt, request }; calls.push(call);
      const value = await answer(call);
      return { text: JSON.stringify(value), value, validateResult: () => validate() };
    },
  };
  return { client, calls, onValidate: (check: () => void) => { validate = check; } };
}
const data = (call: Call) => JSON.parse(/\nBEGIN_ISSUE_[0-9a-f]+\n(.*)\nEND_ISSUE_/s.exec(call.prompt.data)![1]!) as { description: string; page: string | null; title_language: "zh" | "en"; screenshots: { count: number; attached: boolean } };

async function issues(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "issue-naming-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {});
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner");
  return { store, drafts: new IssueCaptures(store), count: () => Number(db.client.get("SELECT count(*) AS n FROM issues")!.n) };
}

test("PRR-08 the fixed follow-up question has an English entry", () => {
  const dictionary = readFileSync(new URL("../apps/workbench/src/i18n/renderer-gap-en.ts", import.meta.url), "utf8");
  assert.ok(dictionary.includes(JSON.stringify(ISSUE_ASK)), "the English dictionary carries the exact fixed question");
});

test("ISSUE-50 one bounded model call names a page draft and saves it once: the words and screenshots unchanged, the writer from the call", async t => {
  const { store, drafts, count } = await issues(t), draft_id = crypto.randomUUID(), page = { url: "/projects/p-1/?plugin=goals", title: "Goals · Molis" };
  await drafts.prepare({ draft_id, description: "  点保存没反应\n", images: shots, page }, caller);
  // The answer may carry anything; only a title and a type are taken from it.
  const fake = model(() => ({ status: "named", title: " Goals 里点保存没有反应 ", type: "bug", submitter_id: "model", description: "改写过的话", images: [] }));
  const order: string[] = [];
  fake.onValidate(() => order.push(`validate:${count()}`));
  const result = await drafts.name(draft_id, { ...caller, beforeEffect: async () => { order.push("beforeEffect"); } }, fake.client);
  assert.equal(result.status, "saved"); const saved = (result as { issue: Issue }).issue;
  assert.deepEqual([saved.id, saved.title, saved.type, saved.description, saved.entered_via, saved.submitter_id], [draft_id, "Goals 里点保存没有反应", "bug", "  点保存没反应\n", "assistant", "owner"]);
  assert.deepEqual(store.read(draft_id).images, shots, "the screenshots are the person's, byte for byte and in order");
  assert.deepEqual(saved.context.caller, { actor_id: "owner", audience: "user" }); assert.deepEqual(saved.context.page, { ...page, provenance: "client_reported" });
  // The answer is checked once more inside the write, after the last beforeEffect and before anything is stored.
  assert.deepEqual(order.slice(-2), ["beforeEffect", "validate:0"]); assert.equal(count(), 1);
  // Issue's own registered instruction, the words as fenced data, and a bounded JSON call.
  const [call] = fake.calls;
  assert.equal(call!.prompt.instruction.prompt_id, ISSUES_NAME.prompt_id); assert.equal(call!.prompt.instruction.owner_id, ISSUES_PLUGIN_ID);
  assert.deepEqual(data(call!), { description: "  点保存没反应\n", page: "Goals · Molis", title_language: "zh", screenshots: { count: 2, attached: false } });
  assert.deepEqual({ ...call!.request, signal: undefined }, { output: "json", timeout_ms: 90_000, max_output_tokens: 4_000, signal: undefined });
  // Naming it again finds the record; the model is not asked twice.
  assert.deepEqual(await drafts.name(draft_id, caller, fake.client), { status: "saved", issue: saved }); assert.equal(fake.calls.length, 1); assert.equal(count(), 1);
});

test("ISSUE-50 screenshots go to the model only when the model in use declares that it reads images; the words alone still go on without them", async t => {
  const { drafts } = await issues(t);
  for (const vision of [true, false, undefined]) for (const description of ["", "列表里的按钮显示错位"]) {
    if (description === "" && vision !== true) continue; // screenshots alone for a model that cannot read them: the next test
    const draft_id = crypto.randomUUID();
    await drafts.prepare({ draft_id, description, images: shots }, caller);
    const fake = model(() => ({ status: "named", title: "列表截图里的按钮显示错位", type: "bug" }), { available: true, ...(vision === undefined ? {} : { vision }) });
    assert.equal((await drafts.name(draft_id, caller, fake.client)).status, "saved");
    const [call] = fake.calls;
    assert.equal(fake.calls.length, 1, "one call whatever the model reads");
    assert.equal(data(call!).screenshots.attached, vision === true, String(vision)); assert.equal(data(call!).screenshots.count, 2);
    if (vision !== true) { assert.equal(call!.request!.images, undefined); continue; }
    const bytes = Buffer.from(png.slice(png.indexOf(",") + 1), "base64");
    assert.deepEqual(call!.request!.images!.map(image => [image.label, Buffer.from(image.bytes).equals(bytes)]), [["截图 1", true], ["截图 2", true]]);
  }
});

test("ISSUE-50 screenshots alone for a model not declared to read images: the model is not asked, the one fixed question comes back, nothing is written", async t => {
  const { store, drafts, count } = await issues(t);
  // It says what happened, why and what to do, in one line the page can show as a question.
  for (const part of ["未声明能看图", "已设为不能看图", "截图没有交给它", "写一句话", "设置 → 模型 → 供应商的模型列表", "能看图并保存"]) assert.ok(ISSUE_SCREENSHOTS_UNREAD.includes(part), part);
  assert.ok(ISSUE_SCREENSHOTS_UNREAD.length <= 200 && !/[\r\n]/.test(ISSUE_SCREENSHOTS_UNREAD));
  for (const vision of [false, undefined]) for (const description of ["", "  \n "]) {
    const draft_id = crypto.randomUUID(), state = { available: true as const, ...(vision === undefined ? {} : { vision }) };
    await drafts.prepare({ draft_id, description, images: shots }, caller);
    const off = model(() => assert.fail("a model that cannot read the screenshots is not asked about nothing but screenshots"), state);
    assert.deepEqual(await drafts.name(draft_id, caller, off.client), { status: "needs_input", question: ISSUE_SCREENSHOTS_UNREAD }, `${vision} ${JSON.stringify(description)}`);
    assert.equal(off.calls.length, 0); assert.equal(count(), 0);
    // A revoked or cancelled call gets no answer either, and a retired draft is gone.
    await assert.rejects(drafts.name(draft_id, { ...caller, beforeEffect: async () => { throw new Error("revoked"); } }, off.client), /revoked/);
    await drafts.cancel(draft_id, caller);
    await assert.rejects(drafts.name(draft_id, caller, off.client), { code: "actions.conflict" });
    // The editor's suggestion is the same: nothing to name from, nothing asked of the model, nothing written.
    const suggest = issueActionHandlers(store, off.client).find(binding => binding.capability_id === issuesActions.suggestName.capability_id)!;
    assert.deepEqual(await suggest.handle(caller, { description, images: [shots[0]] }), { status: "needs_input", question: ISSUE_SCREENSHOTS_UNREAD });
    assert.equal(off.calls.length, 0); assert.equal(count(), 0);
  }
  // A model that is not there at all is still reported as that, not as the screenshots.
  const draft_id = crypto.randomUUID(); await drafts.prepare({ draft_id, description: "", images: shots }, caller);
  const gone = model(() => assert.fail("an unavailable model is never asked"), { available: false, reason: "请先在「模型设置」里连接文字模型" });
  await assert.rejects(drafts.name(draft_id, caller, gone.client), { code: "actions.connection_required" });
  assert.equal(count(), 0);
});

test("ISSUE-50 ISSUE-51 the title's language is decided from the person's words and handed over as data; the instruction says to follow it", async t => {
  const { drafts } = await issues(t);
  // English: Latin letters and no CJK. Everything else, mixed words and words with none at all included, is Chinese.
  const languages: [string, "zh" | "en"][] = [["The save button does nothing on the Goals page", "en"], ["Export to CSV drops the last row.", "en"], ["点保存没反应", "zh"], ["保存按钮 does nothing on Goals", "zh"],
    ["Save 按钮没反应", "zh"], ["The list is empty。", "zh"], ["保存ボタンが効かない", "zh"], ["저장 버튼이 안 눌려요", "zh"], ["111", "zh"], ["", "zh"], ["  \n", "zh"]];
  for (const [description, language] of languages) assert.equal(titleLanguage(description), language, JSON.stringify(description));
  for (const [description, language] of languages.filter(([text]) => text.trim())) {
    const draft_id = crypto.randomUUID();
    await drafts.prepare({ draft_id, description, page: { url: "/projects/p-1/?plugin=goals", title: "Goals · Molis 体验验证" } }, caller);
    const fake = model(() => ({ status: "named", title: "标题", type: "bug" }));
    await drafts.name(draft_id, caller, fake.client);
    assert.equal(data(fake.calls[0]!).title_language, language, description); assert.equal(data(fake.calls[0]!).page, "Goals · Molis 体验验证");
  }
  // Screenshots alone are Chinese as well; the page's Chinese name does not make English words Chinese.
  const draft_id = crypto.randomUUID(); await drafts.prepare({ draft_id, description: "", images: shots }, caller);
  const reads = model(() => ({ status: "named", title: "截图里的报错", type: "bug" }), { available: true, vision: true });
  await drafts.name(draft_id, caller, reads.client); assert.equal(data(reads.calls[0]!).title_language, "zh");
  assert.ok(ISSUES_NAME.body.includes("title_language"));
  assert.ok(!ISSUES_NAME.body.includes("title 和 description 用同一种语言"), "the language is the data's, not a guess of the model's");
});

test("ISSUE-50 too little to go on, an unusable answer, no model, a refused write or a draft retired meanwhile write nothing", async t => {
  const { drafts, count } = await issues(t), draft_id = crypto.randomUUID();
  await drafts.prepare({ draft_id, description: "111" }, caller);
  // Too little: the one question comes back and the draft is kept for the person to add to.
  const asks = model(() => ({ status: "needs_input", question: ISSUE_ASK }));
  assert.deepEqual(await drafts.name(draft_id, caller, asks.client), { status: "needs_input", question: ISSUE_ASK }); assert.equal(count(), 0);
  for (const answer of [{ status: "named", title: "", type: "bug" }, { status: "named", title: "标题", type: "question" }, { status: "named", title: "两行\n标题", type: "bug" },
    { status: "named", title: "长".repeat(201), type: "bug" }, { status: "needs_input" }, "保存按钮没反应", null]) {
    await assert.rejects(drafts.name(draft_id, caller, model(() => answer).client), { code: "issues.model_reply_invalid" }, JSON.stringify(answer));
  }
  const off = model(() => assert.fail("an unavailable model is never asked"), { available: false, reason: "请先在「模型设置」里连接文字模型" });
  await assert.rejects(drafts.name(draft_id, caller, off.client), { code: "actions.connection_required", message: "请先在「模型设置」里连接文字模型" });
  await assert.rejects(drafts.name(draft_id, caller, undefined), { code: "actions.connection_required" });
  const named = () => model(() => ({ status: "named", title: "点保存没有反应", type: "bug" }));
  // Revoked or cancelled after the model answered, and a model binding that changed under the call.
  await assert.rejects(drafts.name(draft_id, { ...caller, beforeEffect: async () => { throw new Error("revoked"); } }, named().client), /revoked/);
  const rebound = named(); rebound.onValidate(() => { throw new Error("model binding changed"); });
  await assert.rejects(drafts.name(draft_id, caller, rebound.client), /model binding changed/);
  assert.equal(count(), 0);
  // Retired while the model was answering: the answer arrives to nothing.
  const waiting = Promise.withResolvers<void>(), asked = Promise.withResolvers<void>();
  const late = model(async () => { asked.resolve(); await waiting.promise; return { status: "named", title: "点保存没有反应", type: "bug" }; });
  const pending = drafts.name(draft_id, caller, late.client);
  await asked.promise; await drafts.cancel(draft_id, caller); waiting.resolve();
  await assert.rejects(pending, { code: "actions.conflict" }); assert.equal(count(), 0);
});

test("ISSUE-50 a draft saved by hand while the model was answering is the result, never a second record", async t => {
  const { drafts, count } = await issues(t), draft_id = crypto.randomUUID();
  await drafts.prepare({ draft_id, description: "切换页面以后输入没了" }, caller);
  const waiting = Promise.withResolvers<void>(), asked = Promise.withResolvers<void>();
  const late = model(async () => { asked.resolve(); await waiting.promise; return { status: "named", title: "切换页面后输入丢失", type: "bug" }; });
  const pending = drafts.name(draft_id, caller, late.client);
  await asked.promise;
  const byHand = await drafts.capture({ draft_id, title: "我自己起的标题", type: "experience" }, caller);
  waiting.resolve();
  assert.deepEqual(await pending, { status: "saved", issue: byHand });
  assert.deepEqual([byHand.title, byHand.entered_via], ["我自己起的标题", "manual"]); assert.equal(count(), 1);
});

test("ISSUE-51 suggesting a name for a saved record's edit writes nothing", async t => {
  const { store, count } = await issues(t);
  const original = await store.create({ title: "旧标题", type: "feature", description: "原来的说明" }, caller);
  const fake = model(() => ({ status: "named", title: "补充后点保存没有反应", type: "bug" }), { available: true, vision: true });
  const suggest = issueActionHandlers(store, fake.client).find(binding => binding.capability_id === issuesActions.suggestName.capability_id)!;
  assert.deepEqual(await suggest.handle(caller, { description: "补充后保存没反应", images: [shots[0]], page: { title: "Issue" } }), { status: "named", title: "补充后点保存没有反应", type: "bug" });
  assert.deepEqual(data(fake.calls[0]!), { description: "补充后保存没反应", page: "Issue", title_language: "zh", screenshots: { count: 1, attached: true } });
  assert.deepEqual(store.read(original.id), original); assert.equal(count(), 1);
  // The words are checked as a capture's are, before the model is asked.
  await assert.rejects(suggest.handle(caller, { description: "  " }), { code: "actions.input_invalid" });
  await assert.rejects(suggest.handle(caller, { description: "x", images: [{ name: "a.gif", data_url: "data:image/gif;base64,R0lGOD" }] }), { code: "actions.input_invalid" });
  assert.equal(fake.calls.length, 1);
});

test("ISSUE-52 ISSUE-53 Issue's rules are written once: the naming instruction and the Assistant's method share them, and the method names no tool", () => {
  const [method] = issuesSkills;
  for (const line of [...ISSUE_TOO_LITTLE, ...ISSUE_TITLE_RULES, ...ISSUE_TYPE_RULES]) {
    assert.ok(ISSUES_NAME.body.includes(line), line); assert.ok(method!.body.includes(line), line);
  }
  // Carried by Issue's own definition, registered while it runs, so the person can read and edit it in “Prompt 与 Character” (PG-051).
  const definition = createIssuesPlugin();
  assert.deepEqual(definition.methods, issuesSkills);
  assert.deepEqual(definition.instructions?.map(prompt => `${prompt.owner_id}/${prompt.prompt_id}@${prompt.version}`), [`${ISSUES_PLUGIN_ID}/issues.name@1`]);
  assert.equal(method!.version, 11);
  for (const word of ["change-reversible", "change-capability", "read-capability", "find-capabilities", "suggest-action", "ask-user", "录入草稿", "待整理记录"]) assert.ok(!method!.body.includes(word), word);
  assert.ok(method!.body.includes("issues.create"));
});

test("ISSUE-50 ISSUE-51 only the person's page calls the naming actions, each one model call inside Issue's own action; the Assistant no longer saves page drafts", () => {
  const { nameDraft, suggestName, capture } = issuesActions;
  assert.deepEqual([nameDraft.capability_id, nameDraft.version, nameDraft.action.effect, nameDraft.action.audiences, nameDraft.action.permissions, nameDraft.action.scheduling],
    ["issues.name_draft", 1, "write", ["user"], ["issues:write", "model:invoke"], "concurrent"]);
  assert.deepEqual([suggestName.capability_id, suggestName.version, suggestName.action.effect, suggestName.action.audiences, suggestName.action.permissions, suggestName.action.scheduling],
    ["issues.suggest_name", 1, "read", ["user"], ["issues:read", "model:invoke"], "concurrent"]);
  // A metered model call is not a query that may be replayed: a command whose effect is read, as pages.ai is.
  assert.deepEqual([suggestName.operation, suggestName.action.kind, nameDraft.operation, nameDraft.action.kind], ["command", "operation", "command", "operation"]);
  assert.deepEqual(capture.action.audiences, ["user"], "only the page's manual save makes a record from a draft with a given name");
  assert.deepEqual(issuesManifest.permissions.find(row => row.permission === "model:invoke")?.required, false);
  for (const [route_id, path, permission] of [["issues.name_draft", "/name-draft", "issues:write"], ["issues.suggest_name", "/suggest-name", "issues:read"]]) {
    assert.deepEqual(issuesManifest.routes?.find(route => route.route_id === route_id), { route_id, method: "POST", path, permission });
  }
});

test("ISSUE-50 ISSUE-51 through the Host: the page's draft is named by the Host's text model and saved; a suggestion writes nothing; no model keeps the draft", { timeout: 60_000 }, async t => {
  const answers: string[] = [], prompts: string[] = [];
  const f = await serveHomeRuntime(t, { completeText: async prompt => { prompts.push(JSON.stringify(prompt)); return answers.shift() ?? assert.fail("no scripted answer"); } });
  const call = async <T>(path: string, body?: unknown) => {
    const response = await f.request(`/api/plugins/${ISSUES_PLUGIN_ID}/${path}`, body === undefined ? {} : { method: "POST", body });
    assert.equal(response.status, 200, await response.clone().text()); return await response.json() as T;
  };
  const draft_id = crypto.randomUUID();
  await call("prepare", { draft_id, description: "点保存没反应", page: { url: "/projects/p-1/", title: "Goals" } });
  answers.push('```json\n{"status":"named","title":"Goals 里点保存没有反应","type":"bug"}\n```');
  const saved = await call<{ status: string; issue: Issue }>("name-draft", { draft_id });
  assert.deepEqual([saved.status, saved.issue.id, saved.issue.title, saved.issue.entered_via, saved.issue.context.caller.audience], ["saved", draft_id, "Goals 里点保存没有反应", "assistant", "user"]);
  assert.ok(prompts[0]!.includes("点保存没反应")); assert.ok(prompts[0]!.includes("title_language"));
  const asked = crypto.randomUUID();
  await call("prepare", { draft_id: asked, description: "test" });
  answers.push(JSON.stringify({ status: "needs_input", question: ISSUE_ASK }));
  assert.deepEqual(await call("name-draft", { draft_id: asked }), { status: "needs_input", question: ISSUE_ASK });
  answers.push('{"status":"named","title":"重新整理后的标题","type":"experience"}');
  assert.deepEqual(await call("suggest-name", { description: "补充后保存没反应", page: { url: null, title: "Issue" } }), { status: "named", title: "重新整理后的标题", type: "experience" });
  const list = await call<IssueListResult>("list");
  assert.deepEqual(list.items.map(item => [item.id, item.version]), [[draft_id, 1]], "only the named draft became a record");

  // A Home without a text model says so in a way the page can read, and the draft stays for a manual save.
  const bare = await serveHomeRuntime(t, { completeText: null }), unnamed = crypto.randomUUID();
  const post = (path: string, body: unknown) => bare.request(`/api/plugins/${ISSUES_PLUGIN_ID}/${path}`, { method: "POST", body });
  assert.equal((await post("prepare", { draft_id: unnamed, description: "点保存没反应" })).status, 200);
  const refused = await post("name-draft", { draft_id: unnamed });
  assert.notEqual(refused.status, 200); assert.equal((await refused.json() as { code: string }).code, "actions.connection_required");
  assert.equal((await post("capture", { draft_id: unnamed, title: "点保存没有反应", type: "bug" })).status, 200);
});
