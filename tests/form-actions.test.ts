import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionAudience, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { formActions as actions, FORM_ACTION_PERMISSIONS, openFormStore } from "@molis-ai/molis-work-plugin-form";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";
async function fixture(t: test.TestContext, completeText: HostCompleteText | null = null) {
  const home = await mkdtemp(join(tmpdir(), "form-actions-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ project_id: ref.project_id, title: "Form", actor_id: "owner", idempotency_key: "init" }));
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: FORM_ACTION_PERMISSIONS };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  return { home, host, ref, caller, client, bound };
}
const questions = [
  { id: "text", type: "text" as const, title: "原问题", required: true },
  ...["singleChoice", "multiChoice", "dropdown"].map(type => ({ id: type, type: type as "singleChoice" | "multiChoice" | "dropdown", title: type, options: [{ id: "yes", label: "是" }, { id: "no", label: "否" }] })),
  { id: "rating", type: "rating" as const, title: "评分" }, { id: "date", type: "date" as const, title: "日期" },
];
const answers = { text: "第一份回答", singleChoice: "是", multiChoice: "是\n否", dropdown: "否", rating: "5", date: "2026-09-25" };

test("Form actions share original data, six question types and snapshot-backed submissions", async t => {
  const f = await fixture(t);
  const invoke = (key: keyof typeof actions, args: object = {}): Promise<any> => f.bound.invoke(actions[key] as never, args as never);
  const catalog = await f.bound.discover();
  for (const action of Object.values(actions)) assert.ok(catalog.some(item => item.capability_id === action.capability_id));
  let { form } = await invoke("create", { title: "原问卷" }); const id = form.id;
  assert.equal((await invoke("list")).forms[0].id, id);
  await assert.rejects(f.client.invoke({ ...f.caller, project_id: "b" }, actions.list, {}), { code: "actions.scope_mismatch" });
  await assert.rejects(f.client.invoke({ ...f.caller, permissions: ["form:read"] }, actions.create, {}), { code: "actions.forbidden" });
  await assert.rejects(f.bound.invoke(actions.create, { project_id: "b" } as never), { code: "actions.input_invalid" });
  form = (await invoke("update", { id, questions, expected_version: form.version })).form;
  for (const invalid of [{ ...answers, text: "" }, { ...answers, singleChoice: "不在选项中" }, { ...answers, multiChoice: "是\n是" }, { ...answers, rating: "6" }, { ...answers, date: "2026-02-30" }, { ...answers, unknown: "不得静默丢弃" }]) {
    await assert.rejects(f.bound.invoke(actions.submit, { id, answers: invalid, expected_version: form.version }), { code: "form.invalid" });
  }
  assert.equal((await invoke("results", { id })).analysis.submission_count, 0);
  const input = { id, answers, expected_version: form.version, request_id: "first-submission" };
  const first = (await invoke("submit", input)).submission;
  assert.deepEqual(first.answers, answers); assert.equal(first.form_version, form.version);
  assert.equal(first.questions[0].title, "原问题");
  assert.deepEqual((await invoke("submit", input)).submission, first);
  await assert.rejects(f.bound.invoke(actions.submit, { ...input, answers: { ...answers, text: "不能换内容" } }), { code: "form.request_conflict" });
  form = (await invoke("update", { id, questions: [{ id: "replacement", title: "新问题" }], expected_version: form.version })).form;
  await assert.rejects(f.bound.invoke(actions.submit, { ...input, request_id: "stale-preview" }), { code: "form.conflict" });
  assert.deepEqual((await invoke("submit", input)).submission, first, "a completed request can recover even after the form changes");
  assert.equal((await invoke("results", { id })).submissions[0].questions[0].title, "原问题");
  const published = (await invoke("publish", { id, expected_version: form.version })).form;
  assert.equal(published.status, "published"); assert.ok(published.share_id);
  assert.equal((await invoke("publish", { id })).form.share_id, published.share_id);
  assert.equal((await invoke("generate", { id, prompt: "本地追加" })).form.questions.at(-1).title, "本地追加");
  const promoted = await invoke("promote", { id });
  await f.host.withProject(f.ref, runtime => {
    const artifact = runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.project_id, promoted.artifact)!;
    // A pinned form belongs to the Home's person; the actor who pinned it is its producer.
    assert.equal(artifact.owner_actor_id, LOCAL_PERSON_ACTOR_ID); assert.equal(artifact.created_by, "owner"); assert.equal((artifact.payload as any).questions.length, 2);
    assert.equal((artifact.payload as any).answers, undefined);
  });
  const store = openFormStore(f.home);
  let foreign: string;
  try { foreign = store.create({ project_id: "b" }).id; assert.equal(store.listSubmissions(id, "a").length, 1); } finally { store.close(); }
  for (const definition of [actions.get, actions.results, actions.delete]) await assert.rejects(f.bound.invoke(definition, { id: foreign }), { code: "form.not_found" });
  await f.host.closeProject(f.ref);
  assert.deepEqual((await invoke("results", { id })).submissions[0], first);
  assert.equal((await invoke("get", { id })).form.share_id, published.share_id);
  await invoke("delete", { id }); assert.deepEqual((await invoke("list")).forms, []);
  const another = await fixture(t); assert.deepEqual((await another.bound.invoke(actions.list, {})).forms, []);
});

test("Form deletion rolls back all rows on failure", async t => {
  const f = await fixture(t), db = openHomeSqliteDatabase(f.home, "form");
  try {
    let { form } = await f.bound.invoke(actions.create, { title: "Old form" });
    form = (await f.bound.invoke(actions.update, { id: form.id, questions, expected_version: form.version })).form;
    await f.bound.invoke(actions.submit, { id: form.id, answers, expected_version: form.version, request_id: "kept-submission" });
    db.exec("CREATE TRIGGER fail_form_delete BEFORE DELETE ON forms BEGIN SELECT RAISE(ABORT, 'fixture delete failure'); END");
    await assert.rejects(f.bound.invoke(actions.delete, { id: form.id }), /fixture delete failure/);
    assert.equal((await f.bound.invoke(actions.results, { id: form.id })).submissions.length, 1);
    db.exec("DROP TRIGGER fail_form_delete");
    await f.bound.invoke(actions.delete, { id: form.id });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM submissions").get() as {n:number}).n, 0);
  } finally { db.close(); }
});

test("Form fixed publication survives partial success, actor isolation, restart and later edits", async t => {
  const f = await fixture(t); const { form } = await f.bound.invoke(actions.create, { title: "Original snapshot" });
  const db = openHomeSqliteDatabase(f.home, "form");
  try {
    db.exec("CREATE TRIGGER fail_form_publication BEFORE UPDATE OF artifact_version ON forms WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failure'); END");
    await assert.rejects(f.bound.invoke(actions.promote, { id: form.id }), /fixture association failure/);
    assert.equal((await f.bound.invoke(actions.get, { id: form.id })).form.publication_pending!.version, 1);
    await assert.rejects(f.bound.invoke(actions.delete, { id: form.id }), { code: "form.publication_pending" });
    await f.bound.invoke(actions.update, { id: form.id, title: "Later edit" });
    await assert.rejects(f.client.invoke({ ...f.caller, actor_id: "other" }, actions.promote, { id: form.id }), { code: "form.publication_owner" });
    db.exec("DROP TRIGGER fail_form_publication");
  } finally { db.close(); }
  await f.host.closeProject(f.ref);
  const restored = await f.bound.invoke(actions.promote, { id: form.id });
  assert.equal(restored.form.title, "Later edit"); assert.equal(restored.recovered, true); assert.equal(restored.artifact.version, 1);
  await f.host.withProject(f.ref, runtime => {
    assert.equal((runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.project_id, restored.artifact)!.payload as any).title, "Original snapshot");
    assert.equal(runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.project_id, { ...restored.artifact, version: 2 }), null);
  });
  assert.equal((await f.bound.invoke(actions.promote, { id: form.id })).artifact.version, 2);
});

for (const mode of ["missing", "failure", "empty", "cancel", "edit", "delete", "success"] as const) test(`Form explicit AI ${mode} preserves data and checks grants`, async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let calls = 0;
  const f = await fixture(t, mode === "missing" ? null : async prompt => {
    calls++; assert.match(prompt, /最常用的工具/);
    if (mode === "failure") throw new Error("Fixture model failure");
    if (mode === "empty") return " ";
    if (mode !== "success") { entered.resolve(); await release.promise; }
    return "你最常用的工具是什么？";
  });
  const { form } = await f.bound.invoke(actions.create, {});
  await f.bound.invoke(actions.generate, { id: form.id, prompt: "Local question" }); assert.equal(calls, 0);
  await assert.rejects(f.client.invoke({ ...f.caller, permissions: ["form:read", "form:write"] }, actions.generateAi, { id: form.id, prompt: "deny" }), { code: "actions.forbidden" });
  const controller = new AbortController();
  const promise = f.client.invoke({ ...f.caller, signal: controller.signal }, actions.generateAi, { id: form.id, prompt: "最常用的工具" });
  if (mode === "success") { assert.equal((await promise).form.questions.length, 2); return; }
  const rejected = assert.rejects(promise);
  if (["cancel", "edit", "delete"].includes(mode)) {
    await entered.promise;
    try {
      if (mode === "cancel") controller.abort();
      if (mode === "edit") await f.bound.invoke(actions.update, { id: form.id, title: "Concurrent edit" });
      if (mode === "delete") await f.bound.invoke(actions.delete, { id: form.id });
    } finally { release.resolve(); }
  }
  await rejected;
  const forms = (await f.bound.invoke(actions.list, {})).forms;
  assert.equal(forms.length, mode === "delete" ? 0 : 1);
  if (forms.length) assert.equal(forms[0]!.questions.length, 1);
});

test("a form that is not collecting takes no answer from an agent, MCP, a workflow or a plugin; only the person's own trial fill goes in", async t => {
  const f = await fixture(t);
  const as = (audience: ActionAudience) => bindActionClient(f.client, () => ({ ...f.caller, audience }));
  const outside = ["agent", "mcp", "workflow", "plugin"] as const;
  let { form } = await f.bound.invoke(actions.create, { title: "收集中才收" });
  const id = form.id;
  form = (await f.bound.invoke(actions.update, { id, questions: [{ id: "q", type: "text", title: "Q?" }], expected_version: form.version })).form;
  const stored = async () => (await f.bound.invoke(actions.results, { id })).submissions.map(submission => `${submission.source}:${submission.answers.q}`).sort();
  // Refused whatever source the input claims: the call's audience decides, the refusal says why and what to do, and nothing is written.
  const refuse = async (reason: RegExp, remedy: RegExp) => {
    for (const audience of outside) for (const claimed of [undefined, "preview", "fill"] as const) {
      const label = `${audience} claiming ${claimed ?? "nothing"}`;
      await assert.rejects(as(audience).invoke(actions.submit, { id, answers: { q: label }, ...(claimed ? { source: claimed } : {}) }), error => {
        assert.equal((error as { code?: string }).code, "form.closed", label);
        assert.match((error as Error).message, reason, label);
        assert.match((error as Error).message, remedy, label);
        return true;
      }, label);
    }
  };

  // A draft is not collecting yet.
  await refuse(/还没有开始收集答卷/u, /请本人先在问卷里开始收集/u);
  // The person's own trial fill, at the workbench, still goes in: it is how an author tries the form out.
  assert.equal((await f.bound.invoke(actions.submit, { id, answers: { q: "试填" } })).submission.source, "preview");
  assert.equal((await f.bound.invoke(actions.submit, { id, answers: { q: "再试填" }, source: "preview" })).submission.source, "preview");
  // The fill page is for collecting; the person's own page cannot use it on a form that is not.
  await assert.rejects(f.bound.invoke(actions.submit, { id, answers: { q: "填写页" }, source: "fill" }), { code: "form.closed", message: /还没有开始收集答卷/u });
  assert.deepEqual(await stored(), ["preview:再试填", "preview:试填"]);

  // Collecting: every source is taken, and recorded as the call's own.
  form = (await f.bound.invoke(actions.publish, { id, expected_version: form.version })).form;
  for (const audience of outside) assert.equal((await as(audience).invoke(actions.submit, { id, answers: { q: `收集中 ${audience}` } })).submission.source, audience);
  assert.equal((await f.bound.invoke(actions.submit, { id, answers: { q: "收集中 填写页" }, source: "fill" })).submission.source, "fill");

  // Collection stopped: the same refusal, with the way back; the answers already in stay.
  form = (await f.bound.invoke(actions.close, { id, expected_version: form.version })).form;
  await refuse(/已停止收集答卷/u, /请本人在问卷里重新开始收集/u);
  assert.equal((await f.bound.invoke(actions.submit, { id, answers: { q: "停止后试填" }, source: "preview" })).submission.source, "preview");
  await assert.rejects(f.bound.invoke(actions.submit, { id, answers: { q: "填写页" }, source: "fill" }), { code: "form.closed", message: /已停止收集答卷/u });

  // Starting again opens the form to every source again.
  await f.bound.invoke(actions.publish, { id, expected_version: form.version });
  for (const audience of outside) assert.equal((await as(audience).invoke(actions.submit, { id, answers: { q: `重新收集 ${audience}` } })).submission.source, audience);

  assert.deepEqual(await stored(), [
    "agent:收集中 agent", "agent:重新收集 agent", "fill:收集中 填写页", "mcp:收集中 mcp", "mcp:重新收集 mcp",
    "plugin:收集中 plugin", "plugin:重新收集 plugin", "preview:停止后试填", "preview:再试填", "preview:试填",
    "workflow:收集中 workflow", "workflow:重新收集 workflow",
  ].sort());
});

test("the store itself refuses every source but the trial fill while a form is not collecting", async t => {
  const home = await mkdtemp(join(tmpdir(), "form-collecting-")), store = openFormStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const draft = store.create({ project_id: "p", title: "F" });
  const form = store.update(draft.id, { questions: [{ id: "q", title: "Q?" }], expected_version: draft.version }, "p");
  const sources = ["fill", "agent", "mcp", "workflow", "plugin"] as const;
  const refused = (what: string) => { for (const source of sources) assert.throws(() => store.submit(form.id, { q: "x" }, "p", { source }), { name: "FormError", code: "form.closed" }, `${source} on a ${what} form`); };

  refused("draft");
  assert.equal(store.submit(form.id, { q: "a" }, "p", { source: "preview" }).source, "preview");
  assert.equal(store.submit(form.id, { q: "b" }, "p").source, "preview", "a call that names no source is the trial fill");
  store.publish(form.id, "p");
  for (const source of ["preview", ...sources] as const) assert.equal(store.submit(form.id, { q: source }, "p", { source }).source, source);
  store.closeCollection(form.id, "p");
  refused("stopped");
  assert.equal(store.submit(form.id, { q: "c" }, "p", { source: "preview" }).source, "preview");
  assert.equal(store.listSubmissions(form.id, "p").length, 2 + 6 + 1, "a refused call leaves no answer behind");
});
