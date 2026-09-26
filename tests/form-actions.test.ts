import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { formActions as actions, FORM_ACTION_PERMISSIONS, openFormStore, runFormMcpTool } from "@molis-ai/molis-work-plugin-form";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";
async function fixture(t: test.TestContext, completeText: HostCompleteText | null = null) {
  const home = await mkdtemp(join(tmpdir(), "form-actions-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "legacy-board", projectId: "a" });
  await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: ref.board_id, title: "Form", actor_id: "owner", idempotency_key: "init" }));
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

test("Form all actions and ten legacy tools share original data, six question types and snapshot-backed submissions", async t => {
  const f = await fixture(t);
  const legacy = async (tool_id: string, args = {}) => JSON.parse(await runFormMcpTool(f.bound, { tool_id, arguments: args }));
  const catalog = await f.bound.discover();
  for (const action of Object.values(actions)) assert.ok(catalog.some(item => item.capability_id === action.capability_id));
  let { form } = await legacy("create", { title: "原问卷" }); const id = form.id;
  assert.equal((await legacy("list")).forms[0].id, id);
  await assert.rejects(f.client.invoke({ ...f.caller, project_id: "b" }, actions.list, {}), { code: "actions.scope_mismatch" });
  await assert.rejects(f.client.invoke({ ...f.caller, permissions: ["form:read"] }, actions.create, {}), { code: "actions.forbidden" });
  await assert.rejects(f.bound.invoke(actions.create, { project_id: "b" } as never), { code: "actions.input_invalid" });
  form = (await legacy("update", { id, questions, expected_version: form.version })).form;
  for (const invalid of [{ ...answers, text: "" }, { ...answers, singleChoice: "不在选项中" }, { ...answers, multiChoice: "是\n是" }, { ...answers, rating: "6" }, { ...answers, date: "2026-02-30" }, { ...answers, unknown: "不得静默丢弃" }]) {
    await assert.rejects(f.bound.invoke(actions.submit, { id, answers: invalid, expected_version: form.version }), { code: "form.invalid" });
  }
  assert.equal((await legacy("results", { id })).analysis.submission_count, 0);
  const input = { id, answers, expected_version: form.version, request_id: "first-submission" };
  const first = (await legacy("submit", input)).submission;
  assert.deepEqual(first.answers, answers); assert.equal(first.form_version, form.version);
  assert.equal(first.questions[0].title, "原问题");
  assert.deepEqual((await legacy("submit", input)).submission, first);
  await assert.rejects(f.bound.invoke(actions.submit, { ...input, answers: { ...answers, text: "不能换内容" } }), { code: "form.request_conflict" });
  form = (await legacy("update", { id, questions: [{ id: "replacement", title: "新问题" }], expected_version: form.version })).form;
  await assert.rejects(f.bound.invoke(actions.submit, { ...input, request_id: "stale-preview" }), { code: "form.conflict" });
  assert.deepEqual((await legacy("submit", input)).submission, first, "a completed request can recover even after the form changes");
  assert.equal((await legacy("results", { id })).submissions[0].questions[0].title, "原问题");
  const published = (await legacy("publish", { id, expected_version: form.version })).form;
  assert.equal(published.status, "published"); assert.ok(published.share_id);
  assert.equal((await legacy("publish", { id })).form.share_id, published.share_id);
  assert.equal((await legacy("generate", { id, prompt: "本地追加" })).form.questions.at(-1).title, "本地追加");
  const promoted = await legacy("promote", { id });
  await f.host.withProject(f.ref, runtime => {
    const artifact = runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.board_id, promoted.artifact)!;
    assert.equal(artifact.owner_actor_id, "owner"); assert.equal((artifact.payload as any).questions.length, 2);
    assert.equal((artifact.payload as any).answers, undefined);
  });
  const store = openFormStore(f.home);
  let foreign: string;
  try { foreign = store.create({ project_id: "b" }).id; assert.equal(store.listSubmissions(id, "a").length, 1); } finally { store.close(); }
  for (const definition of [actions.get, actions.results, actions.delete]) await assert.rejects(f.bound.invoke(definition, { id: foreign }), { code: "form.not_found" });
  await f.host.closeProject(f.ref);
  assert.deepEqual((await legacy("results", { id })).submissions[0], first);
  assert.equal((await legacy("get", { id })).form.share_id, published.share_id);
  await legacy("delete", { id }); assert.deepEqual((await legacy("list")).forms, []);
  const another = await fixture(t); assert.deepEqual((await another.bound.invoke(actions.list, {})).forms, []);
});

test("Form upgrades old submissions without inventing historical questions; deletion rolls back all rows on failure", async t => {
  const f = await fixture(t), db = openHomeSqliteDatabase(f.home, "form");
  try {
    db.exec(`CREATE TABLE forms (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL,
      share_id TEXT, questions_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL,
      artifact_id TEXT NOT NULL DEFAULT '', artifact_version INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE submissions (id TEXT PRIMARY KEY, form_id TEXT NOT NULL, answers_json TEXT NOT NULL, submitted_at TEXT NOT NULL);`);
    db.prepare("INSERT INTO forms (id,project_id,title,description,status,share_id,questions_json,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run("historical-form", "a", "Old form", "original description", "published", "original-share", "[]", "2025-01-01", "2025-01-01", 7);
    const form = {id:"historical-form"};
    db.prepare("INSERT INTO submissions (id, form_id, answers_json, submitted_at) VALUES (?, ?, ?, ?)").run("legacy", form.id, JSON.stringify({ "deleted-question": "old value" }), "2025-01-01T00:00:00Z");
    const old = (await f.bound.invoke(actions.results, { id: form.id })).submissions[0]!;
    const migrated = (await f.bound.invoke(actions.get, { id:form.id })).form;
    assert.equal(migrated.share_id,"original-share"); assert.equal(migrated.version,7); assert.equal(migrated.title,"Old form");
    assert.equal(old.questions, null); assert.equal(old.form_version, null); assert.deepEqual(old.answers, { "deleted-question": "old value" });
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
    assert.equal((runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.board_id, restored.artifact)!.payload as any).title, "Original snapshot");
    assert.equal(runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.board_id, { ...restored.artifact, version: 2 }), null);
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
