import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionAudience, type ActionCallContext, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { formActions, FORM_ACTION_PERMISSIONS, createFormActionHandlers, formResultsCsv, openFormStore } from "@molis-ai/molis-work-plugin-form";
import { datasetActions, createDatasetActionHandlers, openDatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { lingguangActions, createLingguangActionHandlers, openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { pagesActions, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { pptActions, PPT_ACTION_PERMISSIONS, createPptActionHandlers, openPptStore } from "@molis-ai/molis-work-plugin-ppt";
import { createWorkflowContentPorts } from "@molis-ai/molis-work-plugin-workflows";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";

const permissions = [...new Set([...NATIVE_CONTENT_PERMISSIONS, ...PAGES_ACTION_PERMISSIONS, ...FORM_ACTION_PERMISSIONS, ...PPT_ACTION_PERMISSIONS])];
async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "document-plugins-limits-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ project_id: ref.project_id, title: "Documents", actor_id: "owner", idempotency_key: "init" }));
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions };
  const client = host.actionClient(ref);
  const as = (audience: ActionAudience) => bindActionClient(client, () => ({ ...caller, audience }));
  return { home, host, ref, caller, client, bound: as("user"), as };
}
const payload = (title: string, body: string) => ({ title, body, url: null, source: null, feed_item_id: null });

test("a workflow hand-off past a receiver's limits is cut to fit instead of being refused on every retry", async t => {
  const f = await fixture(t);
  const ports = createWorkflowContentPorts(f.as("workflow")), receive = (...args: Parameters<typeof ports.receive>) => ports.receive(...args);
  // A long article headline: Pages takes titles up to 80 characters.
  const headline = "An unusually descriptive English article headline that easily runs past eighty characters in length";
  assert.ok(headline.length > 80);
  const page = await receive("pages", payload(headline, "the body"), { instance_id: "run-1", step: 1 });
  const stored = (await f.bound.invoke(pagesActions.get, { id: page.item_id })).document;
  assert.equal(stored.title, headline.slice(0, 80));
  assert.match(JSON.stringify(stored.body), /the body/);
  // Form: a title past 80 and a list past the 40 questions a form holds.
  const list = Array.from({ length: 45 }, (_, index) => `- 问题 ${index + 1}？`).join("\n");
  const form = await receive("form", payload("T".repeat(81), list), { instance_id: "run-2", step: 1 });
  const made = (await f.bound.invoke(formActions.get, { id: form.item_id })).form;
  assert.equal(made.title, "T".repeat(80));
  assert.equal(made.questions.length, 40);
  assert.equal(made.questions[0]!.title, "问题 1？");
  // The same delivery is still one form.
  assert.equal((await receive("form", payload("T".repeat(81), list), { instance_id: "run-2", step: 1 })).item_id, form.item_id);
});

test("a form submission's source comes from the call, not from the input: only a user's fill page records fill", async t => {
  const f = await fixture(t);
  let { form } = await f.bound.invoke(formActions.create, { title: "问卷" });
  form = (await f.bound.invoke(formActions.update, { id: form.id, questions: [{ id: "q", type: "text", title: "Q?" }], expected_version: form.version })).form;
  form = (await f.bound.invoke(formActions.publish, { id: form.id, expected_version: form.version })).form;
  const submit = async (audience: ActionAudience, source?: "preview" | "fill") =>
    (await f.as(audience).invoke(formActions.submit, { id: form.id, answers: { q: `${audience}-${source ?? "none"}` }, ...(source ? { source } : {}) })).submission.source;
  assert.equal(await submit("user", "fill"), "fill", "the fill page in the workbench names itself");
  assert.equal(await submit("user", "preview"), "preview");
  assert.equal(await submit("user"), "preview");
  for (const audience of ["agent", "mcp", "workflow"] as const) {
    assert.equal(await submit(audience, "fill"), audience, `${audience} cannot label its answers as fill-page answers`);
    assert.equal(await submit(audience, "preview"), audience);
    assert.equal(await submit(audience), audience);
  }
  const submissions = (await f.bound.invoke(formActions.results, { id: form.id })).submissions;
  assert.deepEqual(submissions.map(submission => submission.source).sort(), ["agent", "agent", "agent", "fill", "mcp", "mcp", "mcp", "preview", "preview", "workflow", "workflow", "workflow"]);
  // Every source has a name in the exported table.
  const csv = formResultsCsv(form, submissions);
  assert.ok(!csv.includes("undefined"), csv);
  for (const label of ["本机填写页", "试填", "助理提交", "外部工具提交", "工作流提交"]) assert.ok(csv.includes("," + label + ","), label);
  // A stopped form still refuses what claims to be the fill page; the claim cannot be made by an agent.
  await f.bound.invoke(formActions.close, { id: form.id });
  await assert.rejects(f.bound.invoke(formActions.submit, { id: form.id, answers: { q: "late" }, source: "fill" }), { code: "form.closed" });
});

/** What the host does for a model call: resolve the runtime (slow), run `beforeDispatch` if one was given, then send. */
function hostModel(state: { revoked: boolean; dispatched: number; sawBeforeDispatch: unknown[] }, reply: string) {
  return async (_prompt: unknown, options?: { beforeDispatch?: () => Promise<void> }) => {
    state.revoked = true; // the grant is revoked while the runtime is being resolved
    state.sawBeforeDispatch.push(typeof options?.beforeDispatch);
    await options?.beforeDispatch?.();
    state.dispatched++;
    return reply;
  };
}
const revocable = (state: { revoked: boolean }, audience: ActionAudience = "agent"): ActionExecutionContext => ({ actor_id: "agent-1", project_id: "p", audience, permissions: [],
  beforeEffect: async () => { if (state.revoked) throw Object.assign(new Error("grant revoked"), { code: "actions.forbidden" }); } });
const handle = (handlers: ActionHandlerBinding[], capabilityId: string) => handlers.find(handler => handler.capability_id === capabilityId)!;

test("AI actions of Form, Dataset, PPT and 灵光 recheck the grant right before the model request", async t => {
  const home = await mkdtemp(join(tmpdir(), "document-plugins-dispatch-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const forms = openFormStore(home), datasets = openDatasetStore(home), decks = openPptStore(home), sparks = openLingguangStore(home);
  t.after(() => { forms.close(); datasets.close(); decks.close(); sparks.close(); });
  const form = forms.create({ project_id: "p", title: "F" }), dataset = datasets.create({ project_id: "p", title: "D" }), deck = decks.create({ project_id: "p", title: "P" });
  const spark = sparks.create({ project_id: "p", title: "S", body: "b" }), conversation = sparks.openConversation([spark.id], "p").conversation;
  const cases: Array<{ name: string; run: (state: ReturnType<typeof newState>) => Promise<unknown>; unchanged: () => unknown }> = [
    { name: "form.questions.ai", unchanged: () => forms.get(form.id, "p").questions.length,
      run: state => handle(createFormActionHandlers({ withStore: run => run(forms), modelAvailability: () => ({ available: true }), completeText: hostModel(state, "题目？") }), formActions.generateAi.capability_id)
        .handle(revocable(state), { id: form.id, prompt: "加一题" }) },
    { name: "dataset.columns.ai", unchanged: () => datasets.get(dataset.id, "p").columns.length,
      run: state => handle(createDatasetActionHandlers({ withStore: run => run(datasets), modelAvailability: () => ({ available: true }), completeText: hostModel(state, "列") }), datasetActions.generateAi.capability_id)
        .handle(revocable(state), { id: dataset.id, prompt: "加一列" }) },
    { name: "ppt.outline_ai", unchanged: () => decks.get(deck.id, "p").version,
      run: state => handle(createPptActionHandlers({ withStore: run => run(decks), modelAvailability: () => ({ available: true }), completeText: hostModel(state, "## 一页\n- 要点") }), pptActions.outlineAi.capability_id)
        .handle(revocable(state), { id: deck.id, text: "整理" }) },
    { name: "lingguang.conversation.message", unchanged: () => sparks.conversation(conversation.id, "p").messages.length,
      run: state => handle(createLingguangActionHandlers({ withStore: run => run(sparks), modelAvailability: () => ({ available: true }), completeText: hostModel(state, "回复") }), lingguangActions.message.capability_id)
        .handle(revocable(state, "mcp"), { id: conversation.id, body: "hi" }) },
  ];
  function newState() { return { revoked: false, dispatched: 0, sawBeforeDispatch: [] as unknown[] }; }
  for (const item of cases) await t.test(item.name, async () => {
    const before = item.unchanged(), state = newState();
    await assert.rejects(item.run(state), { code: "actions.forbidden" });
    assert.deepEqual(state.sawBeforeDispatch, ["function"], "the host is handed the authority recheck to run right before it sends");
    assert.equal(state.dispatched, 0, "nothing was sent to the model after the revoke");
    assert.equal(item.unchanged(), before, "nothing was written");
  });
});

test("extracting tasks again adds no card for a task item longer than the card title", async t => {
  const f = await fixture(t);
  const task = "Follow up with the vendor about the revised contract terms and the delivery schedule for next quarter";
  assert.ok(task.length > 80);
  const item = (text: string) => ({ type: "task_item", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const { document } = await f.bound.invoke(pagesActions.create, { title: "Tasks", body: { type: "doc", content: [{ type: "task_list", content: [item(task), item("short task")] }] } });
  const cards = async () => (await f.bound.invoke(pagesActions.get, { id: document.id })).document.body.content!.filter(node => node.type === "task_card").length;
  assert.equal((await f.bound.invoke(pagesActions.extract, { id: document.id })).cards, 2);
  for (let run = 0; run < 2; run++) assert.equal((await f.bound.invoke(pagesActions.extract, { id: document.id })).cards, 0, `extract again #${run + 1}`);
  assert.equal(await cards(), 2);
});

test("an outline for a deck that already has 40 pages is refused before anything is written or asked of the model", async t => {
  const f = await fixture(t);
  const { presentation } = await f.bound.invoke(pptActions.create, { title: "Deck" });
  const full = (await f.bound.invoke(pptActions.update, { id: presentation.id, slides: Array.from({ length: 40 }, (_, index) => ({ title: "S" + index, bullets: ["b"] })) })).presentation;
  const state = { revoked: false, dispatched: 0, sawBeforeDispatch: [] as unknown[] };
  const store = openPptStore(f.home);
  t.after(() => store.close());
  const handlers = createPptActionHandlers({ withStore: run => run(store), modelAvailability: () => ({ available: true }), completeText: hostModel(state, "## New\n- point") });
  const caller = { ...f.caller, beforeEffect: async () => {} } as ActionExecutionContext;
  await assert.rejects(f.bound.invoke(pptActions.outline, { id: full.id, text: "## New\n- point" }), { code: "ppt.invalid" });
  await assert.rejects(handle(handlers, pptActions.outlineAi.capability_id).handle(caller, { id: full.id, text: "new" }), { code: "ppt.invalid" });
  assert.equal(state.dispatched, 0, "no model call is spent on an outline that cannot be added");
  const after = (await f.bound.invoke(pptActions.get, { id: full.id })).presentation;
  assert.equal(after.version, full.version, "a refused outline is not a new version");
  assert.equal(after.slides.length, 40);
  // Replacing still works on a full deck, and a deck with room takes as many pages as fit.
  const replaced = await f.bound.invoke(pptActions.outline, { id: full.id, text: "## Only\n- one", replace: true });
  assert.equal(replaced.slide_count, 1);
  const nearly = (await f.bound.invoke(pptActions.update, { id: full.id, slides: Array.from({ length: 38 }, (_, index) => ({ title: "S" + index, bullets: ["b"] })) })).presentation;
  const appended = await f.bound.invoke(pptActions.outline, { id: nearly.id, text: "## A\n- 1\n## B\n- 2\n## C\n- 3" });
  assert.equal(appended.slide_count, 2);
  assert.equal(appended.presentation.slides.length, 40);
});
