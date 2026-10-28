import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPluginDatabase } from "@molis-ai/molis-work-app-local-host";
import { IssueStore, IssueCaptures, ISSUES_DATABASE, issuesActions } from "@molis-ai/molis-work-plugin-issues";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
const caller: ActionExecutionContext = { actor_id: "owner", project_id: null, audience: "agent", permissions: ["issues:read", "issues:write"], beforeEffect: async () => {} };
const image = { name: "截图.png", data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=" };

test("ISSUE-14 ISSUE-15 drafts preserve six images and original words; concurrent confirmation creates exactly once", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-capture-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner"), drafts = new IssueCaptures(store), draft_id = crypto.randomUUID();
  const original = { draft_id, description: "  切换页面以后，输入没了。\n", images: Array.from({ length: 6 }, (_, index) => ({ ...image, name: `${index}.png` })) };
  await drafts.prepare(original, caller); assert.equal(store.list({}).items.length, 0);
  const capture = { draft_id, title: "切换页面后输入内容丢失", type: "bug" as const };
  const result = await Promise.all([drafts.capture(capture, caller), drafts.capture(capture, caller)]);
  assert.equal(result[0]!.id, result[1]!.id); assert.equal(store.list({}).items.length, 1);
  const saved = store.read(draft_id); assert.deepEqual(saved.images, original.images); assert.equal(saved.description, original.description);
  assert.equal(saved.title, capture.title); assert.equal(saved.entered_via, "assistant");
  assert.equal((await drafts.capture(capture, caller)).version, 1);
  assert.deepEqual(await drafts.cancel(draft_id, caller), { saved_id: draft_id });
  assert.deepEqual(issuesActions.prepare.action.audiences, ["user"]); assert.deepEqual(issuesActions.cancel.action.audiences, ["user"]);
});

test("ISSUE-15 cancelling while confirmation waits or restarting an activation rejects the stale draft", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-cancel-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner"), drafts = new IssueCaptures(store), draft_id = crypto.randomUUID();
  await drafts.prepare({ draft_id, description: "原文", images: [image] }, caller);
  const waiting = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  const capture = { draft_id, title: "建议标题", type: "experience" as const };
  const pending = drafts.capture(capture, { ...caller, beforeEffect: async () => { entered.resolve(); await waiting.promise; } });
  const rejected = assert.rejects(pending, { code: "actions.conflict" });
  await entered.promise; await drafts.cancel(draft_id, caller); waiting.resolve(); await rejected;
  assert.equal(store.list({}).items.length, 0);
  await drafts.prepare({ draft_id: crypto.randomUUID(), description: "重新输入" }, caller);
  await assert.rejects(new IssueCaptures(store).capture(capture, caller), { code: "actions.conflict" });
  assert.equal(db.client.get("SELECT count(*) AS n FROM issues")!.n, 0);
});

test("ISSUE-36 ISSUE-39 a capture always creates the draft's record and keeps the page the person reported", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-capture-page-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner"), drafts = new IssueCaptures(store);
  const existing = await store.create({ title: "已有记录", type: "experience", description: "原文" }, { ...caller, audience: "user" });
  const draft_id = crypto.randomUUID(), page = { url: "/projects/p-1/?plugin=goals", title: "Goals · Molis" };
  await drafts.prepare({ draft_id, description: "点保存没反应", page }, caller);
  const saved = await drafts.capture({ draft_id, title: "Goals 里点保存没有反应", type: "bug" }, { ...caller, page_context: { url: null, title: "Issue", provenance: "client_reported" } });
  assert.equal(saved.id, draft_id); assert.deepEqual(saved.context.page, { ...page, provenance: "client_reported" });
  assert.deepEqual(store.read(existing.id), existing, "a capture never touches another record");
  // The contract no longer carries an edit target: a draft can only become a new record, so its undo can only take that back.
  const prepare = issuesActions.prepare, schema = prepare.action.input_schema as { properties: Record<string, unknown> };
  assert.equal(prepare.version, 3); assert.equal(schema.properties.target, undefined); assert.ok(schema.properties.page);
  await assert.rejects(drafts.prepare({ draft_id: crypto.randomUUID(), description: "x", page: { url: "x".repeat(501), title: null } }, caller), { code: "actions.input_invalid" });
});

test("ISSUE-37 drafts left behind by a page that is gone never lock the person out: the oldest idle one makes room", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-drafts-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner"), drafts = new IssueCaptures(store);
  const ids = Array.from({ length: 9 }, () => crypto.randomUUID());
  for (const [index, draft_id] of ids.entries()) { await drafts.prepare({ draft_id, description: `第 ${index + 1} 条` }, caller); await new Promise(done => setTimeout(done, 2)); }
  await assert.rejects(drafts.capture({ draft_id: ids[0]!, title: "最早的一条", type: "bug" }, caller), { code: "actions.conflict" }, "the oldest draft made room");
  for (const draft_id of ids.slice(1)) assert.equal((await drafts.capture({ draft_id, title: "仍然可以保存", type: "bug" }, caller)).id, draft_id);
  assert.equal(store.list({}).items.length, 8);
  // A saved draft no longer counts; the person can keep recording.
  await drafts.prepare({ draft_id: crypto.randomUUID(), description: "第 10 条" }, caller);
});

test("ISSUE-38 discard takes back only a record nobody changed since it was made", async t => {
  const home = await mkdtemp(join(tmpdir(), "issue-discard-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const store = new IssueStore(db.client, "owner");
  const fresh = await store.create({ title: "刚记录", type: "bug", description: "原文" }, caller);
  assert.deepEqual(await store.discard({ id: fresh.id, expected_version: 1 }, caller), { id: fresh.id, discarded: true });
  await assert.rejects(store.discard({ id: fresh.id, expected_version: 1 }, caller), { code: "actions.missing" });
  const edited = await store.create({ title: "后来改过", type: "bug", description: "原文" }, caller);
  const changed = await store.update({ id: edited.id, expected_version: 1, title: "改过的标题" }, caller);
  await assert.rejects(store.discard({ id: edited.id, expected_version: 2 }, caller), { code: "actions.conflict" });
  await assert.rejects(store.discard({ id: edited.id, expected_version: 1 }, caller), { code: "actions.conflict" });
  assert.deepEqual(store.read(edited.id), changed);
  const blocked = await store.create({ title: "撤权后", type: "bug", description: "原文" }, caller);
  await assert.rejects(store.discard({ id: blocked.id, expected_version: 1 }, { ...caller, beforeEffect: async () => { throw new Error("revoked"); } }), /revoked/);
  assert.equal(store.read(blocked.id).version, 1);
  // Both ways of making a record say how it is taken back: the page's capture is not confirmed first, and the Assistant may make one directly when asked to.
  for (const definition of [issuesActions.capture, issuesActions.create]) {
    assert.deepEqual(definition.action.undo, { capability_id: "issues.discard", version: 1, input: { id: "id", expected_version: "version" } });
  }
  assert.deepEqual(issuesActions.discard.action.audiences, ["user", "agent"]); assert.equal(issuesActions.discard.action.effect, "write");
  assert.deepEqual(issuesActions.capture.action.audiences, ["user"], "a draft is the page's; the Assistant records with issues.create (ISSUE-53)");
});
test("RAC-1663 a page draft is counted in Unicode characters: 100000 🟢 of words with a 500-character address and a 200-character title are prepared and saved as they are; one more is refused and not held", async t => {
  // issues.prepare's schema (src/actions.ts) counts characters; one 🟢 is one character but two UTF-16 units.
  const home = await mkdtemp(join(tmpdir(), "issue-capture-wide-")), db = openPluginDatabase(home, ISSUES_DATABASE, () => {}, { install_id: "issues-test", installation_generation: "1" });
  t.after(async () => { db.close(); await rm(home, { recursive: true, force: true }); });
  const wide = (count: number) => "🟢".repeat(count);
  const store = new IssueStore(db.client, "owner"), drafts = new IssueCaptures(store), draft_id = crypto.randomUUID();
  const page = { url: "/" + wide(499), title: wide(200) };
  await drafts.prepare({ draft_id, description: wide(100_000), page }, caller);
  const saved = await drafts.capture({ draft_id, title: "很长的原话", type: "bug" }, caller);
  assert.equal(saved.description, wide(100_000), "the words are saved whole");
  assert.deepEqual(saved.context.page, { ...page, provenance: "client_reported" }, "the page is saved as the draft reported it");
  const refused = [
    { draft_id: crypto.randomUUID(), description: wide(100_001) },
    { draft_id: crypto.randomUUID(), description: "原话", page: { url: "/", title: wide(201) } },
    { draft_id: crypto.randomUUID(), description: "原话", page: { url: "/" + wide(500), title: null } },
  ];
  await assert.rejects(drafts.prepare(refused[0]!, caller), { code: "actions.input_invalid", message: "请描述问题或添加图片" }, "100001 characters of words is still past the limit");
  await assert.rejects(drafts.prepare(refused[1]!, caller), { code: "actions.input_invalid", message: "记录页面格式不正确" }, "a 201-character page title is still past the limit");
  await assert.rejects(drafts.prepare(refused[2]!, caller), { code: "actions.input_invalid", message: "记录页面格式不正确" }, "a 501-character page address is still past the limit");
  for (const draft of refused) await assert.rejects(drafts.capture({ draft_id: draft.draft_id, title: "不该保存", type: "bug" }, caller), { code: "actions.conflict" }, "a refused draft is not held");
  assert.equal(store.list({}).items.length, 1, "only the draft within the limits was saved");
});
